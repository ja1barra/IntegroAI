// The legacy SDR/outreach endpoints must be blocked SERVER-side for migrated tenants.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'

const realFetch = globalThis.fetch
let legacyAllowed = true
let sbCalls = []

before(async () => {
  process.env.SUPABASE_URL = 'https://sb.test'; process.env.SUPABASE_ANON_KEY = 'anon'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url)); sbCalls.push(u.pathname)
    if (u.origin === 'https://sb.test' && u.pathname === '/auth/v1/user') {
      return String(init.headers?.Authorization) === 'Bearer good' ? Response.json({ id: '11111111-1111-1111-1111-111111111111' }) : new Response('{}', { status: 401 })
    }
    if (u.pathname === '/rest/v1/rpc/rv_legacy_outreach_allowed') return Response.json(legacyAllowed)
    if (u.pathname.startsWith('/rest/v1/ai_provider_settings')) return Response.json([{ provider: 'openai', api_key: 'k', model: 'm' }])
    if (u.pathname === '/v1/chat/completions') return Response.json({ choices: [{ message: { content: '{"subject":"s","body":"b"}' } }] })
    if (u.host === 'gmail.googleapis.com') return Response.json({ id: 'sent-1' })
    throw new Error('unexpected fetch ' + url)
  }
})
after(() => { globalThis.fetch = realFetch })

const res = () => { const r = { code: 200, body: null, headers: {} }; r.setHeader = () => {}; r.status = c => { r.code = c; return r }; r.json = b => { r.body = b; return r }; r.end = () => r; return r }
const post = (handler, token, body) => { const r = res(); return handler({ method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {}, body }, r).then(() => r) }

test('generate / generate-sequence / send: 401 without session, 403 for migrated tenants, work otherwise', async () => {
  const gen = (await import('../api/agent/generate.js')).default
  const seq = (await import('../api/agent/generate-sequence.js')).default
  const send = (await import('../api/agent/send.js')).default
  const prospects = { prospects: [{ id: 'p', firstName: 'A', company: 'C' }] }
  const mail = { provider: 'gmail', accessToken: 'tok', to: 'x@y.com', subject: 's', body: 'b' }

  assert.equal((await post(send, null, mail)).code, 401)                    // send used to be open to anyone
  assert.equal((await post(gen, null, prospects)).code, 401)

  legacyAllowed = true
  assert.equal((await post(gen, 'good', prospects)).code, 200)
  assert.equal((await post(send, 'good', mail)).code, 200)

  legacyAllowed = false                                                     // tenant migrated: legacy_outreach_enabled = false
  for (const [h, b] of [[gen, prospects], [seq, { brief: 'x', mode: 'crm', crmContext: 'y' }], [send, mail]]) {
    const r = await post(h, 'good', b)
    assert.equal(r.code, 403); assert.equal(r.body.code, 'legacy_outreach_disabled')
  }
})

test('getAuthedUser keeps its historic contract', async () => {
  const { getAuthedUser } = await import('../api/agent/_provider.js')
  const a = await getAuthedUser({ headers: { authorization: 'Bearer good' } })
  assert.equal(a.token, 'good'); assert.equal(a.supabaseUrl, 'https://sb.test'); assert.equal(a.anonKey, 'anon')
  assert.equal(await getAuthedUser({ headers: { authorization: 'Bearer bad' } }), null)
  assert.equal(await getAuthedUser({ headers: {} }), null)
})
