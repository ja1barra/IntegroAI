// HubSpot OAuth (authorization-code flow). Secrets stay server-side.

import { createHash, randomBytes } from 'node:crypto'

export const READ_SCOPES = [
  'crm.objects.deals.read',
  'crm.objects.contacts.read',
  'crm.objects.companies.read',
  'crm.objects.owners.read',
  'crm.schemas.deals.read', // deal properties + pipelines metadata (verify per docs/revenue/hubspot-capabilities.md)
]
// Requested as *optional* scopes, so the read-only diagnosis still works when a
// customer declines them. Task creation needs contacts.write per the v3 tasks
// reference; deal property updates need deals.write.
export const WRITE_SCOPES = ['crm.objects.contacts.write', 'crm.objects.deals.write']

export const newState = () => randomBytes(32).toString('base64url')
export const hashState = s => createHash('sha256').update(s).digest('hex')

export function buildAuthorizeUrl({ config, state, includeWriteScopes }) {
  const u = new URL(config.hubspot.authorizeUrl)
  u.searchParams.set('client_id', config.hubspot.clientId)
  u.searchParams.set('redirect_uri', config.hubspot.redirectUri)
  u.searchParams.set('scope', READ_SCOPES.join(' '))
  if (includeWriteScopes) u.searchParams.set('optional_scope', WRITE_SCOPES.join(' '))
  u.searchParams.set('state', state)
  return u.toString()
}

async function tokenRequest(config, params, fetchImpl) {
  const res = await fetchImpl(`${config.hubspot.apiBase}/oauth/v1/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: config.hubspot.clientId, client_secret: config.hubspot.clientSecret, ...params }).toString(),
    signal: AbortSignal.timeout(15000),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const err = new Error(`HubSpot token endpoint ${res.status}${json?.status ? ` (${json.status})` : ''}`)
    err.status = res.status
    err.invalidGrant = res.status === 400 || res.status === 401 || /BAD_REFRESH_TOKEN|BAD_AUTH_CODE|invalid_grant/i.test(JSON.stringify(json))
    err.retryable = res.status >= 500 || res.status === 429
    throw err
  }
  if (!json.access_token || !json.refresh_token) throw new Error('HubSpot token response was missing tokens')
  return { accessToken: json.access_token, refreshToken: json.refresh_token, expiresAt: new Date(Date.now() + (Number(json.expires_in) || 1800) * 1000) }
}

export const exchangeCode = (config, code, fetchImpl = fetch) =>
  tokenRequest(config, { grant_type: 'authorization_code', redirect_uri: config.hubspot.redirectUri, code }, fetchImpl)

export const refreshTokens = (config, refreshToken, fetchImpl = fetch) =>
  tokenRequest(config, { grant_type: 'refresh_token', refresh_token: refreshToken }, fetchImpl)

/** Authoritative portal id + granted scopes for a fresh access token. */
export async function fetchTokenInfo(config, accessToken, fetchImpl = fetch) {
  const res = await fetchImpl(`${config.hubspot.apiBase}/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`HubSpot token introspection failed (${res.status})`)
  const j = await res.json()
  if (!j.hub_id) throw new Error('HubSpot token info did not include a portal id')
  return { portalId: String(j.hub_id), hubDomain: j.hub_domain ?? null, scopes: Array.isArray(j.scopes) ? j.scopes : [], userEmail: j.user ?? null }
}

/** Account defaults used to prefill onboarding (timezone / home currency). Best effort. */
export async function fetchAccountDefaults(config, accessToken, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${config.hubspot.apiBase}/account-info/v3/details`, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return {}
    const j = await res.json()
    return { timezone: j.timeZone ?? null, currency: j.companyCurrency ?? j.currency ?? null }
  } catch { return {} }
}

/** What the granted scopes allow. Never claims more than the token has. */
export function capabilitiesFromScopes(scopes) {
  const has = s => scopes.includes(s)
  return {
    read_deals: has('crm.objects.deals.read'),
    read_contacts: has('crm.objects.contacts.read'),
    read_companies: has('crm.objects.companies.read'),
    read_owners: has('crm.objects.owners.read'),
    read_schemas: has('crm.schemas.deals.read'),
    write_tasks: has('crm.objects.contacts.write'),   // per v3 tasks create reference (verify)
    write_deals: has('crm.objects.deals.write'),
  }
}

// The redirect after OAuth must be a same-app relative path.
export function safeRedirectPath(p) {
  return typeof p === 'string' && /^\/[A-Za-z0-9\-._~/?=&%#]*$/.test(p) && !p.startsWith('//') ? p : '/'
}
