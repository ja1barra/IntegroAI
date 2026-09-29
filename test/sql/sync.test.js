import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, applyBaseline, applyMigrations, seedUser } from './helpers.js'
import { createPgStore } from './pgstore.js'
import { createFakeHubspot, HubSpotRateLimited } from '../helpers/fakeHubspot.js'
import { runSync, TimeBudgetExceeded } from '../../api/_lib/hubspot/sync.js'
import { evaluateOrg } from '../../api/_lib/revenue/evaluate.js'

let db, store, orgId, connId, user, fake
const NOW = Date.parse('2026-09-28T12:00:00Z')
const ago = d => new Date(NOW - d * 86400000).toISOString()
const fut = d => new Date(NOW + d * 86400000).toISOString()

async function newRun(kind = 'incremental') {
  return (await store.insert('revenue_sync_runs', [{ organization_id: orgId, connection_id: connId, kind, status: 'queued' }]))[0].id
}
const sync = (runId, extra = {}) => runSync({ store, client: fake.client, orgId, connectionId: connId, runId, deadline: (extra.now?.() ?? NOW) + 3_600_000, now: () => NOW, ...extra })

before(async () => {
  db = await newDb(); await applyBaseline(db); await applyMigrations(db)
  store = createPgStore(db)
  user = await seedUser(db, 'sync@x.com', 'SyncCo')
  orgId = await store.rpc('rv_ensure_user_org', { _user: user, _name: 'SyncCo' })
  connId = (await store.insert('crm_connections', [{ organization_id: orgId, provider: 'hubspot', portal_id: '999', status: 'active' }]))[0].id
  await store.update('revenue_settings', { organization_id: orgId }, { selected_pipeline_ids: ['p1'], timezone: 'UTC', currency: 'USD' })

  fake = createFakeHubspot()
  fake.state.clock = () => NOW
  const { addDeal } = fake
  // d1: late-stage, one contact, stale email, no next step  => inactivity + no_next_step + single_contact
  addDeal('d1', { dealstage: 's_late', amount: '50000', hs_date_entered_s_late: ago(5) }, { history: [{ value: 's_early', timestamp: ago(60) }, { value: 's_late', timestamp: ago(5) }] })
  fake.state.assoc.contacts.set('d1', ['c1'])
  fake.state.contacts.set('c1', { id: 'c1', properties: { firstname: 'Cy', lastname: 'Buyer', jobtitle: 'VP' } })
  fake.state.assoc.emails.set('d1', ['e1'])
  fake.state.acts.emails.set('e1', { id: 'e1', properties: { hs_timestamp: ago(30), hs_email_status: 'SENT', hs_email_direction: 'EMAIL' } })
  // d2: healthy
  addDeal('d2', { dealstage: 's_late', amount: '30000', hs_date_entered_s_late: ago(3), hubspot_owner_id: 'o2' })
  fake.state.assoc.contacts.set('d2', ['c2', 'c3'])
  for (const c of ['c2', 'c3']) fake.state.contacts.set(c, { id: c, properties: { firstname: c } })
  fake.state.assoc.calls.set('d2', ['k1']); fake.state.acts.calls.set('k1', { id: 'k1', properties: { hs_timestamp: ago(2), hs_call_status: 'COMPLETED' } })
  fake.state.assoc.tasks.set('d2', ['t1']); fake.state.acts.tasks.set('t1', { id: 't1', properties: { hs_timestamp: fut(3), hs_task_status: 'NOT_STARTED' } })
  // d3: closed won (must not be scored)
  addDeal('d3', { dealstage: 's_won', hs_is_closed: 'true', amount: '99999' })
  // d4: no owner (empty), early stage
  addDeal('d4', { dealstage: 's_early', hubspot_owner_id: null, hs_date_entered_s_early: ago(2) })
})

test('full sync mirrors pipelines/stages/deals; closed stage metadata comes from HubSpot, not labels', async () => {
  const runId = await newRun('full')
  const r = await sync(runId)
  assert.equal(r.status, 'succeeded')
  const stages = await store.select('crm_stages', { where: { organization_id: orgId } })
  assert.equal(stages.find(s => s.external_id === 's_won').category, 'closed')
  assert.equal(stages.find(s => s.external_id === 's_late').category, 'unmapped') // open stages await admin mapping
  const deals = await store.select('crm_deals', { where: { organization_id: orgId }, columns: 'external_id,amount::text,currency,owner_state,stage_entered_at' })
  assert.equal(deals.length, 4)
  assert.equal(deals.find(d => d.external_id === 'd1').amount, '50000.0000')
  assert.equal(deals.find(d => d.external_id === 'd4').owner_state, 'empty')
  assert.ok(deals.find(d => d.external_id === 'd1').stage_entered_at)
  const run = (await store.select('revenue_sync_runs', { where: { id: runId } }))[0]
  assert.equal(run.status, 'succeeded'); assert.equal(run.coverage.summary.activities, 'complete')
  // an evaluate job was enqueued by the sync (outbox), deduped
  const job = (await db.query(`select kind, dedupe_key from private.revenue_jobs where kind='evaluate'`)).rows
  assert.equal(job.length, 1)
})

test('stage history mirrored and used as fallback; associations/activities linked', async () => {
  assert.equal((await store.select('crm_property_history', { where: { organization_id: orgId } })).length >= 2, true)
  const assoc = await store.select('crm_associations', { where: { organization_id: orgId, from_type: 'email', to_external_id: 'd1' } })
  assert.equal(assoc.length, 1)
  const co = await store.select('crm_contacts', { where: { organization_id: orgId } })
  assert.equal(co.length, 3)
})

test('evaluation: findings, exact Health, snapshot + score; unmapped late stage => no_next_step unknown until admin maps', async () => {
  let res = await evaluateOrg({ store, orgId, asOf: new Date(NOW).toISOString(), syncRunId: null })
  let find = await store.select('revenue_findings', { where: { organization_id: orgId } })
  const deals = new Map((await store.select('crm_deals', { where: { organization_id: orgId }, columns: 'id,external_id' })).map(d => [d.id, d.external_id]))
  const keys = f => f.filter(x => x.status === 'open').map(x => `${deals.get(x.deal_id)}:${x.rule_key}`).sort()
  assert.ok(keys(find).includes('d1:inactivity'))
  assert.ok(!keys(find).includes('d1:no_next_step'))          // stage unmapped => unknown, NOT a confirmed absence
  assert.ok(keys(find).includes('d4:missing_owner'))
  assert.ok(!keys(find).some(k => k.startsWith('d3:')))         // closed deal produces nothing
  // admin maps the stages -> next evaluation flags the missing next step
  await store.update('crm_stages', { organization_id: orgId, external_id: 's_late' }, { category: 'late', category_source: 'admin' })
  await store.update('crm_stages', { organization_id: orgId, external_id: 's_early' }, { category: 'early', category_source: 'admin' })
  await store.update('crm_stages', { organization_id: orgId, external_id: 's_mid' }, { category: 'mid', category_source: 'admin' })
  res = await evaluateOrg({ store, orgId, asOf: new Date(NOW).toISOString(), syncRunId: null })
  find = await store.select('revenue_findings', { where: { organization_id: orgId } })
  assert.ok(keys(find).includes('d1:no_next_step'))
  assert.ok(keys(find).includes('d1:single_contact'))          // 50,000 > 20,000 USD with a single contact
  assert.ok(!keys(find).some(k => k.startsWith('d2:') && k !== 'd2:stalled_stage'))
  const snap = (await store.select('revenue_score_snapshots', { where: { organization_id: orgId }, order: 'created_at.desc', limit: 1 }))[0]
  assert.equal(snap.total_open_count, 3)                        // d1,d2,d4 (d3 closed)
  assert.ok(snap.metrics.by_currency.find(c => c.currency === 'USD'))
  const items = await store.select('revenue_snapshot_items', { where: { snapshot_id: snap.id } })
  assert.equal(items.length, 3)
  assert.equal(res.open, 3)
})

test('incremental sync with watermark picks up only changes; late update and removed association reflected', async () => {
  const before = await store.select('crm_deals', { where: { organization_id: orgId }, columns: 'external_id' })
  fake.state.clock = () => NOW + 3600_000
  fake.state.deals.get('d2').properties.amount = '31000'; fake.touch('d2')
  fake.state.assoc.contacts.set('d1', [])           // association removed in HubSpot
  const runId = await newRun('incremental')
  const callsBefore = fake.state.calls.length
  await sync(runId, { now: () => NOW + 3600_000 })
  assert.equal(before.length, 4)
  const d2 = (await store.select('crm_deals', { where: { organization_id: orgId, external_id: 'd2' }, columns: 'amount::text' }))[0]
  assert.equal(d2.amount, '31000.0000')
  const searchBodies = fake.state.calls.slice(callsBefore).filter(c => c[1].endsWith('/search')).length
  assert.ok(searchBodies >= 1)
  const removed = await store.select('crm_associations', { where: { organization_id: orgId, from_external_id: 'd1', to_type: 'contact' } })
  assert.equal(removed.length, 1); assert.ok(removed[0].deleted_at)      // tombstoned, not physically deleted
  const cursor = (await store.select('revenue_sync_cursors', { where: { organization_id: orgId, object_type: 'deals' } }))[0]
  assert.ok(cursor.high_watermark)
})

test('multi-page pagination: >100 deals', async () => {
  for (let i = 0; i < 230; i++) fake.addDeal('bulk' + i, { dealstage: 's_early', hs_date_entered_s_early: ago(1) })
  const runId = await newRun('full')
  await sync(runId, { now: () => NOW + 7200_000 })
  const n = (await store.select('crm_deals', { where: { organization_id: orgId }, columns: 'id' })).length
  assert.equal(n, 234)
})

test('429 mid-run: run is resumable and produces no duplicates', async () => {
  fake.state.failNext.push({ match: '/crm/v4/associations/deals/companies', error: new HubSpotRateLimited(30000) })
  const runId = await newRun('incremental')
  await assert.rejects(sync(runId), e => e instanceof HubSpotRateLimited)
  let run = (await store.select('revenue_sync_runs', { where: { id: runId } }))[0]
  assert.equal(run.status, 'running'); assert.equal(run.counters.state.step, 'associations')
  await sync(runId)                                              // resume
  run = (await store.select('revenue_sync_runs', { where: { id: runId } }))[0]
  assert.equal(run.status, 'succeeded')
  const dup = await db.query(`select external_id, count(*) c from public.crm_deals group by external_id having count(*) > 1`)
  assert.equal(dup.rows.length, 0)
})

test('time-budget yield checkpoints, then resumes from the same step', async () => {
  let t = NOW
  const runId = await newRun('incremental')
  // deadline already passed => yields immediately without losing state
  await assert.rejects(runSync({ store, client: fake.client, orgId, connectionId: connId, runId, deadline: NOW - 1, now: () => t }), e => e instanceof TimeBudgetExceeded)
  await sync(runId)
  assert.equal((await store.select('revenue_sync_runs', { where: { id: runId } }))[0].status, 'succeeded')
})

test('denied email scope => partial coverage; inactivity becomes unknown instead of a false alarm; findings not resolved by a failed/partial view', async () => {
  fake.state.forbid.add('/crm/v4/associations/deals/emails')
  const runId = await newRun('incremental')
  const r = await sync(runId)
  assert.equal(r.status, 'partial')
  const conn = (await store.select('crm_connections', { where: { id: connId } }))[0]
  assert.equal(conn.capabilities.coverage.activities, 'partial')
  await evaluateOrg({ store, orgId, asOf: new Date(NOW).toISOString(), syncRunId: null })
  const f = (await store.select('revenue_findings', { where: { organization_id: orgId, rule_key: 'inactivity' } }))
  const d1 = (await store.select('crm_deals', { where: { organization_id: orgId, external_id: 'd1' }, columns: 'id' }))[0].id
  const f1 = f.find(x => x.deal_id === d1)
  assert.equal(f1.status, 'open')   // previously triggered finding stays open: unknown never resolves it
  fake.state.forbid.clear()
})

test('archived deals are learned only from the explicit archived listing (full run)', async () => {
  fake.state.deals.get('bulk0').archived = true
  const runId = await newRun('full')
  await sync(runId, { now: () => NOW + 9000_000 })
  const d = (await store.select('crm_deals', { where: { organization_id: orgId, external_id: 'bulk0' } }))[0]
  assert.equal(d.archived, true)
  assert.equal((await store.select('crm_deals', { where: { organization_id: orgId, external_id: 'bulk1' } }))[0].archived, false)
})

test('review round 3: one deal that the database rejects is skipped and reported; the rest of the page lands', async () => {
  const badStore = { ...store, insert: async (table, rows, opts) => {
    if (table === 'crm_deals' && rows.some(r => r.external_id === 'poison')) { const { HttpError } = await import('../../api/_lib/http.js'); throw new HttpError(400, 'store_error', 'value too long', { pg_code: '22001' }) }
    return store.insert(table, rows, opts)
  } }
  fake.addDeal('poison', { dealstage: 's_early', hs_date_entered_s_early: ago(1) })
  fake.addDeal('fine1', { dealstage: 's_early', hs_date_entered_s_early: ago(1) })
  const runId = await newRun('full')
  const r = await runSync({ store: badStore, client: fake.client, orgId, connectionId: connId, runId, deadline: NOW + 20_000_000, now: () => NOW + 12_000_000 })
  assert.equal(r.status, 'partial')
  const run = (await store.select('revenue_sync_runs', { where: { id: runId } }))[0]
  assert.ok(run.warnings.includes('deals_skipped')); assert.equal(run.counters.deals_skipped, 1)
  assert.equal((await store.select('crm_deals', { where: { organization_id: orgId, external_id: 'fine1' } })).length, 1)
  assert.equal((await store.select('crm_deals', { where: { organization_id: orgId, external_id: 'poison' } })).length, 0)
})
