// Evaluate every open deal of an org with the deterministic engine, persist
// evaluations / findings / snapshot. No LLM involved; OpenAI outage cannot affect this.

import { createHash } from 'node:crypto'
import { evaluateDeal, canonicalJson } from '../rules/engine.js'
import { aggregate } from '../rules/aggregate.js'
import { mergeRuleset, ENGINE_VERSION } from '../rules/defaults.js'
import { reconcile } from '../rules/findings.js'
import { computeStageStats } from '../rules/stagestats.js'
import { insertChunked, selectAll } from '../store.js'

export const filtersHash = filters => createHash('sha256').update(canonicalJson(filters ?? {})).digest('hex')

const pageAll = selectAll

export async function getActiveRuleset(store, orgId, { createIfMissing = true } = {}) {
  const rows = await store.select('revenue_rule_sets', { where: { organization_id: orgId }, order: 'version.desc', limit: 1 })
  if (rows[0]) return { version: rows[0].version, ruleset: mergeRuleset(rows[0].config), row: rows[0] }
  if (!createIfMissing) return { version: 0, ruleset: mergeRuleset({}), row: null }
  const [created] = await store.insert('revenue_rule_sets', [{ organization_id: orgId, version: 1, engine_version: ENGINE_VERSION, config: mergeRuleset({}) }], { onConflict: 'organization_id,version', ignoreDuplicates: true })
  const row = created ?? (await store.select('revenue_rule_sets', { where: { organization_id: orgId, version: 1 } }))[0]
  return { version: 1, ruleset: mergeRuleset(row.config), row }
}

export async function evaluateOrg({ store, orgId, asOf = new Date().toISOString(), syncRunId = null, syncOk = true, log = () => {} }) {
  const [org] = await store.select('organizations', { where: { id: orgId } })
  const [settings] = await store.select('revenue_settings', { where: { organization_id: orgId } })
  const [conn] = await store.select('crm_connections', { where: { organization_id: orgId, status: { neq: 'disconnected' } } })
  if (!conn) return { skipped: 'no_connection' }
  const tz = settings?.timezone || org?.timezone || 'UTC'
  const { version: rulesVersion, ruleset } = await getActiveRuleset(store, orgId)
  const cov = conn.capabilities?.coverage ?? {}
  const scope = { organization_id: orgId, connection_id: conn.id }

  const [pipelines, stages, owners] = await Promise.all([
    selectAll(store, 'crm_pipelines', { where: scope, columns: 'id,external_id', order: 'id.asc' }),
    selectAll(store, 'crm_stages', { where: scope, columns: 'id,external_id,pipeline_id,category,is_closed', order: 'id.asc' }),
    selectAll(store, 'crm_owners', { where: scope, columns: 'id,archived', order: 'id.asc' }),
  ])
  const selected = new Set(settings?.selected_pipeline_ids ?? [])
  const pipeById = new Map(pipelines.map(p => [p.id, p]))
  const stageById = new Map(stages.map(s => [s.id, s]))
  const ownerById = new Map(owners.map(o => [o.id, o]))

  const allDeals = await pageAll(store, 'crm_deals', { where: { ...scope, archived: false }, columns: 'id,external_id,name,pipeline_id,stage_id,owner_id,owner_state,field_states,amount::text,currency,close_at,stage_entered_at,created_at_source', order: 'external_id.asc' })
  const deals = allDeals.filter(d => !selected.size || (d.pipeline_id && selected.has(pipeById.get(d.pipeline_id)?.external_id)))

  // associations & activities (in-memory joins; sized for MVP-scale portals, see docs/revenue/operations.md)
  const assoc = await pageAll(store, 'crm_associations', { where: { ...scope, deleted_at: { isnull: true } }, columns: 'from_type,from_external_id,to_type,to_external_id', order: 'from_external_id.asc' })
  const contactsByDeal = new Map(), actIdsByDeal = new Map()
  for (const a of assoc) {
    if (a.from_type === 'deal' && a.to_type === 'contact') contactsByDeal.set(a.from_external_id, (contactsByDeal.get(a.from_external_id) ?? new Set()).add(a.to_external_id))
    else if (a.to_type === 'deal' && ['call', 'email', 'meeting', 'task'].includes(a.from_type)) {
      const k = a.to_external_id
      if (!actIdsByDeal.has(k)) actIdsByDeal.set(k, [])
      actIdsByDeal.get(k).push(`${a.from_type}:${a.from_external_id}`)
    }
  }
  const acts = await pageAll(store, 'crm_activities', { where: { ...scope, archived: false }, columns: 'id,external_id,type,occurred_at,due_at,status,is_system', order: 'external_id.asc' })
  const actByKey = new Map(acts.map(a => [`${a.type}:${a.external_id}`, a]))

  // stage-duration statistics from real stage history only
  const hist = await pageAll(store, 'crm_property_history', { where: { organization_id: orgId, connection_id: conn.id, property: 'dealstage' }, columns: 'deal_id,value,effective_at', order: 'effective_at.asc' })
  const dealPipe = new Map(allDeals.map(d => [d.id, d.pipeline_id]))
  const stats = computeStageStats(hist.map(h => ({ deal_id: h.deal_id, stage_external_id: `${dealPipe.get(h.deal_id)}|${h.value}`, effective_at: h.effective_at })), { asOf, windowDays: ruleset.thresholds.stalled_window_days })

  const contactsKnown = cov.associations_contacts === 'complete'
  const evals = []
  let unknownState = 0
  for (const d of deals) {
    const st = d.stage_id ? stageById.get(d.stage_id) : null
    const isOpen = st ? (st.is_closed === true ? false : st.is_closed === false ? true : null) : null
    if (isOpen === null) unknownState++
    const activities = (actIdsByDeal.get(d.external_id) ?? []).map(k => actByKey.get(k)).filter(Boolean).map(a => ({ id: a.id, type: a.type, occurred_at: a.occurred_at, due_at: a.due_at, status: a.status, is_system: a.is_system }))
    const input = {
      as_of: asOf, timezone: tz,
      deal: {
        id: d.id, external_id: d.external_id, amount: d.amount ?? null, currency: d.currency ?? null, is_open: isOpen, archived: false,
        stage: st ? { id: st.id, external_id: st.external_id, category: st.category, is_closed: st.is_closed } : null,
        owner_state: d.owner_state, owner_archived: d.owner_id ? ownerById.get(d.owner_id)?.archived === true : false,
        field_states: d.field_states ?? {}, close_at: d.close_at, created_at: d.created_at_source, stage_entered_at: d.stage_entered_at,
        contact_count: contactsKnown ? (contactsByDeal.get(d.external_id)?.size ?? 0) : null,
      },
      activities, coverage: { activities: cov.activities ?? 'none', history_since_creation: cov.history_since_creation === true },
      stage_stats: st ? stats.get(`${d.pipeline_id}|${st.external_id}`) ?? null : null,
    }
    evals.push({ deal: d, evaluation: evaluateDeal(input, ruleset), amount: d.amount ?? null, currency: d.currency ?? null, isOpen: isOpen === true })
  }

  // persist evaluations (immutable facts, deduped by inputs+rules version)
  const evalRows = evals.filter(e => e.evaluation.band !== 'not_applicable').map(e => ({
    organization_id: orgId, deal_id: e.deal.id, rules_version: rulesVersion, as_of: e.evaluation.as_of, input_hash: e.evaluation.input_hash,
    health: e.evaluation.health, coverage: e.evaluation.coverage, eligible: e.evaluation.eligible, provisional: e.evaluation.provisional, band: e.evaluation.band, results: e.evaluation.results,
  }))
  await insertChunked(store, 'revenue_evaluations', evalRows, { onConflict: 'organization_id,deal_id,input_hash,rules_version', ignoreDuplicates: true })
  const evalId = new Map()
  const dealIds = evalRows.map(r => r.deal_id)
  for (let i = 0; i < dealIds.length; i += 150) {
    for (const r of await store.select('revenue_evaluations', { where: { organization_id: orgId, rules_version: rulesVersion, deal_id: { in: dealIds.slice(i, i + 150) } }, columns: 'id,deal_id,input_hash' })) evalId.set(`${r.deal_id}|${r.input_hash}`, r.id)
  }

  // findings: reconcile against what we already have
  const oldFindings = await pageAll(store, 'revenue_findings', { where: { organization_id: orgId }, columns: 'id,deal_id,rule_key,status,first_seen_at', order: 'id.asc' })
  const byDeal = new Map()
  for (const f of oldFindings) (byDeal.get(f.deal_id) ?? byDeal.set(f.deal_id, []).get(f.deal_id)).push(f)
  const upserts = [], resolves = []
  for (const e of evals) {
    if (!e.isOpen) continue
    const { upserts: u, resolves: r } = reconcile({ existing: byDeal.get(e.deal.id) ?? [], evaluation: e.evaluation, rulesVersion, syncOk, now: asOf })
    for (const f of u) upserts.push({ organization_id: orgId, dedupe_key: `${orgId}:${e.deal.id}:${f.rule_key}`, ...f })
    for (const rk of r) resolves.push({ deal_id: e.deal.id, rule_key: rk })
  }
  await insertChunked(store, 'revenue_findings', upserts, { onConflict: 'organization_id,deal_id,rule_key' })
  for (const r of resolves) await store.update('revenue_findings', { organization_id: orgId, deal_id: r.deal_id, rule_key: r.rule_key, status: 'open' }, { status: 'resolved', resolved_at: asOf })

  // snapshot (unfiltered baseline; filtered views are computed live from the same items)
  const agg = aggregate(evals.map(e => ({ id: e.deal.id, amount: e.amount, currency: e.currency, is_open: e.isOpen, evaluation: e.evaluation })))
  const openFindings = await pageAll(store, 'revenue_findings', { where: { organization_id: orgId, status: 'open' }, columns: 'category,severity,deal_id', order: 'id.asc' })
  const openDealIds = new Set(evals.filter(e => e.isOpen).map(e => e.deal.id))
  const relevant = openFindings.filter(f => openDealIds.has(f.deal_id))
  const metrics = {
    by_currency: agg.by_currency, exclusions: { ...agg.exclusions, unknown_open_state: unknownState },
    findings_open: relevant.length, deals_with_findings: new Set(relevant.map(f => f.deal_id)).size,
    findings_by_category: relevant.reduce((m, f) => ((m[f.category] = (m[f.category] ?? 0) + 1), m), {}),
    findings_by_severity: relevant.reduce((m, f) => ((m[f.severity] = (m[f.severity] ?? 0) + 1), m), {}),
    coverage_summary: cov, timezone: tz, engine_version: ENGINE_VERSION,
  }
  const filters = {}
  const [snap] = await store.insert('revenue_score_snapshots', [{
    organization_id: orgId, sync_run_id: syncRunId, filters, filters_hash: filtersHash(filters), as_of: asOf, rules_version: rulesVersion,
    score: agg.score, eligible_count: agg.eligible_count, total_open_count: agg.total_open_count, avg_coverage: agg.avg_coverage,
    status: cov.activities === 'complete' ? 'complete' : 'partial', metrics,
  }], { onConflict: 'organization_id,filters_hash,sync_run_id,rules_version,as_of', ignoreDuplicates: true })
  let snapshotId = snap?.id
  if (!snapshotId) snapshotId = (await store.select('revenue_score_snapshots', { where: { organization_id: orgId, filters_hash: filtersHash(filters), rules_version: rulesVersion, as_of: asOf }, limit: 1 }))[0]?.id
  const items = evalRows.map(r => ({ organization_id: orgId, snapshot_id: snapshotId, deal_id: r.deal_id, evaluation_id: evalId.get(`${r.deal_id}|${r.input_hash}`) })).filter(i => i.evaluation_id)
  await insertChunked(store, 'revenue_snapshot_items', items, { onConflict: 'snapshot_id,deal_id' })
  log('info', 'revenue.evaluated', { org_id: orgId, snapshot_id: snapshotId, deals: deals.length, eligible: agg.eligible_count })
  return { snapshotId, score: agg.score, eligible: agg.eligible_count, open: agg.total_open_count, findings: relevant.length }
}
