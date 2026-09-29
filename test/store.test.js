import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPostgrestStore, selectAll } from '../api/_lib/store.js'
import { HttpError } from '../api/_lib/http.js'

const cfg = { supabaseUrl: 'https://sb.test', serviceKey: 'svc' }
const recorder = (respond) => { const calls = []; const f = async (url, init) => { calls.push({ url: new URL(url), init }); return respond(url, init, calls.length) }; return { f, calls } }
const json = (status, body) => new Response(JSON.stringify(body), { status })

test('PostgREST store: eq/in/gte/isnull filters, casts, ordering, auth headers, quoting of IN values', async () => {
  const r = recorder(() => json(200, []))
  const s = createPostgrestStore(cfg, r.f)
  await s.select('crm_deals', { where: { organization_id: 'o1', id: { in: ['a', 'b,c', 'd"e', 'f)g'] }, synced_at: { gte: '2026-01-01T00:00:00+00:00' }, deleted_at: { isnull: true }, archived: false }, columns: 'id,amount::text', order: 'external_id.asc', limit: 10, offset: 20 })
  const u = r.calls[0].url
  assert.equal(u.pathname, '/rest/v1/crm_deals')
  assert.equal(u.searchParams.get('select'), 'id,amount::text')
  assert.equal(u.searchParams.get('organization_id'), 'eq.o1')
  assert.equal(u.searchParams.get('id'), 'in.("a","b,c","d\\"e","f)g")')
  assert.equal(u.searchParams.get('synced_at'), 'gte.2026-01-01T00:00:00+00:00')
  assert.equal(u.searchParams.get('deleted_at'), 'is.null')
  assert.equal(u.searchParams.get('archived'), 'eq.false')
  assert.equal(u.searchParams.get('order'), 'external_id.asc'); assert.equal(u.searchParams.get('limit'), '10'); assert.equal(u.searchParams.get('offset'), '20')
  assert.equal(r.calls[0].init.headers.apikey, 'svc'); assert.equal(r.calls[0].init.headers.Authorization, 'Bearer svc')
})

test('PostgREST store: upsert preferences, rpc, and error mapping (5xx/429/network => 503, never a logout)', async () => {
  const r = recorder(() => json(200, [{ id: 1 }]))
  const s = createPostgrestStore(cfg, r.f)
  await s.insert('crm_deals', [{ a: 1 }], { onConflict: 'organization_id,external_id' })
  assert.equal(r.calls[0].url.searchParams.get('on_conflict'), 'organization_id,external_id')
  assert.match(r.calls[0].init.headers.Prefer, /resolution=merge-duplicates/)
  await s.insert('t', [{ a: 1 }], { onConflict: 'a', ignoreDuplicates: true })
  assert.match(r.calls[1].init.headers.Prefer, /ignore-duplicates/)
  await s.rpc('rv_enqueue_job', { _org: 'o' })
  assert.equal(r.calls[2].url.pathname, '/rest/v1/rpc/rv_enqueue_job')
  for (const status of [500, 502, 429]) await assert.rejects(createPostgrestStore(cfg, async () => json(status, {})).select('t'), e => e instanceof HttpError && e.status === 503)
  await assert.rejects(createPostgrestStore(cfg, async () => { throw new TypeError('fetch failed') }).select('t'), e => e.status === 503)
  const bad = await createPostgrestStore(cfg, async () => json(400, { message: 'boom', code: '23505' })).select('t').catch(e => e)
  assert.equal(bad.status, 400); assert.equal(bad.extra.pg_code, '23505')
  const unconfigured = createPostgrestStore({}, fetch)
  await assert.rejects(unconfigured.select('t'), e => e.status === 503)
})

test('selectAll pages past PostgREST max-rows instead of truncating silently', async () => {
  const rows = Array.from({ length: 2300 }, (_, i) => ({ i }))
  const store = { async select(_t, { limit, offset }) { return rows.slice(offset, offset + limit) } }
  assert.equal((await selectAll(store, 't', { order: 'i.asc' })).length, 2300)
})

test('service-role store refuses unscoped writes: undefined filters and empty where are programming errors', async () => {
  const r = recorder(() => json(200, []))
  const s = createPostgrestStore(cfg, r.f)
  await assert.rejects(s.select('t', { where: { organization_id: undefined } }), /undefined/)
  await assert.rejects(s.update('t', { organization_id: undefined, id: 'x' }, { a: 1 }), /undefined/)
  await assert.rejects(s.update('t', {}, { a: 1 }), /where/)
  await assert.rejects(s.delete('t', {}), /where/)
  assert.equal(r.calls.length, 0)                                                                                    // nothing was sent
})
