import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { newDb, applyBaseline, applyMigrations } from './helpers.js'
import { createPgStore } from './pgstore.js'
import { seedOrg } from '../helpers/seedOrg.js'
import { enqueueScheduledSyncs } from '../../api/_lib/revenue/syncRequest.js'
import { enqueue } from '../../api/_lib/jobs.js'

let db, store, A, B, C
before(async () => {
  db = await newDb(); await applyBaseline(db); await applyMigrations(db)
  store = createPgStore(db)
  A = await seedOrg(db, store, { name: 'A', portal: '1', email: 'a@a.com' })
  B = await seedOrg(db, store, { name: 'B', portal: '2', email: 'b@b.com' })
  C = await seedOrg(db, store, { name: 'C', portal: '3', email: 'c@c.com' })
  const old = new Date(Date.now() - 48 * 3600_000).toISOString()
  await db.query(`update public.crm_connections set last_success_at = $1`, [old])
  await store.update('revenue_settings', { organization_id: A.orgId }, { onboarding_state: 'confirmed' })
  await store.update('revenue_settings', { organization_id: B.orgId }, { onboarding_state: 'stages_mapped' })      // admin has not confirmed
  await store.update('revenue_settings', { organization_id: C.orgId }, { onboarding_state: 'synced' })
  await store.update('revenue_org_flags', { organization_id: C.orgId }, { revenue_mvp_enabled: false })           // not enabled
  await db.query(`update public.revenue_sync_runs set status = 'succeeded'`)                                       // seed runs finished
})

test('scheduler enqueues an incremental sync only for stale, enabled, admin-confirmed orgs; a second tick dedupes', async () => {
  assert.equal(await enqueueScheduledSyncs({ store, enqueue, olderThanHours: 6 }), 1)
  assert.equal(await enqueueScheduledSyncs({ store, enqueue, olderThanHours: 6 }), 1)                             // still returns 1 (deduped run, not a second job)
  const runs = await store.select('revenue_sync_runs', { where: { organization_id: A.orgId, status: 'queued' } })
  assert.equal(runs.length, 1); assert.equal(runs[0].kind, 'incremental')
  assert.equal((await store.select('revenue_sync_runs', { where: { organization_id: B.orgId, status: 'queued' } })).length, 0)
  assert.equal((await store.select('revenue_sync_runs', { where: { organization_id: C.orgId, status: 'queued' } })).length, 0)
  assert.equal(await enqueueScheduledSyncs({ store, enqueue, olderThanHours: 0 }), 0)                              // disabled
  assert.equal((await db.query(`select count(*)::int c from private.revenue_jobs where kind='sync' and organization_id=$1 and status='queued'`, [A.orgId])).rows[0].c, 1)
})
