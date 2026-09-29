// Single place that turns "please sync" into a run row + a deduped durable job.
import { HttpError } from '../http.js'

export async function requestSync({ store, enqueue, orgId, userId = null, full = false }) {
  const [conn] = await store.select('crm_connections', { where: { organization_id: orgId, status: { neq: 'disconnected' } } })
  if (!conn) throw new HttpError(409, 'not_connected', 'Connect HubSpot first')
  if (conn.status !== 'active') throw new HttpError(409, 'reconnect_required', 'The HubSpot connection must be re-authorized')
  const active = await store.select('revenue_sync_runs', { where: { organization_id: orgId, status: { in: ['queued', 'running'] } }, order: 'created_at.asc', limit: 1 })
  if (active[0]) return { sync_run_id: active[0].id, job_id: active[0].job_id ?? undefined, deduped: true }
  const [prior] = await store.select('revenue_sync_runs', { where: { organization_id: orgId, status: { in: ['succeeded', 'partial'] } }, limit: 1, columns: 'id' })
  const kind = full === true || !prior ? 'full' : 'incremental'
  const [run] = await store.insert('revenue_sync_runs', [{ organization_id: orgId, connection_id: conn.id, kind, status: 'queued', requested_by: userId }])
  const jobId = await enqueue(store, { orgId, kind: 'sync', payload: { sync_run_id: run.id, connection_id: conn.id }, dedupe: `sync:${orgId}`, maxAttempts: 8, userId })
  await store.update('revenue_sync_runs', { id: run.id, organization_id: orgId }, { job_id: jobId })
  // concurrent requests: the oldest active run wins, ours is cancelled
  const oldest = (await store.select('revenue_sync_runs', { where: { organization_id: orgId, status: { in: ['queued', 'running'] } }, order: 'created_at.asc', limit: 1 }))[0]
  if (oldest && oldest.id !== run.id) {
    await store.update('revenue_sync_runs', { id: run.id, organization_id: orgId }, { status: 'cancelled', error: 'duplicate request' })
    return { sync_run_id: oldest.id, job_id: oldest.job_id ?? undefined, deduped: true }
  }
  return { job_id: jobId, sync_run_id: run.id, kind }
}

/** Scheduler-driven freshness: rules depend on "today", so diagnoses go stale without periodic syncs. */
export async function enqueueScheduledSyncs({ store, enqueue, olderThanHours, now = Date.now(), log = () => {} }) {
  if (!olderThanHours || olderThanHours <= 0) return 0
  const conns = await store.select('crm_connections', { where: { status: 'active' }, columns: 'organization_id,last_success_at,connected_at', limit: 500 })
  let n = 0
  for (const c of conns) {
    const last = Date.parse(c.last_success_at ?? c.connected_at ?? 0)
    if (now - last < olderThanHours * 3600_000) continue
    const [flags] = await store.select('revenue_org_flags', { where: { organization_id: c.organization_id } })
    const [settings] = await store.select('revenue_settings', { where: { organization_id: c.organization_id } })
    if (!flags?.revenue_mvp_enabled || !['confirmed', 'synced'].includes(settings?.onboarding_state ?? '')) continue // never sync before an admin confirmed the setup
    try { await requestSync({ store, enqueue, orgId: c.organization_id, full: false }); n++ } catch (e) { log('warn', 'scheduled_sync.skipped', { org_id: c.organization_id, code: e?.code }) }
  }
  return n
}
