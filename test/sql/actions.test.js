import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, applyBaseline, applyMigrations, seedUser } from './helpers.js'
import { createPgStore } from './pgstore.js'
import { createProposal, editProposal, approveProposal, rejectProposal, executeAction, reconcileExecution, marker } from '../../api/_lib/revenue/actions.js'
import { HubSpotError, HubSpotForbidden } from '../../api/_lib/hubspot/client.js'
import { HttpError } from '../../api/_lib/http.js'

let db, store, orgId, admin, manager, member, connId, dealId
const rid = 'req-test-1'
const ctx = (userId, role) => ({ userId, orgId, role })

function fakeClient(overrides = {}) {
  const log = { posts: [], patches: [], gets: [] }
  const c = {
    log,
    async get(path) { log.gets.push(path); return overrides.get ? overrides.get(path) : { id: '1', properties: { hs_is_closed: 'false', hs_next_step: 'old', closedate: '2026-10-01', hubspot_owner_id: '77' } } },
    async post(path, body) { log.posts.push({ path, body }); if (overrides.post) return overrides.post(path, body); return { id: 'task-1' } },
    async request(method, path, { body }) { log.patches.push({ method, path, body }); if (overrides.patch) return overrides.patch(); return {} },
  }
  return c
}
const run = (execId, client) => executeAction({ store, orgId, executionId: execId, getClient: async () => client })
const inOneHour = () => new Date(Date.now() + 3600_000).toISOString()

before(async () => {
  db = await newDb(); await applyBaseline(db); await applyMigrations(db)
  store = createPgStore(db)
  admin = await seedUser(db, 'admin@a.com')
  orgId = await store.rpc('rv_ensure_user_org', { _user: admin, _name: 'Acme' })
  manager = await seedUser(db, 'mgr@a.com'); member = await seedUser(db, 'mem@a.com')
  await store.insert('organization_members', [{ organization_id: orgId, user_id: manager, role: 'manager' }, { organization_id: orgId, user_id: member, role: 'member' }])
  connId = (await store.insert('crm_connections', [{ organization_id: orgId, provider: 'hubspot', portal_id: '4242', status: 'active', capabilities: { write_tasks: true, write_deals: true } }]))[0].id
  dealId = (await store.insert('crm_deals', [{ organization_id: orgId, connection_id: connId, external_id: '1', name: 'Big deal', owner_external_id: '77' }]))[0].id
  await store.update('revenue_org_flags', { organization_id: orgId }, { hubspot_write_actions_enabled: true })
})

const newTask = (over = {}) => createProposal({ store, ctx: ctx(member, 'member'), dealId, kind: 'create_task', payload: { subject: 'Call buyer', body: 'Confirm budget', due_at: inOneHour(), ...over }, requestId: rid })

test('payload validation: allowlist, dates, unsupported fields', async () => {
  await assert.rejects(newTask({ due_at: '2020-01-01T00:00:00Z' }), /future/)
  await assert.rejects(newTask({ subject: '' }), /subject/)
  await assert.rejects(createProposal({ store, ctx: ctx(member, 'member'), dealId, kind: 'update_deal_fields', payload: { changes: { amount: { before: '1', after: '2' } } } }), /cannot be changed/)
  await assert.rejects(createProposal({ store, ctx: ctx(member, 'member'), dealId, kind: 'send_email', payload: {} }), /Unsupported/)
  await assert.rejects(createProposal({ store, ctx: ctx(member, 'member'), dealId: '00000000-0000-0000-0000-000000000000', kind: 'create_task', payload: {} }), /not found/i)
})

test('approval: member cannot approve, flag off blocks, double click enqueues exactly one job, execution creates ONE task', async () => {
  const p = await newTask()
  await assert.rejects(approveProposal({ store, ctx: ctx(member, 'member'), proposalId: p.id, version: 1, hash: p.payload_hash }), e => e.status === 403)
  await store.update('revenue_org_flags', { organization_id: orgId }, { hubspot_write_actions_enabled: false })
  await assert.rejects(approveProposal({ store, ctx: ctx(manager, 'manager'), proposalId: p.id, version: 1, hash: p.payload_hash }), e => e.code === 'feature_disabled')
  await store.update('revenue_org_flags', { organization_id: orgId }, { hubspot_write_actions_enabled: true })
  const [a, b] = await Promise.all([1, 2].map(() => approveProposal({ store, ctx: ctx(manager, 'manager'), proposalId: p.id, version: 1, hash: p.payload_hash, requestId: rid })))
  const results = [a, b]
  assert.equal(results.filter(r => r.status === 'approved').length, 1)
  assert.equal(results.filter(r => r.idempotent_replay).length, 1)
  const jobs = (await db.query(`select count(*)::int c from private.revenue_jobs where kind='execute_action' and payload->>'proposal_id' = $1`, [p.id])).rows[0].c
  assert.equal(jobs, 1)
  const exec = (await store.select('revenue_action_executions', { where: { proposal_id: p.id } }))
  assert.equal(exec.length, 1)
  const client = fakeClient()
  const r1 = await run(exec[0].id, client)
  assert.equal(r1.outcome, 'succeeded')
  assert.equal(client.log.posts.length, 1)
  const post = client.log.posts[0]
  assert.equal(post.path, '/crm/v3/objects/tasks')
  assert.equal(post.body.associations[0].to.id, '1')
  assert.ok(post.body.properties.hs_task_body.includes(marker(exec[0].idempotency_key)))    // reconcilable marker
  assert.equal((await store.select('revenue_action_proposals', { where: { id: p.id } }))[0].status, 'succeeded')
  // running the same execution again never writes twice
  const r2 = await run(exec[0].id, client)
  assert.match(r2.outcome, /already_succeeded/)
  assert.equal(client.log.posts.length, 1)
  const audit = (await store.select('revenue_audit_events', { where: { organization_id: orgId, entity_id: p.id } })).map(a => a.event)
  assert.ok(['action.proposed', 'action.approved', 'action.succeeded'].every(e => audit.includes(e)), audit.join())
})

async function approved() {
  const p = await newTask()
  const a = await approveProposal({ store, ctx: ctx(manager, 'manager'), proposalId: p.id, version: 1, hash: p.payload_hash })
  return { p, execId: a.execution_id }
}

test('edit after approval voids the approval; old execution cannot run; new version needs fresh approval', async () => {
  const { p, execId } = await approved()
  const edited = await editProposal({ store, ctx: ctx(member, 'member'), proposalId: p.id, baseVersion: 1, payload: { subject: 'Different', body: '', due_at: inOneHour() }, requestId: rid })
  assert.equal(edited.new_version, 2)
  const cur = (await store.select('revenue_action_proposals', { where: { id: p.id } }))[0]
  assert.equal(cur.status, 'proposed'); assert.equal(cur.approved_by, null)
  const client = fakeClient()
  assert.match((await run(execId, client)).outcome, /already_failed/)
  assert.equal(client.log.posts.length, 0)
  // approving the OLD version/hash is rejected
  await assert.rejects(approveProposal({ store, ctx: ctx(manager, 'manager'), proposalId: p.id, version: 1, hash: p.payload_hash }), e => e.code === 'stale_version')
  const ok = await approveProposal({ store, ctx: ctx(manager, 'manager'), proposalId: p.id, version: 2, hash: cur.payload_hash })
  assert.equal(ok.status, 'approved')
})

test('a payload tampered directly in the DB after approval is refused at execution', async () => {
  const { p, execId } = await approved()
  await db.query(`update public.revenue_action_proposals set payload = jsonb_set(payload, '{subject}', '"Evil"') where id = $1`, [p.id])
  const client = fakeClient()
  assert.equal((await run(execId, client)).outcome, 'failed')
  assert.equal(client.log.posts.length, 0)
})

test('approver loses permission before execution => nothing is written', async () => {
  const { execId } = await approved()
  await store.update('organization_members', { organization_id: orgId, user_id: manager }, { role: 'viewer' })
  const client = fakeClient()
  assert.equal((await run(execId, client)).outcome, 'failed')
  assert.equal(client.log.posts.length, 0)
  await store.update('organization_members', { organization_id: orgId, user_id: manager }, { role: 'manager' })
})

test('connection not active / write capability missing / portal changed => failed, no write', async () => {
  for (const [patch, restore] of [[{ status: 'reconnect_required' }, { status: 'active' }], [{ capabilities: { write_tasks: false } }, { capabilities: { write_tasks: true, write_deals: true } }]]) {
    const { execId } = await approved()
    await store.update('crm_connections', { id: connId }, patch)
    const client = fakeClient()
    assert.equal((await run(execId, client)).outcome, 'failed')
    assert.equal(client.log.posts.length, 0)
    await store.update('crm_connections', { id: connId }, restore)
  }
})

test('expiry between approval and execution => failed + proposal expired', async () => {
  const { p, execId } = await approved()
  await db.query(`update public.revenue_action_proposals set expires_at = now() - interval '1 second' where id = $1`, [p.id])
  const client = fakeClient()
  assert.equal((await run(execId, client)).outcome, 'failed')
  assert.equal((await store.select('revenue_action_proposals', { where: { id: p.id } }))[0].status, 'expired')
  assert.equal(client.log.posts.length, 0)
})

test('remote conflict (deal closed in HubSpot) => conflict, no write', async () => {
  const { p, execId } = await approved()
  const client = fakeClient({ get: () => ({ id: '1', properties: { hs_is_closed: 'true' } }) })
  assert.equal((await run(execId, client)).outcome, 'conflict')
  assert.equal(client.log.posts.length, 0)
  assert.equal((await store.select('revenue_action_proposals', { where: { id: p.id } }))[0].status, 'conflict')
})

test('update_deal_fields: before-image must still match remote; then PATCH once', async () => {
  const mk = () => createProposal({ store, ctx: ctx(member, 'member'), dealId, kind: 'update_deal_fields', payload: { changes: { hs_next_step: { before: 'old', after: 'Send contract' } } }, requestId: rid })
  let p = await mk()
  let a = await approveProposal({ store, ctx: ctx(manager, 'manager'), proposalId: p.id, version: 1, hash: p.payload_hash })
  const stale = fakeClient({ get: () => ({ id: '1', properties: { hs_is_closed: 'false', hs_next_step: 'someone else edited' } }) })
  assert.equal((await run(a.execution_id, stale)).outcome, 'conflict'); assert.equal(stale.log.patches.length, 0)
  p = await mk(); a = await approveProposal({ store, ctx: ctx(manager, 'manager'), proposalId: p.id, version: 1, hash: p.payload_hash })
  const ok = fakeClient()
  assert.equal((await run(a.execution_id, ok)).outcome, 'succeeded')
  assert.deepEqual(ok.log.patches[0].body, { properties: { hs_next_step: 'Send contract' } })
})

test('ambiguous timeout after a possible write => needs_review + reconcile job; NO blind retry; reconcile by marker', async () => {
  const { p, execId } = await approved()
  const client = fakeClient({ post: () => { throw new HubSpotError(0, 'HubSpot unreachable', { retryable: true }) } })
  assert.equal((await run(execId, client)).outcome, 'needs_review')
  assert.equal(client.log.posts.length, 1)
  const st = (await store.select('revenue_action_executions', { where: { id: execId } }))[0]
  assert.equal(st.status, 'needs_review'); assert.equal(st.uncertain, true)
  // the job/worker restarting and re-running does not post again
  assert.match((await run(execId, client)).outcome, /already_needs_review/)
  assert.equal(client.log.posts.length, 1)
  assert.equal((await db.query(`select count(*)::int c from private.revenue_jobs where kind='reconcile' and dedupe_key = $1`, ['reconcile:' + execId])).rows[0].c, 1)
  // search finds nothing yet (index lag): stays needs_review
  const none = fakeClient({ post: () => ({ results: [] }) })
  assert.equal((await reconcileExecution({ store, orgId, executionId: execId, getClient: async () => none })).outcome, 'needs_review')
  // search finds exactly the marked task: resolved without creating another
  const found = fakeClient({ post: () => ({ results: [{ id: 'task-99' }] }) })
  const r = await reconcileExecution({ store, orgId, executionId: execId, getClient: async () => found })
  assert.equal(r.outcome, 'succeeded')
  assert.equal((await store.select('revenue_action_proposals', { where: { id: p.id } }))[0].status, 'succeeded')
})

test('worker restart mid-execution (execution already running) => needs_review, never re-run', async () => {
  const { execId } = await approved()
  await store.rpc('rv_begin_execution', { _org: orgId, _exec: execId })          // first worker started, then died
  const client = fakeClient()
  assert.equal((await run(execId, client)).outcome, 'needs_review')
  assert.equal(client.log.posts.length, 0)
  // the crash recovery also schedules a reconcile job that will look for the marker in HubSpot
  assert.equal((await db.query(`select count(*)::int c from private.revenue_jobs where kind='reconcile' and dedupe_key = $1`, ['reconcile:' + execId])).rows[0].c, 1)
})

test('HubSpot 403 on write => failed with an actionable message', async () => {
  for (const err of [new HubSpotForbidden('/x', 'MISSING_SCOPES')]) {
    const { execId } = await approved()
    const client = fakeClient({ post: () => { throw err } })
    assert.equal((await run(execId, client)).outcome, 'failed')
    const e = (await store.select('revenue_action_executions', { where: { id: execId } }))[0]
    assert.match(e.error, /denied the write/)
  }
})

test('reject and disconnect cancel pending work', async () => {
  const { p, execId } = await approved()
  await rejectProposal({ store, ctx: ctx(manager, 'manager'), proposalId: p.id, reason: 'not now', requestId: rid })
  assert.equal((await store.select('revenue_action_proposals', { where: { id: p.id } }))[0].status, 'rejected')
  assert.match((await run(execId, fakeClient())).outcome, /already_failed/)
  await assert.rejects(rejectProposal({ store, ctx: ctx(member, 'member'), proposalId: p.id, reason: 'x' }), e => e.status === 403)
  const q = await newTask()
  await store.rpc('rv_disconnect_connection', { _org: orgId, _conn: connId, _actor: admin, _request_id: rid })
  assert.equal((await store.select('revenue_action_proposals', { where: { id: q.id } }))[0].status, 'cancelled')
})

test('cross-tenant: an org-B manager cannot approve an org-A proposal', async () => {
  const u = await seedUser(db, 'b@b.com'); const orgB = await store.rpc('rv_ensure_user_org', { _user: u, _name: 'B' })
  const p = await createProposal({ store, ctx: ctx(member, 'member'), dealId, kind: 'email_draft', payload: { subject: 's', body: 'b' } }).catch(e => e)
  const id = p.id ?? (await store.select('revenue_action_proposals', { where: { organization_id: orgId }, limit: 1 }))[0].id
  await assert.rejects(approveProposal({ store, ctx: { userId: u, orgId: orgB, role: 'admin' }, proposalId: id, version: 1, hash: 'x' }), e => e instanceof HttpError && e.status === 404)
})
