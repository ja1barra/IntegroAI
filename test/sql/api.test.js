import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { newDb, applyBaseline, applyMigrations, seedUser } from './helpers.js'
import { createPgStore } from './pgstore.js'
import { createFakeHubspot } from '../helpers/fakeHubspot.js'
import { createFakeFetch } from '../helpers/fakeFetch.js'
import { createHandler } from '../../api/_lib/router.js'
import { createTokenProvider } from '../../api/_lib/hubspot/tokens.js'
import { decrypt } from '../../api/_lib/crypto.js'
import { NOW, ago, fut } from '../helpers/seedOrg.js'

let db, store, handler, config, hs, ff, ai
let admin, manager, member, viewer, outsider
const aiQueue = []
const users = {}

const DEBUG = process.env.DEBUG_API
const stripSecrets = s => JSON.stringify(s)

function mockRes() {
  const r = { headers: {}, statusCode: 200, body: undefined, ended: false }
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v }
  r.status = c => { r.statusCode = c; return r }
  r.json = b => { r.body = b; r.ended = true; return r }
  r.end = () => { r.ended = true; return r }
  return r
}
async function call(method, path, { token, body, query = {}, headers = {} } = {}) {
  const req = { method, url: '/api/' + path + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''), headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), ...headers }, query: { __path: path, ...query }, body }
  const res = mockRes()
  await handler(req, res)
  if (DEBUG && res.statusCode >= 500) console.error('DEBUG', path, JSON.stringify(res.body))
  return res
}
const kick = token => call('POST', 'revenue/worker/kick', { token, body: {} })

before(async () => {
  db = await newDb(); await applyBaseline(db); await applyMigrations(db)
  store = createPgStore(db)
  hs = createFakeHubspot(); hs.state.clock = () => NOW
  ff = createFakeFetch({ hubspot: hs })
  config = {
    supabaseUrl: 'https://sb.test', anonKey: 'anon', serviceKey: 'svc', appBaseUrl: 'https://app.test',
    hubspot: { clientId: 'cid', clientSecret: 'csecret', redirectUri: 'https://app.test/api/integrations/hubspot/callback', apiBase: 'https://api.hubapi.com', authorizeUrl: 'https://app.hubspot.com/oauth/authorize' },
    openai: { apiKey: 'k', model: 'test-model', timeoutMs: 1000, maxRetries: 0, maxOutputTokens: 500 },
    workerSecret: 'w-secret', workerBudgetMs: 20000,
    encryption: { key: randomBytes(32).toString('base64'), keyId: '1' }, hubspotWriteScopeRequested: false,
  }
  ai = { available: true, model: 'test-model', async respond(req) { const h = aiQueue.shift(); if (!h) throw new Error('unexpected AI call'); return typeof h === 'function' ? h(req) : h } }
  handler = createHandler({ config, store, ai, fetchImpl: ff.fetchImpl, now: () => NOW, log: (l, e, f) => { if (process.env.DEBUG_API && l === "error") console.error(e, JSON.stringify(f)) } })

  admin = await seedUser(db, 'admin@a.com', 'Acme'); manager = await seedUser(db, 'mgr@a.com'); member = await seedUser(db, 'mem@a.com'); viewer = await seedUser(db, 'view@a.com'); outsider = await seedUser(db, 'out@b.com', 'Other')
  users.orgA = await store.rpc('rv_ensure_user_org', { _user: admin, _name: 'Acme' })
  users.orgB = await store.rpc('rv_ensure_user_org', { _user: outsider, _name: 'Other' })
  await store.insert('organization_members', [{ organization_id: users.orgA, user_id: manager, role: 'manager' }, { organization_id: users.orgA, user_id: member, role: 'member' }, { organization_id: users.orgA, user_id: viewer, role: 'viewer' }])
  for (const [tok, id, email] of [['t-admin', admin, 'admin@a.com'], ['t-mgr', manager, 'mgr@a.com'], ['t-mem', member, 'mem@a.com'], ['t-view', viewer, 'view@a.com'], ['t-out', outsider, 'out@b.com']]) ff.state.sessions.set(tok, { id, email })

  // HubSpot content
  hs.addDeal('101', { dealname: 'Stale big deal', dealstage: 's_late', amount: '50000', hs_date_entered_s_late: ago(5) })
  hs.state.assoc.contacts.set('101', ['c1']); hs.state.contacts.set('c1', { id: 'c1', properties: { firstname: 'Cy' } })
  hs.state.assoc.emails.set('101', ['e1']); hs.state.acts.emails.set('e1', { id: 'e1', properties: { hs_timestamp: ago(30), hs_email_status: 'SENT' } })
  hs.addDeal('102', { dealname: 'Healthy', dealstage: 's_late', amount: '30000', hs_date_entered_s_late: ago(3), hubspot_owner_id: 'o2' })
  hs.state.assoc.contacts.set('102', ['c2', 'c3']); for (const c of ['c2', 'c3']) hs.state.contacts.set(c, { id: c, properties: { firstname: c } })
  hs.state.assoc.calls.set('102', ['k1']); hs.state.acts.calls.set('k1', { id: 'k1', properties: { hs_timestamp: ago(2), hs_call_status: 'COMPLETED' } })
  hs.state.assoc.tasks.set('102', ['t1']); hs.state.acts.tasks.set('t1', { id: 't1', properties: { hs_timestamp: fut(3), hs_task_status: 'NOT_STARTED' } })
})

test('auth: 401 without/invalid session; 503 (not 401) when Supabase Auth is down; 403 for a foreign org header', async () => {
  assert.equal((await call('GET', 'revenue/context')).statusCode, 401)
  assert.equal((await call('GET', 'revenue/context', { token: 'nope' })).statusCode, 401)
  ff.state.authDown = true
  const down = await call('GET', 'revenue/context', { token: 't-admin' })
  assert.equal(down.statusCode, 503); assert.equal(down.body.error.code, 'dependency_unavailable')
  ff.state.authDown = false
  const ok = await call('GET', 'revenue/context', { token: 't-admin' })
  assert.equal(ok.statusCode, 200); assert.equal(ok.body.role, 'admin'); assert.ok(ok.body.error === undefined)
  assert.ok(ok.headers['x-request-id'])
  // a client-supplied org only *selects* among own memberships
  const foreign = await call('GET', 'revenue/context', { token: 't-admin', headers: { 'x-organization-id': users.orgB } })
  assert.equal(foreign.statusCode, 403)
  assert.equal((await call('GET', 'revenue/context', { token: 't-out' })).body.organization.id, users.orgB)
  assert.equal((await call('GET', 'revenue/nope', { token: 't-admin' })).statusCode, 404)
  assert.equal((await call('DELETE', 'revenue/context', { token: 't-admin' })).statusCode, 405)
})

test('feature flag off => 403 feature_disabled on every Revenue route; context still works', async () => {
  const r = await call('GET', 'revenue/overview', { token: 't-admin' })
  assert.equal(r.statusCode, 403); assert.equal(r.body.error.code, 'feature_disabled')
  await store.update('revenue_org_flags', { organization_id: users.orgA }, { revenue_mvp_enabled: true, managed_ai_enabled: true, hubspot_write_actions_enabled: true })
})

test('worker endpoint: only the scheduler secret works', async () => {
  assert.equal((await call('POST', 'revenue/worker/tick')).statusCode, 401)
  assert.equal((await call('POST', 'revenue/worker/tick', { token: 'wrong' })).statusCode, 401)
  assert.equal((await call('POST', 'revenue/worker/tick', { token: 'w-secret' })).statusCode, 200)
  assert.equal((await call('POST', 'revenue/worker/tick', { token: 't-admin' })).statusCode, 401)     // a user session is not a worker credential
})

let stateParam
test('OAuth connect: admin only; state random, single-use, stored only as a hash; scopes exact', async () => {
  assert.equal((await call('POST', 'integrations/hubspot/connect', { token: 't-mgr', body: {} })).statusCode, 403)
  const r = await call('POST', 'integrations/hubspot/connect', { token: 't-admin', body: { redirect_to: '/settings' } })
  assert.equal(r.statusCode, 200)
  const u = new URL(r.body.authorize_url)
  assert.equal(u.origin + u.pathname, 'https://app.hubspot.com/oauth/authorize')
  assert.equal(u.searchParams.get('client_id'), 'cid')
  assert.equal(u.searchParams.get('redirect_uri'), config.hubspot.redirectUri)
  const scopes = u.searchParams.get('scope').split(' ')
  assert.ok(scopes.includes('crm.objects.deals.read')); assert.ok(!scopes.some(s => s.includes('write')))          // read-only required scopes
  assert.ok(u.searchParams.get('optional_scope').includes('crm.objects.contacts.write'))                             // write is optional
  assert.ok(!scopes.includes('activities.read'))                                                                     // no invented scope
  stateParam = u.searchParams.get('state')
  assert.ok(stateParam.length >= 40)
  const row = (await db.query(`select state_hash, redirect_to from private.oauth_attempts`)).rows[0]
  assert.notEqual(row.state_hash, stateParam); assert.equal(row.redirect_to, '/settings')
  assert.ok(!JSON.stringify((await db.query(`select * from private.oauth_attempts`)).rows).includes(stateParam))
})

test('OAuth callback: invalid / replayed / expired state, denied consent, bad code all redirect safely without connecting', async () => {
  const cb = q => call('GET', 'integrations/hubspot/callback', { query: q })
  const reason = r => new URL(r.headers.location, 'https://x').searchParams.get('reason')
  assert.equal((await cb({ code: 'good-code', state: 'forged' })).statusCode, 302)
  assert.equal(reason(await cb({ code: 'good-code', state: 'forged' })), 'invalid_state')
  assert.equal(reason(await cb({ error: 'access_denied', state: stateParam })), 'denied')
  assert.equal(reason(await cb({ state: stateParam })), 'invalid_request')
  // bad code consumes the state (single use) and reports a code error
  assert.equal(reason(await cb({ code: 'bad', state: stateParam })), 'code_rejected')
  assert.equal(reason(await cb({ code: 'good-code', state: stateParam })), 'invalid_state')          // replay of the same state
  assert.equal((await store.select('crm_connections', { where: { organization_id: users.orgA } })).length, 0)
  // expired
  const r = await call('POST', 'integrations/hubspot/connect', { token: 't-admin', body: {} })
  const st = new URL(r.body.authorize_url).searchParams.get('state')
  await db.query(`update private.oauth_attempts set expires_at = now() - interval '1 second'`)
  assert.equal(reason(await cb({ code: 'good-code', state: st })), 'invalid_state')
})

test('OAuth callback success: portal verified, scopes recorded, tokens encrypted at rest, onboarding defaults prefilled; status hides secrets', async () => {
  const r = await call('POST', 'integrations/hubspot/connect', { token: 't-admin', body: { redirect_to: '/settings' } })
  const st = new URL(r.body.authorize_url).searchParams.get('state')
  const res = await call('GET', 'integrations/hubspot/callback', { query: { code: 'good-code', state: st } })
  assert.equal(res.statusCode, 302)
  const loc = new URL(res.headers.location); assert.equal(loc.origin, 'https://app.test'); assert.equal(loc.searchParams.get('hubspot'), 'connected')
  const [conn] = await store.select('crm_connections', { where: { organization_id: users.orgA } })
  assert.equal(conn.portal_id, '555'); assert.equal(conn.status, 'active'); assert.ok(conn.granted_scopes.includes('crm.objects.deals.read'))
  assert.equal(conn.capabilities.write_tasks, true)
  const cred = (await db.query(`select access_token_enc, refresh_token_enc from private.crm_credentials`)).rows[0]
  assert.ok(cred.access_token_enc.startsWith('v1.1.')); assert.ok(!cred.access_token_enc.includes('hs-access')); assert.ok(!cred.refresh_token_enc.includes('refresh-0'))
  assert.equal(decrypt(cred.refresh_token_enc, config.encryption), 'refresh-0')
  const s = (await store.select('revenue_settings', { where: { organization_id: users.orgA } }))[0]
  assert.equal(s.timezone, 'America/Mexico_City'); assert.equal(s.currency, 'USD')
  const status = await call('GET', 'integrations/hubspot/status', { token: 't-view' })
  assert.equal(status.body.connected, true); assert.equal(status.body.connection.portal_id, '555')
  assert.equal(stripSecrets(status.body).includes('hs-access'), false); assert.equal(stripSecrets(status.body).includes('refresh'), false)
})

test('tenant swap / portal reuse: another org cannot claim a portal that is live elsewhere', async () => {
  await store.update('revenue_org_flags', { organization_id: users.orgB }, { revenue_mvp_enabled: true })
  const r = await call('POST', 'integrations/hubspot/connect', { token: 't-out', body: {} })
  const st = new URL(r.body.authorize_url).searchParams.get('state')
  const res = await call('GET', 'integrations/hubspot/callback', { query: { code: 'good-code', state: st } })
  assert.equal(new URL(res.headers.location, 'https://x').searchParams.get('reason'), 'portal_in_use')
  assert.equal((await store.select('crm_connections', { where: { organization_id: users.orgB } })).length, 0)
})

test('sync API: role checks, 202 + dedupe, metadata-only first run leads to onboarding, then the real sync via the worker', async () => {
  assert.equal((await call('POST', 'revenue/sync', { token: 't-view', body: {} })).statusCode, 403)
  assert.equal((await call('POST', 'revenue/sync', { token: 't-mem', body: {} })).statusCode, 403)
  const s1 = await call('POST', 'revenue/sync', { token: 't-mgr', body: {} })
  assert.equal(s1.statusCode, 202); assert.ok(s1.body.job_id)
  const s2 = await call('POST', 'revenue/sync', { token: 't-mgr', body: {} })
  assert.equal(s2.body.deduped, true)
  const k = await kick('t-mgr'); assert.ok(k.body.processed >= 1)
  const job = await call('GET', `revenue/jobs/${s1.body.job_id}`, { token: 't-view', query: { run: s1.body.sync_run_id } })
  assert.equal(job.body.job.status, 'succeeded'); assert.equal(job.body.sync_run.status, 'partial'); assert.ok(job.body.sync_run.warnings.includes('no_pipeline_selected'))
  // job progress is tenant scoped
  assert.equal((await call('GET', `revenue/jobs/${s1.body.job_id}`, { token: 't-out' })).statusCode, 404)
  const ob = await call('GET', 'revenue/onboarding', { token: 't-view' })
  assert.equal(ob.body.pipelines[0].external_id, 'p1')
  assert.equal(ob.body.pipelines[0].stages.find(s => s.external_id === 's_won').suggested_category, 'closed')     // from HubSpot metadata
  assert.equal(ob.body.pipelines[0].stages.find(s => s.external_id === 's_late').suggested_category, 'late')       // suggestion only
  assert.equal(ob.body.pipelines[0].stages.find(s => s.external_id === 's_late').category, 'unmapped')             // nothing is applied silently
})

test('onboarding: admin-only, validated; stage mapping + confirmation drive the state machine', async () => {
  assert.equal((await call('POST', 'revenue/onboarding', { token: 't-mgr', body: { selected_pipeline_ids: ['p1'] } })).statusCode, 403)
  assert.equal((await call('POST', 'revenue/onboarding', { token: 't-admin', body: { selected_pipeline_ids: ['nope'] } })).statusCode, 400)
  assert.equal((await call('POST', 'revenue/onboarding', { token: 't-admin', body: { timezone: 'Mars/Base' } })).statusCode, 400)
  assert.equal((await call('POST', 'revenue/onboarding', { token: 't-admin', body: { stage_categories: { s_won: 'late' } } })).statusCode, 400)   // closed stages are not editable
  let r = await call('POST', 'revenue/onboarding', { token: 't-admin', body: { selected_pipeline_ids: ['p1'] } })
  assert.equal(r.body.state, 'pipeline_selected')
  r = await call('POST', 'revenue/onboarding', { token: 't-admin', body: { stage_categories: { s_early: 'early', s_mid: 'mid', s_late: 'late' } } })
  assert.equal(r.body.state, 'stages_mapped')
  r = await call('POST', 'revenue/onboarding', { token: 't-admin', body: { timezone: 'America/Mexico_City', currency: 'USD', confirm: true } })
  assert.equal(r.body.state, 'confirmed')
})

test('full sync + diagnosis visible: overview, findings, deals, deal detail (evidence, unknowns, verified HubSpot link)', async () => {
  const s = await call('POST', 'revenue/sync', { token: 't-mgr', body: { full: true } })
  assert.equal(s.statusCode, 202)
  await kick('t-mgr'); await kick('t-mgr')          // sync, then the evaluate job it enqueued
  const ov = await call('GET', 'revenue/overview', { token: 't-view' })
  assert.equal(ov.statusCode, 200)
  assert.equal(ov.body.kpis.open_deals, 2); assert.equal(ov.body.kpis.eligible_deals, 2)
  assert.equal(typeof ov.body.kpis.revenue_score, 'number')
  const usd = ov.body.kpis.by_currency.find(c => c.currency === 'USD')
  assert.equal(usd.open_pipeline, '80000')                                     // exact, per currency
  assert.equal(ov.body.priorities.length >= 1, true)
  assert.ok(ov.body.snapshot.as_of); assert.ok(ov.body.last_sync)
  const f = await call('GET', 'revenue/findings', { token: 't-view' })
  const kinds = f.body.items.map(i => i.rule_key)
  assert.ok(kinds.includes('inactivity') && kinds.includes('no_next_step') && kinds.includes('single_contact'))
  assert.equal(f.body.groups.find(g => g.category === 'inactivity').unique_deals, 1)
  const item = f.body.items.find(i => i.rule_key === 'inactivity')
  assert.equal(item.hubspot_url, 'https://app.hubspot.com/contacts/555/record/0-3/101')
  assert.ok(item.evidence.reason); assert.ok(item.recommendation); assert.ok(item.age_days >= 0)
  // filters
  const byOwner = await call('GET', 'revenue/findings', { token: 't-view', query: { owner: 'o2' } })
  assert.ok(byOwner.body.items.every(i => i.owner === 'Bo'))
  const deals = await call('GET', 'revenue/deals', { token: 't-view' })
  assert.equal(deals.body.total, 2); assert.equal(deals.body.items[0].name, 'Stale big deal')       // worst health first
  const detail = await call('GET', `revenue/deals/${deals.body.items[0].id}`, { token: 't-view' })
  assert.equal(detail.body.deal.hubspot_url, 'https://app.hubspot.com/contacts/555/record/0-3/101')
  assert.ok(detail.body.evaluation.factors.length === 6); assert.ok(detail.body.timeline.length >= 1)
  assert.equal(detail.body.evaluation.health, 45)                                                   // 100 - inactivity(20) - no_next_step(20) - single_contact(15); band high_risk
  assert.equal(detail.body.evaluation.band, 'high_risk')
  // tenant isolation: the other org sees nothing of this
  await store.update('revenue_org_flags', { organization_id: users.orgB }, { revenue_mvp_enabled: true })
  assert.equal((await call('GET', `revenue/deals/${deals.body.items[0].id}`, { token: 't-out' })).statusCode, 404)
})

test('dismiss / snooze: reason required, evidence untouched, score unchanged', async () => {
  const before = (await call('GET', 'revenue/overview', { token: 't-view' })).body.kpis
  const list = (await call('GET', 'revenue/findings', { token: 't-view' })).body.items
  const target = list.find(i => i.rule_key === 'inactivity')
  assert.equal((await call('POST', `revenue/findings/${target.id}/preference`, { token: 't-view', body: { state: 'dismissed', reason: 'x' } })).statusCode, 403)   // viewers cannot triage
  assert.equal((await call('POST', `revenue/findings/${target.id}/preference`, { token: 't-mem', body: { state: 'dismissed' } })).statusCode, 400)
  assert.equal((await call('POST', `revenue/findings/${target.id}/preference`, { token: 't-mem', body: { state: 'snoozed', reason: 'later', until: '2020-01-01' } })).statusCode, 400)
  assert.equal((await call('POST', `revenue/findings/${target.id}/preference`, { token: 't-mem', body: { state: 'dismissed', reason: 'known customer situation' } })).statusCode, 200)
  const open = (await call('GET', 'revenue/findings', { token: 't-view' })).body.items
  assert.ok(!open.some(i => i.id === target.id))
  const dismissed = (await call('GET', 'revenue/findings', { token: 't-view', query: { status: 'dismissed' } })).body.items
  assert.equal(dismissed[0].id, target.id); assert.ok(dismissed[0].evidence.reason)
  const after = (await call('GET', 'revenue/overview', { token: 't-view' })).body.kpis
  assert.equal(after.revenue_score, before.revenue_score)               // hiding never improves the score
  assert.equal(after.by_currency[0].at_risk_amount, before.by_currency[0].at_risk_amount)
  assert.ok(after.findings_open < before.findings_open)                  // only the visible count changes
})

test('brief: enqueue -> worker -> readable; baseline on first run; AI narrative verified', async () => {
  const p = await call('POST', 'revenue/briefs', { token: 't-mem', body: { period: 'weekly' } })
  assert.equal(p.statusCode, 202)
  aiQueue.push({ status: 'completed', text: JSON.stringify({ headline: 'Two open deals need review.', summary: 'One deal is high risk.', priorities: [] }), toolCalls: [], refusal: null, output: [], usage: { input: 500, output: 100, cached: 0 } })
  await kick('t-mem')
  const list = await call('GET', 'revenue/briefs', { token: 't-view' })
  assert.equal(list.body.items.length, 1); assert.equal(list.body.items[0].is_baseline, true)
  const b = await call('GET', `revenue/briefs/${list.body.items[0].id}`, { token: 't-view' })
  assert.equal(b.body.content.comparison.available, false); assert.equal(b.body.content.ai.status, 'ok')
  assert.ok(b.body.content.top_risks[0].evidence_id)
  assert.equal((await call('POST', 'revenue/briefs', { token: 't-view', body: {} })).statusCode, 403)
})

test('ask: grounded answer with sources; private session; viewer allowed to ask but not to propose', async () => {
  aiQueue.push({ status: 'completed', text: '', output: [], refusal: null, usage: { input: 10, output: 5, cached: 0 }, toolCalls: [{ call_id: 'c1', name: 'get_pipeline_metrics', arguments: '{}', item: { type: 'function_call', call_id: 'c1', name: 'get_pipeline_metrics', arguments: '{}' } }] })
  aiQueue.push(req => { const out = JSON.parse(req.input.find(i => i.type === 'function_call_output').output); return { status: 'completed', text: JSON.stringify({ answer: `Score ${out.revenue_score}.`, citation_ids: [out.evidence_id], insufficient_data: false }), toolCalls: [], refusal: null, output: [], usage: { input: 10, output: 5, cached: 0 } } })
  const r = await call('POST', 'revenue/ask', { token: 't-view', body: { question: 'How are we doing?' } })
  assert.equal(r.statusCode, 200); assert.equal(r.body.sources.length, 1); assert.ok(r.body.data_as_of)
  const sess = await call('GET', 'revenue/chat/sessions', { token: 't-view' })
  assert.equal(sess.body.items.length, 1)
  assert.equal((await call('GET', 'revenue/chat/sessions', { token: 't-mem' })).body.items.length, 0)            // not shared
  assert.equal((await call('GET', `revenue/chat/sessions/${r.body.session_id}`, { token: 't-mem' })).statusCode, 404)
  assert.equal((await call('POST', 'revenue/ask', { token: 't-view', body: { question: '' } })).statusCode, 400)
  await store.update('revenue_org_flags', { organization_id: users.orgA }, { managed_ai_enabled: false })
  const off = await call('POST', 'revenue/ask', { token: 't-view', body: { question: 'q' } })
  assert.equal(off.statusCode, 503); assert.equal(off.body.error.reason, 'flag_disabled')
  assert.equal((await call('GET', 'revenue/overview', { token: 't-view' })).statusCode, 200)                     // deterministic product unaffected without AI
  await store.update('revenue_org_flags', { organization_id: users.orgA }, { managed_ai_enabled: true })
})

test('actions end to end: propose -> approve (manager) -> worker executes -> exactly one HubSpot task, verifiable', async () => {
  const deals = (await call('GET', 'revenue/deals', { token: 't-view' })).body.items
  const deal = deals.find(d => d.name === 'Stale big deal')
  const due = new Date(Date.now() + 2 * 86400000).toISOString()
  const created = await call('POST', 'revenue/actions', { token: 't-mem', body: { deal_id: deal.id, kind: 'create_task', payload: { subject: 'Re-engage buyer', body: 'Confirm next step', due_at: due }, rationale: 'inactive 30d' } })
  assert.equal(created.statusCode, 201); assert.equal(created.body.status, 'proposed'); assert.equal(created.body.version, 1)
  assert.equal((await call('POST', 'revenue/actions', { token: 't-view', body: { deal_id: deal.id, kind: 'create_task', payload: {} } })).statusCode, 403)
  const id = created.body.id, hash = created.body.payload_hash
  assert.equal((await call('POST', `revenue/actions/${id}/approve`, { token: 't-mem', body: { version: 1, payload_hash: hash } })).statusCode, 403)
  const edit = await call('POST', `revenue/actions/${id}/edit`, { token: 't-mem', body: { version: 1, payload: { subject: 'Re-engage buyer NOW', body: 'x', due_at: due } } })
  assert.equal(edit.body.new_version, 2)
  const stale = await call('POST', `revenue/actions/${id}/approve`, { token: 't-mgr', body: { version: 1, payload_hash: hash } })
  assert.equal(stale.statusCode, 409)
  const fresh = (await call('GET', 'revenue/actions', { token: 't-mgr' })).body.items.find(a => a.id === id)
  const [a1, a2] = [await call('POST', `revenue/actions/${id}/approve`, { token: 't-mgr', body: { version: 2, payload_hash: fresh.payload_hash } }), await call('POST', `revenue/actions/${id}/approve`, { token: 't-mgr', body: { version: 2, payload_hash: fresh.payload_hash } })]
  assert.equal(a1.statusCode, 202); assert.equal(a2.body.idempotent_replay, true)
  assert.equal(hs.state.tasks.size, 0)                      // approval alone writes nothing
  await kick('t-mgr')
  assert.equal(hs.state.tasks.size, 1)
  const task = [...hs.state.tasks.values()][0]
  assert.equal(task.properties.hs_task_subject, 'Re-engage buyer NOW'); assert.equal(task.associations[0].to.id, '101')
  const done = (await call('GET', 'revenue/actions', { token: 't-view' })).body.items.find(a => a.id === id)
  assert.equal(done.status, 'succeeded'); assert.equal(done.result.external_result_id, 'task-1')
  await kick('t-mgr'); assert.equal(hs.state.tasks.size, 1)   // still one
  const audit = (await store.select('revenue_audit_events', { where: { organization_id: users.orgA, entity_id: id } })).map(e => e.event)
  for (const ev of ['action.proposed', 'action.edited', 'action.approved', 'action.succeeded']) assert.ok(audit.includes(ev), ev)
})

test('token refresh: concurrent callers refresh once, rotated refresh token is persisted; invalid_grant => reconnect_required', async () => {
  const [conn] = await store.select('crm_connections', { where: { organization_id: users.orgA } })
  await db.query(`update private.crm_credentials set expires_at = now() - interval '1 minute'`)
  ff.state.refreshCount = 0; ff.state.refreshDelayMs = 60
  const mk = w => createTokenProvider({ store, config, connectionId: conn.id, orgId: users.orgA, workerId: w, fetchImpl: ff.fetchImpl })
  const [t1, t2, t3] = await Promise.all([mk('w1')({}), mk('w2')({}), mk('w3')({})])
  assert.equal(ff.state.refreshCount, 1); assert.equal(t1, t2); assert.equal(t2, t3)
  const row = (await db.query(`select refresh_token_enc, key_version from private.crm_credentials`)).rows[0]
  assert.equal(decrypt(row.refresh_token_enc, config.encryption), ff.state.currentRefresh)
  assert.notEqual(ff.state.currentRefresh, 'refresh-0')                       // rotation stored atomically
  await db.query(`update private.crm_credentials set expires_at = now() - interval '1 minute'`)
  ff.state.refreshInvalid = true; ff.state.refreshDelayMs = 0
  await assert.rejects(mk('w4')({}), e => e.name === 'ReconnectRequired')
  assert.equal((await store.select('crm_connections', { where: { id: conn.id } }))[0].status, 'reconnect_required')
  const s = await call('POST', 'revenue/sync', { token: 't-mgr', body: {} })
  assert.equal(s.statusCode, 409); assert.equal(s.body.error.code, 'reconnect_required')
  ff.state.refreshInvalid = false
})

test('disconnect: confirmation required, revokes at HubSpot, drops credentials, stops jobs and pending actions', async () => {
  assert.equal((await call('POST', 'integrations/hubspot/disconnect', { token: 't-mgr', body: { confirm: true } })).statusCode, 403)
  assert.equal((await call('POST', 'integrations/hubspot/disconnect', { token: 't-admin', body: {} })).statusCode, 400)
  const r = await call('POST', 'integrations/hubspot/disconnect', { token: 't-admin', body: { confirm: true } })
  assert.equal(r.statusCode, 200); assert.equal(r.body.disconnected, true)
  assert.equal((await db.query(`select count(*)::int c from private.crm_credentials`)).rows[0].c, 0)
  assert.equal((await call('POST', 'revenue/sync', { token: 't-mgr', body: {} })).statusCode, 409)
  const st = await call('GET', 'integrations/hubspot/status', { token: 't-view' })
  assert.equal(st.body.connected, false)
  // data is retained (history), not purged
  assert.ok((await store.select('crm_deals', { where: { organization_id: users.orgA } })).length >= 2)
})

test('responses never leak secrets; errors carry a request id and no stack', async () => {
  const r = await call('GET', 'revenue/deals/not-a-uuid', { token: 't-view' })
  assert.equal(r.statusCode, 400); assert.ok(r.body.error.request_id); assert.equal(JSON.stringify(r.body).includes('at '), false)
})

test('worker tick also answers GET (Vercel Cron) and accepts CRON_SECRET as the credential', async () => {
  assert.equal((await call('GET', 'revenue/worker/tick', { token: 'w-secret' })).statusCode, 200)
  assert.equal((await call('GET', 'revenue/worker/tick', { token: 'nope' })).statusCode, 401)
  const { cfg } = await import('../../api/_lib/env.js')
  assert.equal(cfg({ CRON_SECRET: 'cron-s' }).workerSecret, 'cron-s')
  assert.equal(cfg({ CRON_SECRET: 'cron-s', REVENUE_WORKER_SECRET: 'w' }).workerSecret, 'w')
})
