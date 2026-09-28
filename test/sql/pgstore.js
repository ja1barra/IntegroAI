// Store implementation backed by PGlite so backend code runs against the REAL
// schema, constraints and RPCs (with a mocked HubSpot / OpenAI on top).
const q = id => '"' + String(id).replace(/"/g, '""') + '"'

function colList(columns) {
  if (!columns || columns === '*') return '*'
  return columns.split(',').map(c => {
    c = c.trim()
    const m = /^([\w]+)::(\w+)$/.exec(c)
    return m ? `${q(m[1])}::${m[2]} as ${q(m[1])}` : q(c)
  }).join(', ')
}

function whereSql(where = {}, params) {
  const parts = []
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      if ('in' in v) { params.push(v.in); parts.push(`${q(k)} = any($${params.length})`) }
      else if ('gte' in v) { params.push(v.gte); parts.push(`${q(k)} >= $${params.length}`) }
      else if ('lte' in v) { params.push(v.lte); parts.push(`${q(k)} <= $${params.length}`) }
      else if ('gt' in v) { params.push(v.gt); parts.push(`${q(k)} > $${params.length}`) }
      else if ('lt' in v) { params.push(v.lt); parts.push(`${q(k)} < $${params.length}`) }
      else if ('neq' in v) { params.push(v.neq); parts.push(`${q(k)} <> $${params.length}`) }
      else if ('isnull' in v) parts.push(`${q(k)} is ${v.isnull ? '' : 'not '}null`)
    } else if (v === null) parts.push(`${q(k)} is null`)
    else { params.push(v); parts.push(`${q(k)} = $${params.length}`) }
  }
  return parts.length ? ' where ' + parts.join(' and ') : ''
}

// PostgREST maps JSON arrays onto text[] columns but keeps them as JSON for
// jsonb columns; mirror that using the catalog.
const typeCache = new Map()
async function colTypes(db, table) {
  if (!typeCache.has(table)) {
    const r = await db.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1`, [table])
    typeCache.set(table, new Map(r.rows.map(x => [x.column_name, x.data_type])))
  }
  return typeCache.get(table)
}
const encode = (v, type) => (v !== null && typeof v === 'object' && !(v instanceof Date) && type !== 'ARRAY' ? JSON.stringify(v) : v)
const jsonify = v => (v !== null && typeof v === 'object' && !(v instanceof Date) ? JSON.stringify(v) : v)

export function createPgStore(db) {
  const norm = rows => rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])))
  return {
    configured: true,
    async select(table, { where, columns = '*', order, limit, offset } = {}) {
      const params = []
      let sql = `select ${colList(columns)} from public.${q(table)}${whereSql(where, params)}`
      if (order) sql += ' order by ' + order.split(',').map(o => { const [c, d] = o.split('.'); return `${q(c)} ${d === 'desc' ? 'desc' : 'asc'}` }).join(', ')
      if (limit !== undefined) sql += ` limit ${Number(limit)}`
      if (offset !== undefined) sql += ` offset ${Number(offset)}`
      return norm((await db.query(sql, params)).rows)
    },
    async insert(table, rows, { onConflict, ignoreDuplicates } = {}) {
      const arr = Array.isArray(rows) ? rows : [rows]
      if (!arr.length) return []
      const keys = Object.keys(arr[0])
      const types = await colTypes(db, table)
      const out = []
      for (const r of arr) {
        const params = keys.map(k => encode(r[k], types.get(k)))
        let sql = `insert into public.${q(table)} (${keys.map(q).join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')})`
        if (onConflict) {
          const cols = onConflict.split(',')
          if (ignoreDuplicates) sql += ` on conflict (${cols.map(q).join(',')}) do nothing`
          else { const upd = keys.filter(k => !cols.includes(k)); sql += ` on conflict (${cols.map(q).join(',')}) do ${upd.length ? 'update set ' + upd.map(k => `${q(k)} = excluded.${q(k)}`).join(',') : 'nothing'}` }
        }
        out.push(...norm((await db.query(sql + ' returning *', params)).rows))
      }
      return out
    },
    async update(table, where, patch) {
      const params = []
      const types = await colTypes(db, table)
      const sets = Object.entries(patch).map(([k, v]) => { params.push(encode(v, types.get(k))); return `${q(k)} = $${params.length}` })
      const sql = `update public.${q(table)} set ${sets.join(',')}${whereSql(where, params)} returning *`
      return norm((await db.query(sql, params)).rows)
    },
    async rpc(fn, args = {}) {
      const keys = Object.keys(args)
      const params = keys.map(k => jsonify(args[k]))
      const sql = `select * from public.${q(fn)}(${keys.map((k, i) => `${q(k)} => $${i + 1}`).join(', ')})`
      let res
      try { res = await db.query(sql, params) } catch (e) { const err = new Error(e.message); err.pg = true; throw err }
      const rows = norm(res.rows)
      // scalar functions come back as [{ fn_name: value }]
      if (rows.length === 1 && Object.keys(rows[0]).length === 1 && Object.keys(rows[0])[0] === fn) return rows[0][fn]
      return rows
    },
  }
}
