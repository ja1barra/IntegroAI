// Durable job worker. Invoked by an authenticated scheduler (or the per-org
// "kick" endpoint), it claims leased jobs, runs them within a time budget and
// checkpoints. It never relies on background work after a response is sent.

import { randomUUID } from 'node:crypto'
import { createHubSpotClient, HubSpotRateLimited, HubSpotError, ReconnectRequired } from './hubspot/client.js'
import { createTokenProvider } from './hubspot/tokens.js'
import { runSync, TimeBudgetExceeded } from './hubspot/sync.js'
import { evaluateOrg } from './revenue/evaluate.js'
import { generateBrief } from './revenue/brief.js'
import { executeAction, reconcileExecution } from './revenue/actions.js'
import { decrypt, encrypt } from './crypto.js'
import { getFlags } from './auth.js'
import { sanitizeError, HttpError } from './http.js'

const LEASE_SECONDS = 120

export function makeClientFactory({ store, config, orgId, workerId, fetchImpl }) {
  return async connectionId => createHubSpotClient({
    apiBase: config.hubspot.apiBase, fetchImpl,
    getToken: createTokenProvider({ store, config, connectionId, orgId, workerId, fetchImpl }),
  })
}

export async function enqueue(store, { orgId, kind, payload = {}, dedupe = null, runAfter = null, maxAttempts = 5, userId = null }) {
  return store.rpc('rv_enqueue_job', { _org: orgId, _kind: kind, _payload: payload, _dedupe: dedupe, _run_after: runAfter, _max_attempts: maxAttempts, _created_by: userId })
}

async function failRun(store, orgId, runId, error, status = 'failed') {
  if (!runId) return
  await store.update('revenue_sync_runs', { id: runId, organization_id: orgId }, { status, error: sanitizeError(error), finished_at: new Date().toISOString() }).catch(() => {})
}

async function handleJob(job, { store, config, workerId, fetchImpl, ai, log, deadline, now }) {
  const orgId = job.organization_id
  const getClient = makeClientFactory({ store, config, orgId, workerId, fetchImpl })
  const flags = await getFlags(store, orgId)

  switch (job.kind) {
    case 'sync': {
      const { sync_run_id: runId, connection_id: connId } = job.payload
      const [conn] = await store.select('crm_connections', { where: { id: connId, organization_id: orgId } })
      if (!flags.revenue_mvp_enabled || !conn || conn.status === 'disconnected') { await failRun(store, orgId, runId, 'connection disconnected or feature disabled', 'cancelled'); return { outcome: 'succeeded' } }
      try {
        const client = await getClient(connId)
        await runSync({ store, client, orgId, connectionId: connId, runId, deadline, now, log })
        return { outcome: 'succeeded' }
      } catch (e) {
        if (e instanceof TimeBudgetExceeded) return { outcome: 'continue' }
        if (e instanceof HubSpotRateLimited) return { outcome: 'retry', error: e.message, retryAt: new Date(now() + Math.max(e.retryAfterMs, 5000)).toISOString() }
        if (e instanceof ReconnectRequired) { await failRun(store, orgId, runId, 'HubSpot connection must be re-authorized'); return { outcome: 'failed', error: 'reconnect_required' } }
        if (e?.fatal) { await failRun(store, orgId, runId, e.message); return { outcome: 'failed', error: e.message } }
        if ((e instanceof HubSpotError && e.retryable) || (e instanceof HttpError && e.status === 503)) return { outcome: 'retry', error: e.message, retryAt: new Date(now() + 30_000).toISOString() }
        await failRun(store, orgId, runId, e?.message ?? 'sync failed')
        return { outcome: 'failed', error: sanitizeError(e) }
      }
    }
    case 'evaluate': {
      await evaluateOrg({ store, orgId, asOf: new Date(now()).toISOString(), syncRunId: job.payload.sync_run_id ?? null, syncOk: true, log })
      return { outcome: 'succeeded' }
    }
    case 'brief': {
      try { await generateBrief({ store, ai, orgId, userId: job.created_by ?? null, period: job.payload.period, requestId: job.payload.request_id ?? null, jobId: job.id, log }) }
      catch (e) { if (e instanceof HttpError && [403, 409].includes(e.status)) return { outcome: 'failed', error: e.message }; throw e }
      return { outcome: 'succeeded' }
    }
    case 'execute_action': {
      const r = await executeAction({ store, orgId, executionId: job.payload.execution_id, getClient, now, log })
      log('info', 'action.executed', { org_id: orgId, execution_id: job.payload.execution_id, outcome: r.outcome })
      return { outcome: 'succeeded' } // business outcome is recorded on the execution row; never re-run the job
    }
    case 'reconcile': {
      const r = await reconcileExecution({ store, orgId, executionId: job.payload.execution_id, getClient, log })
      if (r.outcome === 'needs_review' && job.attempts < job.max_attempts) return { outcome: 'retry', error: 'still inconclusive', retryAt: new Date(now() + 10 * 60_000).toISOString() }
      return { outcome: 'succeeded' }
    }
    case 'rotate_credentials': {
      const cur = config.encryption.keyId
      const rows = await store.rpc('rv_list_credentials_for_rotation', { _current_version: cur, _limit: 50 })
      for (const r of rows ?? []) {
        const a = encrypt(decrypt(r.access_token_enc, config.encryption), config.encryption), rf = encrypt(decrypt(r.refresh_token_enc, config.encryption), config.encryption)
        await store.rpc('rv_rewrite_credentials', { _conn: r.connection_id, _old_version: r.key_version, _access_enc: a.value, _refresh_enc: rf.value, _new_version: a.keyVersion })
      }
      return { outcome: (rows?.length ?? 0) >= 50 ? 'continue' : 'succeeded' }
    }
    default: return { outcome: 'failed', error: `unknown job kind ${job.kind}` }
  }
}

/** Process jobs until the budget is spent. Returns a small summary for logs. */
export async function runWorkerTick({ store, config, ai, orgId = null, budgetMs = config.workerBudgetMs, fetchImpl = fetch, now = () => Date.now(), log = () => {}, workerId = `w-${randomUUID().slice(0, 8)}` }) {
  const started = now(), hardStop = started + budgetMs
  const summary = { processed: 0, succeeded: 0, retried: 0, failed: 0, continued: 0 }
  while (now() < hardStop - 2000) {
    const claimed = await store.rpc('rv_claim_job', { _worker: workerId, _lease_seconds: LEASE_SECONDS, _kinds: null, _org: orgId })
    const job = Array.isArray(claimed) ? claimed[0] : claimed
    if (!job?.id) break
    summary.processed++
    const t0 = now()
    let res
    try {
      res = await handleJob(job, { store, config, workerId, fetchImpl, ai, log, deadline: Math.min(hardStop - 1500, t0 + (LEASE_SECONDS - 25) * 1000), now })
    } catch (e) {
      res = { outcome: 'retry', error: sanitizeError(e), retryAt: new Date(now() + Math.min(60_000 * 2 ** (job.attempts - 1), 3_600_000) + Math.floor(Math.random() * 5000)).toISOString() }
    }
    const outcome = res.outcome
    const r = await store.rpc('rv_finish_job', { _id: job.id, _worker: workerId, _outcome: outcome === 'continue' ? 'continue' : outcome === 'retry' ? 'retry' : outcome === 'succeeded' ? 'succeeded' : 'failed', _error: res.error ?? null, _retry_at: res.retryAt ?? null })
    if (r === 'dead' || r === 'failed') {
      if (job.kind === 'sync') await failRun(store, job.organization_id, job.payload.sync_run_id, res.error ?? 'sync failed after retries')
    }
    summary[outcome === 'succeeded' ? 'succeeded' : outcome === 'continue' ? 'continued' : outcome === 'retry' ? 'retried' : 'failed']++
    log('info', 'job.finished', { job_id: job.id, org_id: job.organization_id, kind: job.kind, attempt: job.attempts, outcome, final: r, duration_ms: now() - t0 })
  }
  return summary
}
