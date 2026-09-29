// Data-access boundary. Handlers depend on the `Store` interface so they can run
// against PostgREST in production and against a real Postgres (PGlite) in tests.
//
//   select(table, { where, columns, order, limit, offset }) -> rows
//   insert(table, rows, { onConflict, ignoreDuplicates })   -> rows (returned)
//   update(table, where, patch)                              -> rows
//   rpc(fn, args)                                            -> rows | scalar
//
// `where` values: scalar (eq) | { in: [...] } | { gte } | { lte } | { gt } | { lt } | { neq } | { isnull: bool }
//
// Uses the SERVICE ROLE key: it bypasses RLS, so every call site must pass an
// organization_id it obtained from an authorized context (see auth.js).

import { HttpError, unavailable, log } from './http.js'

const TIMEOUT_MS = 15000

function qs(where = {}) {
  const p = []
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      // PostgREST list syntax: quote each item (escape \\ and \") so commas/parentheses inside values are safe.
      if ('in' in v) p.push([k, `in.(${v.in.map(x => `"${String(x).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')})`])
      else if ('gte' in v) p.push([k, `gte.${v.gte}`])
      else if ('lte' in v) p.push([k, `lte.${v.lte}`])
      else if ('gt' in v) p.push([k, `gt.${v.gt}`])
      else if ('lt' in v) p.push([k, `lt.${v.lt}`])
      else if ('neq' in v) p.push([k, `neq.${v.neq}`])
      else if ('isnull' in v) p.push([k, v.isnull ? 'is.null' : 'not.is.null'])
    } else if (v === null) p.push([k, 'is.null'])
    else p.push([k, `eq.${v}`])
  }
  return p
}

export function createPostgrestStore(config, fetchImpl = fetch) {
  if (!config.supabaseUrl || !config.serviceKey) {
    return {
      configured: false,
      async select() { throw unavailable('Server data store is not configured') },
      insert: async () => { throw unavailable('Server data store is not configured') },
      update: async () => { throw unavailable('Server data store is not configured') },
      rpc: async () => { throw unavailable('Server data store is not configured') },
    }
  }
  const base = `${config.supabaseUrl}/rest/v1`
  const headers = (extra = {}) => ({ apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json', ...extra })

  async function call(method, path, { body, extra } = {}) {
    let res
    try {
      res = await fetchImpl(`${base}${path}`, { method, headers: headers(extra), body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) })
    } catch (e) {
      log('error', 'store.network_error', { path: path.split('?')[0], name: e?.name })
      throw unavailable()
    }
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { /* non-json */ }
    if (res.status >= 500 || res.status === 429) throw unavailable()
    if (!res.ok) {
      const msg = json?.message ?? `store error ${res.status}`
      // Postgres errors raised by our RPCs surface as 4xx with the SQLSTATE code.
      throw new HttpError(res.status === 401 || res.status === 403 ? 500 : 400, 'store_error', msg, { pg_code: json?.code })
    }
    return json
  }

  return {
    configured: true,
    async select(table, { where, columns = '*', order, limit, offset } = {}) {
      const params = new URLSearchParams([['select', columns], ...qs(where)])
      if (order) params.set('order', order)
      if (limit !== undefined) params.set('limit', String(limit))
      if (offset !== undefined) params.set('offset', String(offset))
      return (await call('GET', `/${table}?${params}`)) ?? []
    },
    async insert(table, rows, { onConflict, ignoreDuplicates } = {}) {
      const arr = Array.isArray(rows) ? rows : [rows]
      if (!arr.length) return []
      const params = new URLSearchParams()
      if (onConflict) params.set('on_conflict', onConflict)
      const prefer = ['return=representation']
      if (onConflict) prefer.push(ignoreDuplicates ? 'resolution=ignore-duplicates' : 'resolution=merge-duplicates')
      return (await call('POST', `/${table}${params.size ? `?${params}` : ''}`, { body: arr, extra: { Prefer: prefer.join(',') } })) ?? []
    },
    async update(table, where, patch) {
      const params = new URLSearchParams(qs(where))
      return (await call('PATCH', `/${table}?${params}`, { body: patch, extra: { Prefer: 'return=representation' } })) ?? []
    },
    async rpc(fn, args = {}) {
      return await call('POST', `/rpc/${fn}`, { body: args })
    },
  }
}

// Insert in chunks so one large page never exceeds request limits.
export async function insertChunked(store, table, rows, opts, size = 200) {
  const out = []
  for (let i = 0; i < rows.length; i += size) out.push(...(await store.insert(table, rows.slice(i, i + size), opts)))
  return out
}

// Read every row page by page (PostgREST caps a response at its max-rows, 1000 by default),
// so reference tables are never silently truncated.
export async function selectAll(store, table, opts = {}, page = 1000) {
  const out = []
  for (let offset = 0; ; offset += page) {
    const rows = await store.select(table, { ...opts, limit: page, offset })
    out.push(...rows)
    if (rows.length < page) return out
  }
}
