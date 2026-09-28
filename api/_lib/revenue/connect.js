// HubSpot connection lifecycle for Integro customers (OAuth authorization code).
// Independent from any developer/personal HubSpot connector and from private-app tokens.

import { HttpError, badRequest, forbidden, sanitizeError } from '../http.js'
import { requireCan } from '../auth.js'
import { encrypt, decrypt } from '../crypto.js'
import { newState, hashState, buildAuthorizeUrl, exchangeCode, fetchTokenInfo, fetchAccountDefaults, capabilitiesFromScopes, safeRedirectPath, READ_SCOPES, WRITE_SCOPES } from '../hubspot/oauth.js'

const ATTEMPT_TTL_SECONDS = 600

export function oauthConfigured(config) {
  const h = config.hubspot
  return Boolean(h.clientId && h.clientSecret && h.redirectUri && config.encryption.key)
}

export async function startConnect({ store, config, ctx, redirectTo, flags }) {
  requireCan(ctx, 'manage_connection')
  if (!oauthConfigured(config)) throw new HttpError(503, 'not_configured', 'HubSpot OAuth is not configured on this deployment (HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET / HUBSPOT_REDIRECT_URI / CREDENTIALS_ENCRYPTION_KEY)')
  const state = newState()
  const [live] = await store.select('crm_connections', { where: { organization_id: ctx.orgId, status: { neq: 'disconnected' } }, columns: 'id' })
  const includeWrite = flags.hubspot_write_actions_enabled || config.hubspotWriteScopeRequested
  await store.rpc('rv_create_oauth_attempt', {
    _state_hash: hashState(state), _user: ctx.userId, _org: ctx.orgId, _target: live?.id ?? null,
    _redirect: safeRedirectPath(redirectTo), _scopes: includeWrite ? [...READ_SCOPES, ...WRITE_SCOPES] : READ_SCOPES, _ttl_seconds: ATTEMPT_TTL_SECONDS,
  })
  return { authorize_url: buildAuthorizeUrl({ config, state, includeWriteScopes: includeWrite }), expires_in: ATTEMPT_TTL_SECONDS }
}

const back = (config, path, params) => {
  const u = new URL((config.appBaseUrl ?? '') + safeRedirectPath(path), config.appBaseUrl || 'http://localhost')
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
  return config.appBaseUrl ? u.toString() : u.pathname + u.search
}

/** Never throws: always yields a redirect back into the app with a machine-readable result. */
export async function handleCallback({ store, config, query, fetchImpl = fetch, log = () => {}, requestId }) {
  const fail = (reason, path = '/') => ({ redirect: back(config, path, { hubspot: 'error', reason }) })
  if (query.error) return fail(query.error === 'access_denied' ? 'denied' : 'provider_error')
  const state = typeof query.state === 'string' ? query.state : '', code = typeof query.code === 'string' ? query.code : ''
  if (!state || !code || state.length > 200 || code.length > 2000) return fail('invalid_request')
  if (!oauthConfigured(config)) return fail('not_configured')

  let attempt
  try {
    const rows = await store.rpc('rv_consume_oauth_attempt', { _state_hash: hashState(state) })
    attempt = Array.isArray(rows) ? rows[0] : rows
  } catch { return fail('unavailable') }
  if (!attempt?.organization_id) return fail('invalid_state') // unknown, expired or already used (replay)
  const path = attempt.redirect_to

  try {
    // the initiating user must still be an admin of that org at callback time
    const [m] = await store.select('organization_members', { where: { organization_id: attempt.organization_id, user_id: attempt.user_id, status: 'active' } })
    if (!m || m.role !== 'admin') return fail('forbidden', path)

    const tokens = await exchangeCode(config, code, fetchImpl)
    const info = await fetchTokenInfo(config, tokens.accessToken, fetchImpl)
    if (!info.scopes.includes('crm.objects.deals.read')) return fail('missing_scopes', path)
    const caps = capabilitiesFromScopes(info.scopes)
    const a = encrypt(tokens.accessToken, config.encryption), r = encrypt(tokens.refreshToken, config.encryption)
    const connId = await store.rpc('rv_activate_hubspot_connection', {
      _org: attempt.organization_id, _user: attempt.user_id, _portal: info.portalId, _scopes: info.scopes, _capabilities: caps,
      _access_enc: a.value, _refresh_enc: r.value, _expires_at: tokens.expiresAt.toISOString(), _key_version: a.keyVersion, _target: attempt.target_connection_id,
    })
    const defaults = await fetchAccountDefaults(config, tokens.accessToken, fetchImpl)
    const [s] = await store.select('revenue_settings', { where: { organization_id: attempt.organization_id } })
    const patch = {}
    if (!s?.timezone && defaults.timezone) patch.timezone = defaults.timezone
    if (!s?.currency && /^[A-Z]{3}$/.test(defaults.currency ?? '')) patch.currency = defaults.currency
    if (Object.keys(patch).length) await store.update('revenue_settings', { organization_id: attempt.organization_id }, patch)
    await store.rpc('rv_audit', { _org: attempt.organization_id, _actor_type: 'user', _actor: attempt.user_id, _event: 'hubspot.connected', _entity_type: 'crm_connection', _entity_id: connId, _before: null, _after: { portal_id: info.portalId, scopes: info.scopes }, _request_id: requestId ?? null })
    return { redirect: back(config, path, { hubspot: 'connected' }) }
  } catch (e) {
    const msg = String(e?.message ?? '')
    if (/portal_in_use/.test(msg)) return fail('portal_in_use', path)
    if (/portal_mismatch|target_mismatch/.test(msg)) return fail('portal_mismatch', path)
    log('error', 'hubspot.callback_failed', { org_id: attempt.organization_id, request_id: requestId, error: sanitizeError(e) })
    return fail(e?.invalidGrant ? 'code_rejected' : 'exchange_failed', path)
  }
}

export async function connectionStatus({ store, config, ctx, flags }) {
  const [conn] = await store.select('crm_connections', { where: { organization_id: ctx.orgId, status: { neq: 'disconnected' } } })
  const [lastRun] = await store.select('revenue_sync_runs', { where: { organization_id: ctx.orgId }, order: 'created_at.desc', limit: 1, columns: 'id,status,kind,started_at,finished_at,warnings,error,counters' })
  const caps = conn?.capabilities ?? {}
  return {
    oauth_configured: oauthConfigured(config),
    connected: conn?.status === 'active',
    connection: conn ? { status: conn.status, portal_id: conn.portal_id, connected_at: conn.connected_at, last_success_at: conn.last_success_at, last_error: conn.last_error, scopes: conn.granted_scopes,
      capabilities: { read: Boolean(caps.read_deals), write_tasks: Boolean(caps.write_tasks), write_deals: Boolean(caps.write_deals) }, coverage: caps.coverage ?? null } : null,
    reconnect_required: conn?.status === 'reconnect_required',
    write_actions_enabled: flags.hubspot_write_actions_enabled,
    last_sync: lastRun ? { id: lastRun.id, status: lastRun.status, started_at: lastRun.started_at, finished_at: lastRun.finished_at, warnings: lastRun.warnings, error: lastRun.error, step: lastRun.counters?.state?.step ?? null, counters: Object.fromEntries(Object.entries(lastRun.counters ?? {}).filter(([k]) => k !== 'state')) } : null,
  }
}

export async function disconnect({ store, config, ctx, body, requestId, fetchImpl = fetch, log = () => {} }) {
  requireCan(ctx, 'manage_connection')
  if (body?.confirm !== true) throw badRequest('Confirmation required: send { "confirm": true }')
  const [conn] = await store.select('crm_connections', { where: { organization_id: ctx.orgId, status: { neq: 'disconnected' } } })
  if (!conn) return { disconnected: false, reason: 'no_active_connection' }
  // Best-effort revoke at HubSpot BEFORE dropping our copy of the refresh token.
  let revoked = false
  try {
    const rows = await store.rpc('rv_get_credentials', { _conn: conn.id })
    const cred = Array.isArray(rows) ? rows[0] : rows
    if (cred) {
      const res = await fetchImpl(`${config.hubspot.apiBase}/oauth/v1/refresh-tokens/${encodeURIComponent(decrypt(cred.refresh_token_enc, config.encryption))}`, { method: 'DELETE', signal: AbortSignal.timeout(10000) })
      revoked = res.ok || res.status === 204
    }
  } catch (e) { log('warn', 'hubspot.revoke_failed', { org_id: ctx.orgId, request_id: requestId, error: sanitizeError(e) }) }
  const ok = await store.rpc('rv_disconnect_connection', { _org: ctx.orgId, _conn: conn.id, _actor: ctx.userId, _request_id: requestId ?? null })
  if (!ok) throw forbidden('Could not disconnect')
  const [s] = await store.select('revenue_settings', { where: { organization_id: ctx.orgId } })
  return { disconnected: true, revoked_at_hubspot: revoked, data_retention_days: s?.retention_days_after_disconnect ?? 30, note: 'Synced data and history are retained per the retention policy; new syncs and pending actions were stopped.' }
}
