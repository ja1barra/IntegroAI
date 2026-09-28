// Access-token lifecycle: decrypt, refresh under a per-connection lease, store
// the (possibly rotated) refresh token atomically.

import { decrypt, encrypt } from '../crypto.js'
import { refreshTokens } from './oauth.js'
import { ReconnectRequired } from './client.js'
import { HttpError } from '../http.js'

const SKEW_MS = 120_000

export function createTokenProvider({ store, config, connectionId, orgId, workerId, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), now = () => Date.now() }) {
  async function readCreds() {
    const rows = await store.rpc('rv_get_credentials', { _conn: connectionId })
    const row = Array.isArray(rows) ? rows[0] : rows
    if (!row) throw new ReconnectRequired('No active HubSpot credentials for this connection')
    if (row.organization_id !== orgId) throw new HttpError(403, 'forbidden', 'Connection does not belong to this organization')
    return row
  }

  return async function getToken({ force = false } = {}) {
    let row = await readCreds()
    const fresh = r => new Date(r.expires_at).getTime() - SKEW_MS > now()
    if (!force && fresh(row)) return decrypt(row.access_token_enc, config.encryption)

    for (let i = 0; i < 8; i++) {
      const got = await store.rpc('rv_acquire_refresh_lease', { _conn: connectionId, _worker: workerId, _seconds: 30 })
      if (got === true) break
      // someone else is refreshing: wait for their result instead of double-refreshing
      await sleep(500)
      row = await readCreds()
      if (!force && fresh(row)) return decrypt(row.access_token_enc, config.encryption)
      if (i === 7) throw new HttpError(503, 'dependency_unavailable', 'Token refresh is in progress elsewhere; retry shortly')
    }
    try {
      row = await readCreds() // may have been refreshed between our check and the lease
      if (!force && fresh(row)) { await store.rpc('rv_release_refresh_lease', { _conn: connectionId, _worker: workerId }); return decrypt(row.access_token_enc, config.encryption) }
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
          if (attempt >= 2 || !e.retryable) throw e
          await sleep(400 * 2 ** attempt)
        }
      }
      const a = encrypt(t.accessToken, config.encryption), r = encrypt(t.refreshToken, config.encryption)
      const ok = await store.rpc('rv_store_refreshed_credentials', {
        _conn: connectionId, _worker: workerId, _access_enc: a.value, _refresh_enc: r.value, _expires_at: t.expiresAt.toISOString(), _key_version: a.keyVersion,
      })
      if (ok !== true) throw new HttpError(503, 'dependency_unavailable', 'Lost the token refresh lease; retry')
      return t.accessToken
    } catch (e) {
      if (!(e instanceof ReconnectRequired)) await store.rpc('rv_release_refresh_lease', { _conn: connectionId, _worker: workerId }).catch(() => {})
      throw e
    }
  }
}
