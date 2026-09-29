// Single place that turns "please sync" into a run row + a deduped durable job.
import { HttpError } from '../http.js'
import { selectAll } from '../store.js'

export async function requestSync({ store, enqueue, orgId, userId = null, full = false }) {
  const [conn] = await store.select('crm_connections', { where: { organization_id: orgId, status: { neq: 'disconnected' } } })
  if (!conn) throw new HttpError(409, 'not_connected', 'Connect HubSpot first')
  if (conn.status !== 'active') throw new HttpError(409, 'reconnect_required', 'The HubSpot connection must be re-authorized')
  // An "active" run only counts while its job is still alive; otherwise (job dead/failed/gone after a crash,
  // an exhausted lease or a disconnect) the run is closed here so it can never block future syncs.
  const actives = await store.select('revenue_sync_runs', { where: { organization_id: orgId, connection_id: conn.id, status: { in: ['queued', 'running'] } }, order: 'created_at.asc', limit: 20 })
  for (const run of actives) {
    const job = run.job_id ? await store.rpc('rv_get_job', { _org: orgId, _id: run.job_id }).then(r => (Array.isArray(r) ? r[0] : r)).catch(() => undefined) : undefined
    if (job === undefined && run.job_id) return { sync_run_id: run.id, job_id: run.job_id, deduped: true } // could not verify: be conservative
    if (job && ['queued', 'running'].includes(job.status)) return { sync_run_id: run.id, job_id: run.job_id, deduped: true }
    if (!run.job_id && Date.now() - Date.parse(run.created_at) < 60_000) return { sync_run_id: run.id, deduped: true } // job id still being attached
    await store.update('revenue_sync_runs', { id: run.id, organization_id: orgId }, { status: 'failed', error: `job ended (${job?.status ?? 'missing'}) before the run finished`, finished_at: new Date().toISOString() })
  }
  const [prior] = await store.select('revenue_sync_runs', { where: { organization_id: orgId, status: { in: ['succeeded', 'partial'] } }, limit: 1, columns: 'id' })
  const kind = full === true || !prior ? 'full' : 'incremental'
  const [run] = await store.insert('revenue_sync_runs', [{ organization_id: orgId, connection_id: conn.id, kind, status: 'queued', requested_by: userId }])
  const jobId = await enqueue(store, { orgId, kind: 'sync', payload: { sync_run_id: run.id, connection_id: conn.id }, dedupe: `sync:${orgId}`, maxAttempts: 8, userId })
  await store.update('revenue_sync_runs', { id: run.id, organization_id: orgId }, { job_id: jobId })
  // concurrent requests: the oldest active run wins, ours is cancelled
  const oldest = (await store.select('revenue_sync_runs', { where: { organization_id: orgId, connection_id: conn.id, status: { in: ['queued', 'running'] } }, order: 'created_at.asc', limit: 1 }))[0]
  if (oldest && oldest.id !== run.id) {
    await store.update('revenue_sync_runs', { id: run.id, organization_id: orgId }, { status: 'cancelled', error: 'duplicate request' })
    return { sync_run_id: oldest.id, job_id: oldest.job_id ?? undefined, deduped: true }
  }
  return { job_id: jobId, sync_run_id: run.id, kind }
}

/** Scheduler-driven freshness: rules depend on "today", so diagnoses go stale without periodic syncs. */
export async function enqueueScheduledSyncs({ store, enqueue, olderThanHours, fullEveryDays = 7, now = Date.now(), log = () => {} }) {
  if (!olderThanHours || olderThanHours <= 0) return 0
  const conns = await selectAll(store, 'crm_connections', { where: { status: 'active' }, columns: 'organization_id,last_success_at,connected_at', order: 'organization_id.asc' })
  let n = 0
  for (const c of conns) {
    const last = Date.parse(c.last_success_at ?? c.connected_at ?? 0)
    if (now - last < olderThanHours * 3600_000) continue
    // back off orgs whose latest run failed recently instead of hammering HubSpot every tick
    const [latest] = await store.select('revenue_sync_runs', { where: { organization_id: c.organization_id }, order: 'created_at.desc', limit: 1, columns: 'status,finished_at,created_at' })
    if (latest?.status === 'failed' && now - Date.parse(latest.finished_at ?? latest.created_at) < Math.max(olderThanHours, 2) * 3600_000 / 2) continue
    const [flags] = await store.select('revenue_org_flags', { where: { organization_id: c.organization_id } })
    const [settings] = await store.select('revenue_settings', { where: { organization_id: c.organization_id } })
    if (!flags?.revenue_mvp_enabled || !['confirmed', 'synced'].includes(settings?.onboarding_state ?? '')) continue // never sync before an admin confirmed the setup
    // A full run is the only one that learns about deals archived/deleted in HubSpot (incremental Search never returns them),
    // so one is scheduled periodically.
    const [lastFull] = await store.select('revenue_sync_runs', { where: { organization_id: c.organization_id, kind: 'full', status: { in: ['succeeded', 'partial'] } }, order: 'finished_at.desc', limit: 1, columns: 'finished_at' })
    const needFull = !lastFull || now - Date.parse(lastFull.finished_at ?? 0) > fullEveryDays * 86400_000
    try { await requestSync({ store, enqueue, orgId: c.organization_id, full: needFull }); n++ } catch (e) { log('warn', 'scheduled_sync.skipped', { org_id: c.organization_id, code: e?.code }) }
  }
  return n
}
