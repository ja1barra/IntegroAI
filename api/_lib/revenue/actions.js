// Human-approved changes to HubSpot. The AI (or a user) can only *propose*; a
// manager/admin approves an exact (version, hash); the executor re-checks
// everything and never retries an outcome-uncertain write blindly.

import { createHash } from 'node:crypto'
import { canonicalJson } from '../rules/engine.js'
import { HttpError, badRequest, notFound, forbidden, sanitizeError } from '../http.js'
import { getFlags } from '../auth.js'
import { HubSpotError, HubSpotForbidden, HubSpotRateLimited, ReconnectRequired } from '../hubspot/client.js'

export const KINDS = ['create_task', 'update_deal_fields', 'email_draft']
// Allowlist for deal field updates. No stage / owner / amount changes, ever, in the MVP.
export const UPDATABLE_DEAL_FIELDS = { hs_next_step: { max: 500 }, closedate: { date: true } }
const PROPOSAL_TTL_MS = 7 * 86400000
const TASK_ASSOC_DEAL_TYPE_ID = 216 // HUBSPOT_DEFINED task->deal association (verify: docs/revenue/hubspot-capabilities.md)

export const payloadHash = (kind, dealId, payload) => createHash('sha256').update(canonicalJson({ kind, dealId, payload })).digest('hex')
export const marker = idempotencyKey => `[integro:${createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 16)}]`

const isIso = v => typeof v === 'string' && !Number.isNaN(Date.parse(v))

export function validatePayload(kind, payload, now = Date.now()) {
  if (!KINDS.includes(kind)) throw badRequest('Unsupported action kind')
  const p = payload && typeof payload === 'object' ? payload : {}
  if (kind === 'create_task') {
    const subject = String(p.subject ?? '').trim(), body = String(p.body ?? '').trim()
    if (!subject || subject.length > 200) throw badRequest('subject is required (max 200 chars)')
    if (body.length > 2000) throw badRequest('body too long (max 2000 chars)')
    if (!isIso(p.due_at)) throw badRequest('due_at must be an ISO date-time')
    const due = Date.parse(p.due_at)
    if (due < now - 60_000 || due > now + 366 * 86400000) throw badRequest('due_at must be in the future and within a year')
    if (p.owner_external_id !== undefined && p.owner_external_id !== null && !/^\d{1,20}$/.test(String(p.owner_external_id))) throw badRequest('owner_external_id must be a HubSpot owner id')
    return { subject, body, due_at: new Date(due).toISOString(), owner_external_id: p.owner_external_id ? String(p.owner_external_id) : null }
  }
  if (kind === 'update_deal_fields') {
    const changes = p.changes && typeof p.changes === 'object' ? p.changes : {}
    const out = {}
    for (const [k, v] of Object.entries(changes)) {
      const rule = UPDATABLE_DEAL_FIELDS[k]
      if (!rule) throw badRequest(`Field "${k}" cannot be changed by an approved action`)
      const after = v?.after === undefined || v?.after === null ? '' : String(v.after)
      if (rule.max && after.length > rule.max) throw badRequest(`${k} is too long`)
      if (rule.date && (!/^\d{4}-\d{2}-\d{2}$/.test(after) || Number.isNaN(Date.parse(after)))) throw badRequest(`${k} must be a YYYY-MM-DD date`)
      out[k] = { before: v?.before === undefined || v?.before === null ? null : String(v.before), after }
    }
    if (!Object.keys(out).length) throw badRequest('At least one field change is required')
    return { changes: out }
  }
  const subject = String(p.subject ?? '').trim(), body = String(p.body ?? '').trim()
  if (!subject || !body) throw badRequest('subject and body are required')
  return { subject: subject.slice(0, 200), body: body.slice(0, 4000) } // copyable text only; never sent
}

async function loadDeal(store, orgId, dealId) {
  const [deal] = await store.select('crm_deals', { where: { id: dealId, organization_id: orgId }, columns: 'id,external_id,name,owner_external_id,stage_external_id,source_updated_at,archived,connection_id' })
  if (!deal) throw notFound('Deal not found')
  if (deal.archived) throw badRequest('Deal is archived')
  return deal
}

export async function createProposal({ store, ctx, dealId, kind, payload, rationale = null, source = 'user', requestId, now = Date.now() }) {
  const deal = await loadDeal(store, ctx.orgId, dealId)
  const [conn] = await store.select('crm_connections', { where: { id: deal.connection_id, organization_id: ctx.orgId, status: { neq: 'disconnected' } } })
  if (!conn) throw badRequest('No active HubSpot connection')
  const clean = validatePayload(kind, payload, now)
  const base = { deal: { external_id: deal.external_id, owner_external_id: deal.owner_external_id, stage_external_id: deal.stage_external_id, source_updated_at: deal.source_updated_at } }
  const [row] = await store.insert('revenue_action_proposals', [{
    organization_id: ctx.orgId, deal_id: dealId, kind, payload: clean, payload_hash: payloadHash(kind, dealId, clean), version: 1, base_state: base,
    rationale: rationale ? String(rationale).slice(0, 1000) : null, source, portal_id: conn.portal_id, created_by: ctx.userId,
    expires_at: new Date(now + PROPOSAL_TTL_MS).toISOString(),
  }])
  await store.rpc('rv_audit', { _org: ctx.orgId, _actor_type: source === 'ai' ? 'ai' : 'user', _actor: ctx.userId, _event: 'action.proposed', _entity_type: 'action_proposal', _entity_id: row.id, _before: null, _after: { kind, version: 1, payload_hash: row.payload_hash, source }, _request_id: requestId ?? null })
  return row
}

const needVersion = v => { if (!Number.isInteger(v) || v < 1) throw badRequest('version must be a positive integer'); return v }

export async function editProposal({ store, ctx, proposalId, baseVersion, payload, requestId }) {
  needVersion(baseVersion)
  const [p] = await store.select('revenue_action_proposals', { where: { id: proposalId, organization_id: ctx.orgId } })
  if (!p) throw notFound('Proposal not found')
  // An unchanged due date is not re-validated as "future": editing only the subject of a proposal whose date has
  // since passed must still be possible (the executor re-checks expiry anyway).
  const keepDue = p.kind === 'create_task' && payload?.due_at !== undefined && payload.due_at === p.payload?.due_at
  const clean = validatePayload(p.kind, payload, keepDue ? Date.parse(p.payload.due_at) - 60_000 : Date.now())
  const r = await store.rpc('rv_edit_proposal', { _org: ctx.orgId, _proposal: proposalId, _base_version: baseVersion, _payload: clean, _hash: payloadHash(p.kind, p.deal_id, clean), _editor: ctx.userId, _request_id: requestId ?? null })
  const row = Array.isArray(r) ? r[0] : r
  if (row.result === 'forbidden') throw forbidden()
  if (row.result === 'stale_version') throw new HttpError(409, 'stale_version', 'The proposal changed; reload and try again')
  if (row.result !== 'edited') throw new HttpError(409, row.result, 'This proposal can no longer be edited')
  return row
}

export async function approveProposal({ store, ctx, proposalId, version, hash, requestId }) {
  needVersion(version)
  if (typeof hash !== 'string' || !hash) throw badRequest('payload_hash is required')
  const flags = await getFlags(store, ctx.orgId)
  const [p] = await store.select('revenue_action_proposals', { where: { id: proposalId, organization_id: ctx.orgId }, columns: 'id,kind' })
  if (!p) throw notFound('Proposal not found')
  if (p.kind !== 'email_draft' && !flags.hubspot_write_actions_enabled) throw new HttpError(403, 'feature_disabled', 'HubSpot write actions are not enabled for this organization')
  const r = await store.rpc('rv_approve_proposal', { _org: ctx.orgId, _proposal: proposalId, _version: version, _hash: hash, _approver: ctx.userId, _request_id: requestId ?? null })
  const row = Array.isArray(r) ? r[0] : r
  if (row.result === 'forbidden') throw forbidden('Only managers and admins can approve')
  if (row.result === 'not_found') throw notFound('Proposal not found')
  if (row.result === 'stale_version') throw new HttpError(409, 'stale_version', 'The proposal was edited after you opened it; review the new version')
  if (row.result === 'expired') throw new HttpError(409, 'expired', 'This proposal expired')
  if (row.result.startsWith('already_')) return { status: row.result, execution_id: row.execution_id, job_id: null, idempotent_replay: true }
  return { status: 'approved', execution_id: row.execution_id, job_id: row.job_id }
}

export async function rejectProposal({ store, ctx, proposalId, reason, requestId }) {
  const r = await store.rpc('rv_reject_proposal', { _org: ctx.orgId, _proposal: proposalId, _actor: ctx.userId, _reason: String(reason ?? '').slice(0, 500), _request_id: requestId ?? null })
  if (r === 'forbidden') throw forbidden('Only managers and admins can reject')
  if (r === 'not_found') throw notFound('Proposal not found')
  if (r !== 'rejected') throw new HttpError(409, r, 'This proposal can no longer be rejected')
  return { status: 'rejected' }
}

// ── executor ────────────────────────────────────────────────────────────────

const finish = (store, orgId, execId, status, { externalId = null, uncertain = false, error = null, proposalStatus = null } = {}) =>
  store.rpc('rv_finish_execution', { _org: orgId, _exec: execId, _status: status, _external_id: externalId, _uncertain: uncertain, _error: error ? sanitizeError(error, 400) : null, _proposal_status: proposalStatus })

// Outcome unknown => human/system reconciliation, never a blind retry. Always paired with a reconcile job.
async function markUncertain(store, orgId, executionId, error, { externalId = null, now = () => Date.now() } = {}) {
  await finish(store, orgId, executionId, 'needs_review', { uncertain: true, error, externalId })
  await store.rpc('rv_enqueue_job', { _org: orgId, _kind: 'reconcile', _payload: { execution_id: executionId }, _dedupe: `reconcile:${executionId}`, _run_after: new Date(now() + 10 * 60_000).toISOString(), _max_attempts: 6, _created_by: null }).catch(() => {})
}

/**
 * Runs one approved execution. Returns { outcome } and never throws for business
 * failures (they are recorded). `getClient(connectionId)` builds an authenticated HubSpot client.
 */
export async function executeAction({ store, orgId, executionId, getClient, now = () => Date.now(), log = () => {} }) {
  const begin = await store.rpc('rv_begin_execution', { _org: orgId, _exec: executionId })
  const b = Array.isArray(begin) ? begin[0] : begin
  if (b.result !== 'started') { log('warn', 'action.not_started', { execution_id: executionId, result: b.result }); return { outcome: b.result } }

  // From here the execution is 'running'. ANY unexpected exception must settle it, otherwise the proposal would
  // sit in 'executing' forever. Before the write nothing changed remotely => failed; after it => outcome uncertain.
  let writeStarted = false
  try {
    return await runExecution()
  } catch (e) {
    log('error', 'action.execute_error', { org_id: orgId, execution_id: executionId, write_started: writeStarted })
    const status = writeStarted ? 'needs_review' : 'failed'
    const msg = `unexpected error: ${sanitizeError(e, 120)}`
    if (writeStarted) await markUncertain(store, orgId, executionId, msg, { now }).catch(() => {})
    else await finish(store, orgId, executionId, 'failed', { error: msg }).catch(() => {})
    return { outcome: status }
  }

  async function runExecution() {
  const [proposal] = await store.select('revenue_action_proposals', { where: { id: b.proposal_id, organization_id: orgId } })
  const [exec] = await store.select('revenue_action_executions', { where: { id: executionId, organization_id: orgId } })
  const fail = async (status, error, extra = {}) => { await finish(store, orgId, executionId, status, { error, ...extra }); return { outcome: status } }

  // 1. still authorized?
  const [approver] = await store.select('organization_members', { where: { organization_id: orgId, user_id: proposal.approved_by ?? '00000000-0000-0000-0000-000000000000', status: 'active' } })
  if (!approver || !['admin', 'manager'].includes(approver.role)) return fail('failed', 'approver is no longer authorized')
  const flags = await getFlags(store, orgId)
  if (proposal.kind !== 'email_draft' && !flags.hubspot_write_actions_enabled) return fail('failed', 'write actions are disabled for this organization')
  // 2. exactly what was approved?
  if (proposal.approved_version !== proposal.version || proposal.approved_hash !== proposal.payload_hash || payloadHash(proposal.kind, proposal.deal_id, proposal.payload) !== proposal.approved_hash) return fail('failed', 'payload differs from the approved version')
  if (new Date(proposal.expires_at).getTime() <= now()) return fail('failed', 'approval expired before execution', { proposalStatus: 'expired' })
  if (proposal.kind === 'email_draft') return (await finish(store, orgId, executionId, 'succeeded', { externalId: null }), { outcome: 'succeeded' })

  // 3. connection still live, right portal, capability present
  const [deal] = await store.select('crm_deals', { where: { id: proposal.deal_id, organization_id: orgId }, columns: 'id,external_id,connection_id' })
  const [conn] = await store.select('crm_connections', { where: { id: deal.connection_id, organization_id: orgId } })
  if (!conn || conn.status !== 'active') return fail('failed', 'HubSpot connection is not active')
  if (conn.portal_id !== proposal.portal_id) return fail('failed', 'HubSpot portal changed since approval')
  const needCap = proposal.kind === 'create_task' ? 'write_tasks' : 'write_deals'
  if (!conn.capabilities?.[needCap]) return fail('failed', `Missing HubSpot permission (${needCap}); reconnect HubSpot and grant write access`)

  const client = await getClient(conn.id)
  try {
    // 4. remote precondition
    const remote = await client.get(`/crm/v3/objects/deals/${deal.external_id}`, { properties: 'dealstage,hubspot_owner_id,hs_lastmodifieddate,closedate,hs_next_step,hs_is_closed' })
    const rp = remote?.properties ?? {}
    if (remote?.archived) return fail('conflict', 'deal was archived in HubSpot', { proposalStatus: 'conflict' })
    if (String(rp.hs_is_closed) === 'true') return fail('conflict', 'deal was closed in HubSpot', { proposalStatus: 'conflict' })
    if (proposal.kind === 'update_deal_fields') {
      for (const [field, ch] of Object.entries(proposal.payload.changes)) {
        const cur = rp[field] ?? null, exp = ch.before ?? null
        const norm = v => (v === null || v === '' ? null : String(field === 'closedate' && v ? String(v).slice(0, 10) : v))
        if (norm(cur) !== norm(exp)) return fail('conflict', `${field} changed in HubSpot since the proposal was created`, { proposalStatus: 'conflict' })
      }
    }
    // NOTE: HubSpot offers no compare-and-set, so a residual window remains between this read
    // and the write below; it is minimized (single round-trip) and the result is verified after.

    // 5. write
    const key = exec.idempotency_key
    writeStarted = true
    if (proposal.kind === 'create_task') {
      const p = proposal.payload
      const created = await client.post('/crm/v3/objects/tasks', {
        properties: {
          hs_timestamp: p.due_at, hs_task_subject: p.subject, hs_task_status: 'NOT_STARTED',
          hs_task_body: [p.body, marker(key)].filter(Boolean).join('\n\n'),
          ...((p.owner_external_id ?? rp.hubspot_owner_id) ? { hubspot_owner_id: p.owner_external_id ?? rp.hubspot_owner_id } : {}),
        },
        associations: [{ to: { id: deal.external_id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: TASK_ASSOC_DEAL_TYPE_ID }] }],
      })
      const id = created?.id ? String(created.id) : null
      if (!id) { await markUncertain(store, orgId, executionId, 'HubSpot did not return a task id', { now }); return { outcome: 'needs_review' } }
      // 6. verify the result exists
      try { await client.get(`/crm/v3/objects/tasks/${id}`, { properties: 'hs_task_subject' }) }
      catch { await markUncertain(store, orgId, executionId, 'task created but could not be verified', { externalId: id, now }); return { outcome: 'needs_review' } }
      await finish(store, orgId, executionId, 'succeeded', { externalId: id })
      return { outcome: 'succeeded', external_id: id }
    }
    const props = Object.fromEntries(Object.entries(proposal.payload.changes).map(([k, v]) => [k, v.after]))
    await client.request('PATCH', `/crm/v3/objects/deals/${deal.external_id}`, { body: { properties: props } })
    await finish(store, orgId, executionId, 'succeeded', { externalId: deal.external_id })
    return { outcome: 'succeeded', external_id: deal.external_id }
  } catch (e) {
    if (e instanceof ReconnectRequired) return fail('failed', 'HubSpot connection requires re-authorization')
    if (e instanceof HubSpotForbidden) return fail('failed', 'HubSpot denied the write (missing scope or plan); reconnect and grant write access')
    if (e instanceof HubSpotRateLimited) return fail('failed', 'HubSpot rate limit hit before the write; nothing was written, re-approve to retry')
    if (e instanceof HubSpotError && e.status >= 400 && e.status < 500) return fail('failed', `HubSpot rejected the request (${e.status})`)
    // Nothing was sent yet (the failure hit the precondition read): the action simply did not run.
    if (!writeStarted) return fail('failed', 'HubSpot could not be reached before writing; nothing was written. Create a new proposal to try again.')
    // network error / timeout / 5xx after a possible write: outcome unknown => reconcile, never blind retry
    await markUncertain(store, orgId, executionId, `outcome unknown after ${e?.name ?? 'error'}: ${sanitizeError(e, 120)}`, { now })
    return { outcome: 'needs_review' }
  }
  }
}

/**
 * Looks for evidence of an uncertain write: tasks by the embedded idempotency
 * marker, deal fields by comparing with the approved `after` values. Search
 * indexing lags, so absence is NOT proof of failure: it stays needs_review.
 */
export async function reconcileExecution({ store, orgId, executionId, getClient, log = () => {} }) {
  const [exec] = await store.select('revenue_action_executions', { where: { id: executionId, organization_id: orgId } })
  if (!exec || exec.status !== 'needs_review') return { outcome: 'noop' }
  const [proposal] = await store.select('revenue_action_proposals', { where: { id: exec.proposal_id, organization_id: orgId } })
  const [deal] = await store.select('crm_deals', { where: { id: proposal.deal_id, organization_id: orgId }, columns: 'external_id,connection_id' })
  const client = await getClient(deal.connection_id)
  if (proposal.kind === 'create_task') {
    const res = await client.post('/crm/v3/objects/tasks/search', { filterGroups: [{ filters: [{ propertyName: 'hs_task_body', operator: 'CONTAINS_TOKEN', value: marker(exec.idempotency_key) }] }], properties: ['hs_task_subject'], limit: 2 })
    const found = res?.results ?? []
    if (found.length === 1) { await store.update('revenue_action_executions', { id: executionId, organization_id: orgId }, { status: 'succeeded', external_result_id: String(found[0].id), uncertain: false, error: null, finished_at: new Date().toISOString() }); await store.update('revenue_action_proposals', { id: proposal.id, organization_id: orgId }, { status: 'succeeded' }); await store.rpc('rv_audit', { _org: orgId, _actor_type: 'system', _actor: null, _event: 'action.reconciled', _entity_type: 'action_proposal', _entity_id: proposal.id, _before: null, _after: { external_result_id: String(found[0].id) }, _request_id: null }); return { outcome: 'succeeded', external_id: String(found[0].id) } }
    log('warn', 'action.reconcile_inconclusive', { execution_id: executionId, matches: found.length })
    return { outcome: 'needs_review', matches: found.length }
  }
  if (proposal.kind === 'update_deal_fields') {
    const remote = await client.get(`/crm/v3/objects/deals/${deal.external_id}`, { properties: Object.keys(proposal.payload.changes).join(',') })
    const norm = (f, v) => (v === null || v === undefined || v === '' ? null : f === 'closedate' ? String(v).slice(0, 10) : String(v))
    if (Object.entries(proposal.payload.changes).every(([f, c]) => norm(f, remote?.properties?.[f]) === norm(f, c.after))) {
      await store.update('revenue_action_executions', { id: executionId, organization_id: orgId }, { status: 'succeeded', external_result_id: deal.external_id, uncertain: false, error: null, finished_at: new Date().toISOString() })
      await store.update('revenue_action_proposals', { id: proposal.id, organization_id: orgId }, { status: 'succeeded' })
      return { outcome: 'succeeded' }
    }
  }
  return { outcome: 'needs_review' }
}
