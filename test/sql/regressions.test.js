// Regression tests for defects found in the independent code review.
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { newDb, applyBaseline, applyMigrations } from './helpers.js'
import { createPgStore } from './pgstore.js'
import { seedOrg, NOW } from '../helpers/seedOrg.js'
import { evaluateOrg } from '../../api/_lib/revenue/evaluate.js'
import { requestSync } from '../../api/_lib/revenue/syncRequest.js'
import { enqueue } from '../../api/_lib/jobs.js'
import { setFindingPreference, listFindings } from '../../api/_lib/revenue/queries.js'
import { publishRuleset, getRules } from '../../api/_lib/revenue/onboarding.js'
import { createProposal, approveProposal, executeAction } from '../../api/_lib/revenue/actions.js'
import { createTokenProvider } from '../../api/_lib/hubspot/tokens.js'
import { encrypt } from '../../api/_lib/crypto.js'
import { legacyOutreachAllowed } from '../../api/_lib/auth.js'
import { HttpError } from '../../api/_lib/http.js'

let db, store, A, config
const asOf = new Date(NOW).toISOString()

before(async () => {
  db = await newDb(); await applyBaseline(db); await applyMigrations(db)
  store = createPgStore(db)
  A = await seedOrg(db, store, { name: 'A', portal: '1', email: 'a@a.com' })
  config = { hubspot: { clientId: 'c', clientSecret: 's', redirectUri: 'r', apiBase: 'https://api.hubapi.com' }, encryption: { key: randomBytes(32).toString('base64'), keyId: '1' } }
})

test('findings of a deal that closed are resolved (history kept), so they can never be cited as risks', async () => {
  const d1 = A.dealId('d1')
  const before = await store.select('revenue_findings', { where: { organization_id: A.orgId, deal_id: d1, status: 'open' } })
  assert.ok(before.length >= 1)
  const [won] = await store.select('crm_stages', { where: { organization_id: A.orgId, external_id: 's_won' } })
  await store.update('crm_deals', { id: d1 }, { stage_id: won.id, stage_external_id: 's_won' })
  await evaluateOrg({ store, orgId: A.orgId, asOf: new Date(NOW + 60_000).toISOString() })
  const after = await store.select('revenue_findings', { where: { organization_id: A.orgId, deal_id: d1 } })
  assert.equal(after.filter(f => f.status === 'open').length, 0)
  assert.equal(after.length, before.length)                                        // history preserved
  assert.ok(after.every(f => f.resolved_at && f.evidence))
  const list = await listFindings({ store, orgId: A.orgId })
  assert.ok(!list.items.some(i => i.deal_id === d1))
  // back to open: findings are re-opened when the rules trigger again
  const [late] = await store.select('crm_stages', { where: { organization_id: A.orgId, external_id: 's_late' } })
  await store.update('crm_deals', { id: d1 }, { stage_id: late.id, stage_external_id: 's_late' })
  await evaluateOrg({ store, orgId: A.orgId, asOf: new Date(NOW + 120_000).toISOString() })
  assert.ok((await store.select('revenue_findings', { where: { organization_id: A.orgId, deal_id: d1, status: 'open' } })).length >= 1)
})

test('a sync run whose job died cannot block future syncs; disconnect cancels runs', async () => {
  const [conn] = await store.select('crm_connections', { where: { organization_id: A.orgId } })
  await db.query(`update public.revenue_sync_runs set status = 'succeeded'`)
  const r1 = await requestSync({ store, enqueue, orgId: A.orgId, userId: A.user })
  assert.ok(r1.job_id && !r1.deduped)
  const again = await requestSync({ store, enqueue, orgId: A.orgId, userId: A.user })
  assert.equal(again.deduped, true)                                                // live job: deduped
  await db.query(`update private.revenue_jobs set status = 'dead', finished_at = now() where id = $1`, [r1.job_id])   // e.g. exhausted lease
  const r2 = await requestSync({ store, enqueue, orgId: A.orgId, userId: A.user })
  assert.ok(r2.job_id && !r2.deduped && r2.sync_run_id !== r1.sync_run_id)         // stale run closed, new one created
  assert.equal((await store.select('revenue_sync_runs', { where: { id: r1.sync_run_id } }))[0].status, 'failed')
  await store.rpc('rv_disconnect_connection', { _org: A.orgId, _conn: conn.id, _actor: A.user, _request_id: 'r' })
  assert.equal((await store.select('revenue_sync_runs', { where: { id: r2.sync_run_id } }))[0].status, 'cancelled')
  // restore a live connection for the following tests
  await db.query(`update public.crm_connections set status = 'active', disconnected_at = null where id = $1`, [conn.id])
})

test('restoring a finding really removes the preference so it can be dismissed again', async () => {
  const [f] = await store.select('revenue_findings', { where: { organization_id: A.orgId, status: 'open' }, limit: 1 })
  const ctx = { orgId: A.orgId, userId: A.user, role: 'admin' }
  await setFindingPreference({ store, ctx, findingId: f.id, state: 'dismissed', reason: 'known' })
  assert.equal((await store.select('revenue_finding_preferences', { where: { finding_id: f.id } })).length, 1)
  await setFindingPreference({ store, ctx, findingId: f.id, state: 'clear' })
  assert.equal((await store.select('revenue_finding_preferences', { where: { finding_id: f.id } })).length, 0)
  await setFindingPreference({ store, ctx, findingId: f.id, state: 'clear' })       // idempotent, no error when nothing to clear
  await setFindingPreference({ store, ctx, findingId: f.id, state: 'snoozed', reason: 'later', until: new Date(Date.now() + 86400000).toISOString() })
  assert.equal((await store.select('revenue_finding_preferences', { where: { finding_id: f.id } }))[0].state, 'snoozed')
})

test('publishing rules merges per key: another currency or an earlier tweak is never erased', async () => {
  const ctx = { orgId: A.orgId, userId: A.user, role: 'admin' }
  await publishRuleset({ store, ctx, body: { thresholds: { inactivity_days: 30 } } })
  const r2 = await publishRuleset({ store, ctx, body: { thresholds: { single_contact_min_amount: { EUR: '18000' } } } })
  const rules = await getRules({ store, orgId: A.orgId })
  assert.equal(rules.version, r2.version)
  assert.equal(rules.thresholds.inactivity_days, 30)                                // earlier version's tweak survives
  assert.deepEqual(rules.thresholds.single_contact_min_amount, { USD: '20000', EUR: '18000' })
  await assert.rejects(publishRuleset({ store, ctx: { ...ctx, role: 'manager' }, body: {} }), e => e.status === 403)
})

test('HubSpot client misconfiguration (bad client secret) does not flip connections to reconnect_required', async () => {
  const [conn] = await store.select('crm_connections', { where: { organization_id: A.orgId, status: 'active' } })
  const a = encrypt('access', config.encryption), r = encrypt('refresh', config.encryption)
  await db.query(`insert into private.crm_credentials (connection_id, organization_id, access_token_enc, refresh_token_enc, expires_at, key_version) values ($1,$2,$3,$4, now() - interval '1 minute', '1')`, [conn.id, A.orgId, a.value, r.value])
  const badClient = async () => new Response(JSON.stringify({ status: 'BAD_CLIENT_SECRET', message: 'invalid client' }), { status: 401 })
  const provider = createTokenProvider({ store, config, connectionId: conn.id, orgId: A.orgId, workerId: 'w', fetchImpl: badClient, sleep: async () => {} })
  await assert.rejects(provider({}), e => e instanceof HttpError && e.status === 503 && /client credentials/.test(e.message))
  assert.equal((await store.select('crm_connections', { where: { id: conn.id } }))[0].status, 'active')
  // ...whereas a rejected refresh token still does
  const badGrant = async () => new Response(JSON.stringify({ status: 'BAD_REFRESH_TOKEN' }), { status: 400 })
  await assert.rejects(createTokenProvider({ store, config, connectionId: conn.id, orgId: A.orgId, workerId: 'w2', fetchImpl: badGrant, sleep: async () => {} })({}), e => e.name === 'ReconnectRequired')
})

test('an unexpected exception during execution settles the execution (never strands the proposal in executing)', async () => {
  await db.query(`update public.crm_connections set status = 'active' where status <> 'disconnected'`)  // previous test left it reconnect_required
  const mk = async () => {
    const p = await createProposal({ store, ctx: { orgId: A.orgId, userId: A.user, role: 'member' }, dealId: A.dealId('d1'), kind: 'create_task', payload: { subject: 's', body: '', due_at: new Date(Date.now() + 3600_000).toISOString() } })
    const ap = await approveProposal({ store, ctx: { orgId: A.orgId, userId: A.user, role: 'admin' }, proposalId: p.id, version: 1, hash: p.payload_hash })
    return { p, execId: ap.execution_id }
  }
  // (1) a failure BEFORE the write (the HubSpot read blows up with a non-HubSpot error path) -> failed, nothing written
  let { p, execId } = await mk()
  const readBoom = { get: async () => { throw new TypeError('kaboom') }, post: async () => { throw new Error('must not write') }, request: async () => ({}) }
  // TypeError is treated as "possible write" by the transport catch, so simulate a pre-write crash in the loader instead:
  const badFactory = async () => { throw new Error('token store down') }
  let r = await executeAction({ store, orgId: A.orgId, executionId: execId, getClient: badFactory })
  assert.equal(r.outcome, 'failed')
  let ex = (await store.select('revenue_action_executions', { where: { id: execId } }))[0]
  assert.equal(ex.status, 'failed'); assert.equal(ex.uncertain, false)
  assert.equal((await store.select('revenue_action_proposals', { where: { id: p.id } }))[0].status, 'failed')
  // (2) failure AFTER the write started (verification/finish path throws) -> needs_review + uncertain
  ;({ p, execId } = await mk())
  const posts = []
  const client = { get: async (path) => ({ id: '1', properties: { hs_is_closed: 'false' } }), post: async (path, body) => { posts.push(path); return { id: 'task-x' } }, request: async () => ({}) }
  client.get = async (path) => { if (path.includes('/tasks/')) throw new Error('verify failed'); return { id: '1', properties: { hs_is_closed: 'false' } } }
  r = await executeAction({ store, orgId: A.orgId, executionId: execId, getClient: async () => client })
  assert.equal(r.outcome, 'needs_review'); assert.equal(posts.length, 1)
  ex = (await store.select('revenue_action_executions', { where: { id: execId } }))[0]
  assert.equal(ex.uncertain, true); assert.equal(ex.external_result_id, 'task-x')
  void readBoom
})

test('legacy gate: fail-closed semantics', async () => {
  const boom = { configured: true, rpc: async () => { throw new HttpError(503, 'dependency_unavailable', 'down') } }
  await assert.rejects(legacyOutreachAllowed('u', boom), e => e.status === 503)                       // callers translate to 503
  assert.equal(await legacyOutreachAllowed('u', { configured: false }, { strict: false }), true)      // pre-migration install
  await assert.rejects(legacyOutreachAllowed('u', { configured: false }, { strict: true }), e => e.status === 503)
  assert.equal(await legacyOutreachAllowed('u', { configured: true, rpc: async () => false }), false)
})
