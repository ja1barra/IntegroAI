// A `fetch` that speaks Supabase Auth + HubSpot (OAuth + CRM) so the whole
// HTTP-facing stack (router, token provider, real HubSpot client) runs offline.
import { HubSpotForbidden, HubSpotRateLimited } from '../../api/_lib/hubspot/client.js'

const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

export function createFakeFetch({ hubspot, supabaseUrl = 'https://sb.test', hubspotBase = 'https://api.hubapi.com' }) {
  const state = {
    sessions: new Map(),          // access token -> { id, email }
    authDown: false,
    portalId: 555,
    scopes: ['crm.objects.deals.read', 'crm.objects.contacts.read', 'crm.objects.companies.read', 'crm.objects.owners.read', 'crm.schemas.deals.read', 'crm.objects.contacts.write', 'crm.objects.deals.write'],
    refreshCount: 0, refreshDelayMs: 0, refreshInvalid: false, rotateRefresh: true,
    revoked: [], calls: [],
    accessSeq: 0, currentAccess: null, currentRefresh: 'refresh-0', validRefresh: new Set(['refresh-0']),
    expiresIn: 1800,
  }
  const mintAccess = () => { state.currentAccess = 'hs-access-' + (++state.accessSeq); return state.currentAccess }

  async function fetchImpl(input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.href ?? input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    state.calls.push(`${method} ${url.host}${url.pathname}`)
    if (url.origin === supabaseUrl) {
      if (state.authDown) throw new TypeError('fetch failed')
      if (url.pathname === '/auth/v1/user') {
        const tok = String(init.headers?.Authorization ?? '').replace('Bearer ', '')
        const u = state.sessions.get(tok)
        return u ? json(200, { id: u.id, email: u.email, user_metadata: {} }) : json(401, { message: 'invalid JWT' })
      }
    }
    if (url.origin === hubspotBase) {
      if (url.pathname === '/oauth/v1/token') {
        const p = new URLSearchParams(init.body)
        if (p.get('grant_type') === 'authorization_code') {
          if (p.get('code') !== 'good-code') return json(400, { status: 'BAD_AUTH_CODE' })
          state.validRefresh = new Set(['refresh-0']); state.currentRefresh = 'refresh-0'
          return json(200, { access_token: mintAccess(), refresh_token: 'refresh-0', expires_in: state.expiresIn })
        }
        state.refreshCount++
        if (state.refreshDelayMs) await new Promise(r => setTimeout(r, state.refreshDelayMs))
        if (state.refreshInvalid || !state.validRefresh.has(p.get('refresh_token'))) return json(400, { status: 'BAD_REFRESH_TOKEN' })
        if (state.rotateRefresh) { const next = 'refresh-' + state.refreshCount; state.validRefresh.add(next); state.validRefresh.delete(p.get('refresh_token')); state.currentRefresh = next }
        return json(200, { access_token: mintAccess(), refresh_token: state.currentRefresh, expires_in: state.expiresIn })
      }
      if (url.pathname.startsWith('/oauth/v1/access-tokens/')) return json(200, { hub_id: state.portalId, hub_domain: 'acme.test', scopes: state.scopes, user: 'admin@acme.test' })
      if (url.pathname === '/account-info/v3/details') return json(200, { timeZone: 'America/Mexico_City', companyCurrency: 'USD' })
      if (url.pathname.startsWith('/oauth/v1/refresh-tokens/') && method === 'DELETE') { state.revoked.push(decodeURIComponent(url.pathname.split('/').pop())); return new Response(null, { status: 204 }) }
      // CRM API: token must be the currently valid access token
      const tok = String(init.headers?.Authorization ?? '').replace('Bearer ', '')
      if (tok !== state.currentAccess) return json(401, { status: 'error', category: 'EXPIRED_AUTHENTICATION' })
      try {
        const query = Object.fromEntries(url.searchParams)
        const body = init.body ? JSON.parse(init.body) : undefined
        const out = method === 'GET' ? await hubspot.client.get(url.pathname, query) : await hubspot.client.request(method, url.pathname, { body })
        return json(200, out ?? {})
      } catch (e) {
        if (e instanceof HubSpotForbidden) return json(403, { category: 'MISSING_SCOPES' })
        if (e instanceof HubSpotRateLimited) return json(429, {}, { 'retry-after': '1' })
        if (e?.name === 'HubSpotError') return json(e.status || 500, {})
        return json(500, { message: String(e?.message) })
      }
    }
    return json(404, { message: 'fake fetch: unhandled ' + url })
  }
  return { fetchImpl, state, mintAccess }
}
