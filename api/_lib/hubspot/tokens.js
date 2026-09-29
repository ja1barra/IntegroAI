// Access-token lifecycle: decrypt, refresh under a per-connection lease, store
// the (possibly rotated) refresh token atomically.

import { decrypt, encrypt } from '../crypto.js'
import { refreshTokens } from './oauth.js'
import { ReconnectRequired } from './client.js'
import { HttpError } from '../http.js'

const SKEW_MS = 120_000

export function createTokenProvider({ store, config, connectionId, orgId, workerId, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() }) {
  // Decrypted token kept in memory until shortly before it expires: a sync makes thousands of HubSpot calls and
  // must not do a credentials round trip (RPC + AES) for each one.
  let cached = null // { token, expiresAt: ms }

  async function readCreds() {
    const rows = await store.rpc('rv_get_credentials', { _conn: connectionId })
    const row = Array.isArray(rows) ? rows[0] : rows
    if (!row) throw new ReconnectRequired('No active HubSpot credentials for this connection')
    if (row.organization_id !== orgId) throw new HttpError(403, 'forbidden', 'Connection does not belong to this organization')
    return row
  }
  const remember = row => { const token = decrypt(row.access_token_enc, config.encryption); cached = { token, expiresAt: new Date(row.expires_at).getTime() }; return token }

  return async function getToken({ force = false } = {}) {
    if (!force && cached && cached.expiresAt - SKEW_MS > now()) return cached.token
    const rejectedExpiry = force ? cached?.expiresAt : undefined
    // acceptable = still valid, and — when a 401 forced us here — NOT the token that was just rejected
    // (a token refreshed meanwhile by another worker has a different expiry and is accepted).
    const acceptable = r => new Date(r.expires_at).getTime() - SKEW_MS > now() && (!force || new Date(r.expires_at).getTime() !== rejectedExpiry)
    let row = await readCreds()
    if (acceptable(row)) return remember(row)

    for (let i = 0; i < 8; i++) {
      const got = await store.rpc('rv_acquire_refresh_lease', { _conn: connectionId, _worker: workerId, _seconds: 30 })
      if (got === true) break
      // someone else is refreshing: wait for their result instead of double-refreshing
      await sleep(500)
      row = await readCreds()
      if (acceptable(row)) return remember(row)
      if (i === 7) throw new HttpError(503, 'dependency_unavailable', 'Token refresh is in progress elsewhere; retry shortly')
    }
    try {
      row = await readCreds() // may have been refreshed between our check and the lease
      if (acceptable(row)) { await store.rpc('rv_release_refresh_lease', { _conn: connectionId, _worker: workerId }); return remember(row) }
      const refreshToken = decrypt(row.refresh_token_enc, config.encryption)
      let t
      for (let attempt = 0; ; attempt++) {
        try { t = await refreshTokens(config, refreshToken, fetchImpl); break }
        catch (e) {
          if (e.invalidGrant) {
            await store.rpc('rv_mark_connection', { _conn: connectionId, _status: 'reconnect_required', _error: 'HubSpot refresh token was rejected (invalid_grant)' })
            await store.rpc('rv_release_refresh_lease', { _conn: connectionId, _worker: workerId })
            throw new ReconnectRequired('HubSpot refresh token was rejected')
          }
          if (e.clientMisconfigured) throw new HttpError(503, 'dependency_unavailable', "HubSpot rejected this app's client credentials; check HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET")
          if (attempt >= 2 || !e.retryable) throw e
          await sleep(400 * 2 ** attempt)
        }
      }
      const a = encrypt(t.accessToken, config.encryption), r = encrypt(t.refreshToken, config.encryption)
      const ok = await store.rpc('rv_store_refreshed_credentials', {
        _conn: connectionId, _worker: workerId, _access_enc: a.value, _refresh_enc: r.value, _expires_at: t.expiresAt.toISOString(), _key_version: a.keyVersion,
      })
      if (ok !== true) throw new HttpError(503, 'dependency_unavailable', 'Lost the token refresh lease; retry')
      cached = { token: t.accessToken, expiresAt: t.expiresAt.getTime() }
      return t.accessToken
    } catch (e) {
      if (!(e instanceof ReconnectRequired)) await store.rpc('rv_release_refresh_lease', { _conn: connectionId, _worker: workerId }).catch(() => {})
      throw e
    }
  }
}
