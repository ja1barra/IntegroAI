// Read models for the UI. Every query is scoped by an organization_id that came
// from the authenticated context. Money is summed exactly and per currency, a
// deal is counted once, and Overview/Findings/Deals share one snapshot + filters.

import { aggregate } from '../rules/aggregate.js'
import { parseDecimal, formatDecimal } from '../rules/decimal.js'

// descending by amount, unknown amounts last; returns 0 on ties so following tie-breakers actually run
export const cmpAmountDesc = (a, b) => { const x = parseDecimal(a) ?? -1n, y = parseDecimal(b) ?? -1n; return x > y ? -1 : x < y ? 1 : 0 }
import { filtersHash } from './evaluate.js'
import { isSuppressed } from '../rules/findings.js'
import { hubspotRecordUrl } from '../hubspot/links.js'
import { badRequest, notFound } from '../http.js'
import { selectAll, IN_CHUNK } from '../store.js'

const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }
const SEVERITY_RANK = { high: 0, medium: 1, low: 2, info: 3 }

export function parseFilters(q = {}) {
  const f = {}
  for (const k of ['pipeline', 'stage', 'owner']) if (q[k]) f[k] = String(q[k]).slice(0, 64)
  for (const k of ['from', 'to']) { if (q[k]) { if (Number.isNaN(Date.parse(q[k]))) throw badRequest(`${k} must be a date`); f[k] = String(q[k]) } }
  if (q.status) { if (!['open', 'resolved', 'dismissed', 'snoozed', 'all'].includes(q.status)) throw badRequest('invalid status'); f.status = q.status }
  if (q.category) f.category = String(q.category).slice(0, 32)
  if (q.severity) f.severity = String(q.severity).slice(0, 16)
  return f
}

export async function getLatestSnapshot(store, orgId) {
  return (await store.select('revenue_score_snapshots', { where: { organization_id: orgId, filters_hash: filtersHash({}) }, order: 'created_at.desc', limit: 1 }))[0] ?? null
}

async function connectionInfo(store, orgId) {
  const [conn] = await store.select('crm_connections', { where: { organization_id: orgId, status: { neq: 'disconnected' } } })
  return conn ?? null
}

// Deals + their evaluation in a snapshot, with the reference data needed for filters/labels.
export async function loadSnapshotDeals(store, orgId, snapshotId) {
  const items = []
  for (let off = 0; ; off += 1000) {
    const page = await store.select('revenue_snapshot_items', { where: { snapshot_id: snapshotId, organization_id: orgId }, columns: 'deal_id,evaluation_id', order: 'deal_id.asc', limit: 1000, offset: off })
    items.push(...page); if (page.length < 1000) break
  }
  const evals = new Map(), deals = new Map()
  for (const c of chunk(items.map(i => i.evaluation_id), IN_CHUNK)) for (const e of await store.select('revenue_evaluations', { where: { organization_id: orgId, id: { in: c } } })) evals.set(e.id, e)
  for (const c of chunk(items.map(i => i.deal_id), IN_CHUNK)) for (const d of await store.select('crm_deals', { where: { organization_id: orgId, id: { in: c } }, columns: 'id,external_id,name,amount::text,currency,close_at,stage_id,stage_external_id,pipeline_id,owner_id,owner_external_id,company_id,stage_entered_at,archived,field_states' })) deals.set(d.id, d)
  // reference data of the live connection only (a disconnected portal's mirror is kept for history, not displayed)
  const [live] = await store.select('crm_connections', { where: { organization_id: orgId, status: { neq: 'disconnected' } }, columns: 'id' })
  const refScope = live ? { organization_id: orgId, connection_id: live.id } : { organization_id: orgId }
  const [stages, pipelines, owners] = await Promise.all([
    selectAll(store, 'crm_stages', { where: refScope, columns: 'id,external_id,label,category,is_closed,display_order', order: 'id.asc' }),
    selectAll(store, 'crm_pipelines', { where: refScope, columns: 'id,external_id,label', order: 'id.asc' }),
    selectAll(store, 'crm_owners', { where: refScope, columns: 'id,external_id,name,archived', order: 'id.asc' }),
  ])
  // companies only for the deals in this snapshot (never an unbounded table read)
  const companies = []
  for (const c of chunk([...new Set([...deals.values()].map(d => d.company_id).filter(Boolean))], IN_CHUNK)) companies.push(...await store.select('crm_companies', { where: { organization_id: orgId, id: { in: c } }, columns: 'id,name' }))
  return { rows: items.map(i => ({ deal: deals.get(i.deal_id), evaluation: evals.get(i.evaluation_id) })).filter(r => r.deal && r.evaluation && !r.deal.archived), stages, pipelines, owners, companies }
}

const passes = (deal, f, ref) => {
  if (f.pipeline && ref.pipelines.find(p => p.id === deal.pipeline_id)?.external_id !== f.pipeline) return false
  if (f.stage && deal.stage_external_id !== f.stage) return false
  if (f.owner && (f.owner === 'none' ? deal.owner_external_id : deal.owner_external_id !== f.owner)) return false
  return true
}

const aggInput = rows => rows.map(r => ({ id: r.deal.id, amount: r.deal.amount, currency: r.deal.currency, is_open: r.evaluation.band !== 'not_applicable', evaluation: r.evaluation }))

export async function loadFindings(store, orgId, { statusFilter = 'open' } = {}) {
  const where = { organization_id: orgId }
  if (statusFilter === 'open' || statusFilter === 'resolved') where.status = statusFilter
  const rows = await selectAll(store, 'revenue_findings', { where, order: 'id.asc' })
  const prefs = new Map((await selectAll(store, 'revenue_finding_preferences', { where: { organization_id: orgId }, order: 'id.asc' })).map(p => [p.finding_id, p]))
  return { rows, prefs }
}

export async function overview({ store, orgId, filters = {}, now = new Date().toISOString() }) {
  const conn = await connectionInfo(store, orgId)
  const [settings] = await store.select('revenue_settings', { where: { organization_id: orgId } })
  const [lastRun] = await store.select('revenue_sync_runs', { where: { organization_id: orgId }, order: 'created_at.desc', limit: 1, columns: 'id,status,kind,started_at,finished_at,warnings,error,counters' })
  const snap = await getLatestSnapshot(store, orgId)
  const base = { connection: conn ? { status: conn.status, portal_id: conn.portal_id } : null, onboarding_state: settings?.onboarding_state ?? 'not_started', last_sync: lastRun ? { id: lastRun.id, status: lastRun.status, finished_at: lastRun.finished_at, warnings: lastRun.warnings, error: lastRun.error } : null }
  if (!snap) return { ...base, snapshot: null, filters, kpis: null }

  const ref = await loadSnapshotDeals(store, orgId, snap.id)
  const rows = ref.rows.filter(r => passes(r.deal, filters, ref))
  const agg = aggregate(aggInput(rows))
  const { rows: findings, prefs } = await loadFindings(store, orgId, { statusFilter: 'open' })
  const dealSet = new Set(rows.filter(r => r.evaluation.band !== 'not_applicable').map(r => r.deal.id))
  const dealById = new Map(rows.map(r => [r.deal.id, r.deal]))
  const visible = findings.filter(f => dealSet.has(f.deal_id) && !isSuppressed(prefs.get(f.id), now))
  const priorities = visible.filter(f => f.category !== 'data_quality')
    .sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || cmpAmountDesc(dealById.get(a.deal_id).amount, dealById.get(b.deal_id).amount) || String(a.first_seen_at).localeCompare(String(b.first_seen_at)) || String(a.id).localeCompare(String(b.id)))
    .slice(0, 3).map(f => ({ finding_id: f.id, deal_id: f.deal_id, deal_name: dealById.get(f.deal_id).name, rule_key: f.rule_key, severity: f.severity, recommendation: f.recommendation, amount: dealById.get(f.deal_id).amount, currency: dealById.get(f.deal_id).currency }))
  return {
    ...base,
    snapshot: { id: snap.id, as_of: snap.as_of, rules_version: snap.rules_version, status: snap.status, timezone: snap.metrics?.timezone ?? null },
    filters,
    kpis: {
      revenue_score: agg.score, eligible_deals: agg.eligible_count, open_deals: agg.total_open_count, average_coverage: agg.avg_coverage, exclusions: agg.exclusions,
      by_currency: agg.by_currency, // open pipeline / amount at risk are never summed across currencies
      findings_open: visible.length, deals_with_findings: new Set(visible.map(f => f.deal_id)).size,
      coverage_summary: snap.metrics?.coverage_summary ?? null,
    },
    priorities,
    filter_options: {
      pipelines: ref.pipelines.map(p => ({ id: p.external_id, label: p.label })),
      stages: ref.stages.filter(s => s.is_closed !== true).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)).map(s => ({ id: s.external_id, label: s.label })),
      owners: ref.owners.filter(o => !o.archived).map(o => ({ id: o.external_id, label: o.name ?? o.external_id })),
    },
  }
}

export async function listFindings({ store, orgId, filters = {}, limit = 25, offset = 0, now = new Date().toISOString() }) {
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 50), off = Math.max(Number(offset) || 0, 0)
  const conn = await connectionInfo(store, orgId)
  const snap = await getLatestSnapshot(store, orgId)
  if (!snap) return { items: [], total: 0, groups: [], snapshot: null }
  const ref = await loadSnapshotDeals(store, orgId, snap.id)
  const dealById = new Map(ref.rows.filter(r => passes(r.deal, filters, ref)).map(r => [r.deal.id, r.deal]))
  const status = filters.status ?? 'open'
  const { rows, prefs } = await loadFindings(store, orgId, { statusFilter: status === 'open' || status === 'resolved' ? status : 'open' })
  const fromMs = filters.from ? Date.parse(filters.from) : null, toMs = filters.to ? Date.parse(filters.to) : null
  const matches = rows.filter(f => {
    const d = dealById.get(f.deal_id); if (!d) return false
    const p = prefs.get(f.id), sup = isSuppressed(p, now)
    if (status === 'open' && sup) return false
    if (status === 'dismissed' && !(p?.state === 'dismissed')) return false
    if (status === 'snoozed' && !(p?.state === 'snoozed' && sup)) return false
    if (filters.category && f.category !== filters.category) return false
    if (filters.severity && f.severity !== filters.severity) return false
    const seen = Date.parse(f.first_seen_at)
    if (fromMs !== null && seen < fromMs) return false
    if (toMs !== null && seen > toMs) return false
    return true
  })
  // group summary: unique deals and unique amount per currency (never double counted)
  const groupsMap = new Map()
  for (const f of matches) {
    const g = groupsMap.get(f.category) ?? { category: f.category, findings: 0, deals: new Map(), severity: { high: 0, medium: 0, low: 0, info: 0 } }
    g.findings++; g.severity[f.severity] = (g.severity[f.severity] ?? 0) + 1; g.deals.set(f.deal_id, dealById.get(f.deal_id)); groupsMap.set(f.category, g)
  }
  const groups = [...groupsMap.values()].map(g => {
    const by = {}
    for (const d of g.deals.values()) { const k = d.currency ?? 'UNKNOWN'; const b = (by[k] ??= { currency: d.currency, sum: 0n, unknown: 0 }); const a = parseDecimal(d.amount); if (a === null) b.unknown++; else b.sum += a }
    return { category: g.category, findings: g.findings, unique_deals: g.deals.size, severity: g.severity, unique_amount_by_currency: Object.values(by).map(b => ({ currency: b.currency, amount: formatDecimal(b.sum), unknown_amount_deals: b.unknown })) }
  }).sort((a, b) => b.findings - a.findings)
  matches.sort((a, b) => (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) || String(a.first_seen_at).localeCompare(String(b.first_seen_at)))
  const nowMs = Date.parse(now)
  const items = matches.slice(off, off + lim).map(f => {
    const d = dealById.get(f.deal_id), p = prefs.get(f.id)
    return {
      id: f.id, deal_id: f.deal_id, deal_name: d.name, amount: d.amount, currency: d.currency, owner: ref.owners.find(o => o.id === d.owner_id)?.name ?? null,
      stage: ref.stages.find(s => s.id === d.stage_id)?.label ?? null, rule_key: f.rule_key, category: f.category, severity: f.severity, status: f.status,
      evidence: f.evidence, recommendation: f.recommendation, first_seen_at: f.first_seen_at, age_days: Math.floor((nowMs - Date.parse(f.first_seen_at)) / 86400000),
      preference: p ? { state: p.state, reason: p.reason, until: p.until } : null, hubspot_url: hubspotRecordUrl(conn?.portal_id, 'deal', d.external_id),
    }
  })
  return { items, total: matches.length, groups, snapshot: { id: snap.id, as_of: snap.as_of }, next_offset: off + lim < matches.length ? off + lim : null }
}

export async function listDeals({ store, orgId, filters = {}, limit = 25, offset = 0, sort = 'health', q = '' }) {
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100), off = Math.max(Number(offset) || 0, 0)
  const conn = await connectionInfo(store, orgId)
  const snap = await getLatestSnapshot(store, orgId)
  if (!snap) return { items: [], total: 0, snapshot: null }
  const ref = await loadSnapshotDeals(store, orgId, snap.id)
  let rows = ref.rows.filter(r => passes(r.deal, filters, ref))
  if (q) rows = rows.filter(r => (r.deal.name ?? '').toLowerCase().includes(String(q).toLowerCase()))
  const key = r => (r.evaluation.health === null ? 1000 : r.evaluation.health)
  rows.sort(sort === 'amount' ? (a, b) => cmpAmountDesc(a.deal.amount, b.deal.amount) || String(a.deal.id).localeCompare(String(b.deal.id)) : (a, b) => (key(a) - key(b)) || cmpAmountDesc(a.deal.amount, b.deal.amount) || String(a.deal.id).localeCompare(String(b.deal.id)))
  const items = rows.slice(off, off + lim).map(r => ({
    id: r.deal.id, name: r.deal.name, company: ref.companies.find(c => c.id === r.deal.company_id)?.name ?? null, owner: ref.owners.find(o => o.id === r.deal.owner_id)?.name ?? null,
    amount: r.deal.amount, currency: r.deal.currency, stage: ref.stages.find(s => s.id === r.deal.stage_id)?.label ?? null, close_at: r.deal.close_at,
    last_activity_at: null, health: r.evaluation.health, band: r.evaluation.band, coverage: r.evaluation.coverage, provisional: r.evaluation.provisional,
    hubspot_url: hubspotRecordUrl(conn?.portal_id, 'deal', r.deal.external_id),
  }))
  // last activity (valid commercial touch) from the rule evidence, no extra query
  for (const it of items) {
    const ev = rows.find(r => r.deal.id === it.id).evaluation.results.find(x => x.rule_key === 'inactivity')
    it.days_since_activity = ev && typeof ev.observed_value === 'number' && ev.status !== 'unknown' ? ev.observed_value : null
  }
  return { items, total: rows.length, snapshot: { id: snap.id, as_of: snap.as_of }, next_offset: off + lim < rows.length ? off + lim : null }
}

export async function dealDetail({ store, orgId, dealId, now = new Date().toISOString() }) {
  const [deal] = await store.select('crm_deals', { where: { id: dealId, organization_id: orgId }, columns: 'id,external_id,name,amount::text,currency,close_at,stage_id,stage_external_id,pipeline_id,owner_id,company_id,owner_state,stage_entered_at,stage_entered_source,created_at_source,source_updated_at,synced_at,archived,field_states' })
  if (!deal) throw notFound('Deal not found')
  const conn = await connectionInfo(store, orgId)
  const [stage, pipeline, owner, company] = await Promise.all([
    deal.stage_id ? store.select('crm_stages', { where: { id: deal.stage_id, organization_id: orgId } }) : [], deal.pipeline_id ? store.select('crm_pipelines', { where: { id: deal.pipeline_id, organization_id: orgId } }) : [],
    deal.owner_id ? store.select('crm_owners', { where: { id: deal.owner_id, organization_id: orgId } }) : [], deal.company_id ? store.select('crm_companies', { where: { id: deal.company_id, organization_id: orgId } }) : [],
  ]).then(r => r.map(x => x[0] ?? null))
  const [evaluation] = await store.select('revenue_evaluations', { where: { organization_id: orgId, deal_id: dealId }, order: 'created_at.desc', limit: 1 })
  const findings = await store.select('revenue_findings', { where: { organization_id: orgId, deal_id: dealId }, order: 'first_seen_at.desc' })
  const prefs = new Map(findings.length ? (await store.select('revenue_finding_preferences', { where: { organization_id: orgId, finding_id: { in: findings.map(f => f.id) } } })).map(p => [p.finding_id, p]) : [])
  const links = await store.select('crm_associations', { where: { organization_id: orgId, deleted_at: { isnull: true }, to_external_id: deal.external_id, to_type: 'deal' }, columns: 'from_type,from_external_id', limit: 300 })
  const contactLinks = await store.select('crm_associations', { where: { organization_id: orgId, deleted_at: { isnull: true }, from_type: 'deal', from_external_id: deal.external_id, to_type: 'contact' }, columns: 'to_external_id', limit: 100 })
  const contacts = contactLinks.length ? await store.select('crm_contacts', { where: { organization_id: orgId, external_id: { in: contactLinks.map(c => c.to_external_id) } }, columns: 'external_id,first_name,last_name,job_title' }) : []
  const activities = []
  for (const t of ['call', 'email', 'meeting', 'task']) {
    const ids = links.filter(l => l.from_type === t).map(l => l.from_external_id)
    if (ids.length) activities.push(...await store.select('crm_activities', { where: { organization_id: orgId, type: t, external_id: { in: ids.slice(0, 100) } }, columns: 'id,type,occurred_at,due_at,status,direction,subject' }))
  }
  activities.sort((a, b) => String(b.occurred_at ?? b.due_at).localeCompare(String(a.occurred_at ?? a.due_at)))
  const history = await store.select('crm_property_history', { where: { organization_id: orgId, deal_id: dealId, property: 'dealstage' }, columns: 'value,effective_at,source', order: 'effective_at.desc', limit: 30 })
  const proposals = await store.select('revenue_action_proposals', { where: { organization_id: orgId, deal_id: dealId }, order: 'created_at.desc', limit: 20, columns: 'id,kind,status,version,created_at' })
  const unknown = (evaluation?.results ?? []).filter(r => r.status === 'unknown').map(r => ({ rule_key: r.rule_key, reason: r.reason }))
  return {
    deal: { ...deal, stage: stage?.label ?? null, stage_category: stage?.category ?? null, pipeline: pipeline?.label ?? null, owner: owner?.name ?? null, company: company?.name ?? null, hubspot_url: hubspotRecordUrl(conn?.portal_id, 'deal', deal.external_id) },
    evaluation: evaluation ? { health: evaluation.health, coverage: evaluation.coverage, band: evaluation.band, provisional: evaluation.provisional, as_of: evaluation.as_of, rules_version: evaluation.rules_version, factors: evaluation.results } : null,
    unknown_data: unknown,
    findings: findings.map(f => ({ ...f, preference: prefs.get(f.id) ? { state: prefs.get(f.id).state, reason: prefs.get(f.id).reason, until: prefs.get(f.id).until } : null, suppressed: isSuppressed(prefs.get(f.id), now) })),
    associations: { contacts: contacts.map(c => ({ name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.external_id, title: c.job_title })), company: company?.name ?? null },
    timeline: activities.slice(0, 40), stage_history: history, proposals,
  }
}

export async function setFindingPreference({ store, ctx, findingId, state, reason, until, requestId }) {
  const [f] = await store.select('revenue_findings', { where: { id: findingId, organization_id: ctx.orgId } })
  if (!f) throw notFound('Finding not found')
  if (state === 'clear') {
    const [prev] = await store.select('revenue_finding_preferences', { where: { organization_id: ctx.orgId, finding_id: findingId } })
    if (prev) await store.delete('revenue_finding_preferences', { organization_id: ctx.orgId, finding_id: findingId })
    await store.rpc('rv_audit', { _org: ctx.orgId, _actor_type: 'user', _actor: ctx.userId, _event: 'finding.preference_cleared', _entity_type: 'finding', _entity_id: findingId, _before: prev ? { state: prev.state, reason: prev.reason, until: prev.until } : null, _after: null, _request_id: requestId ?? null })
    return { ok: true }
  }
  if (!['dismissed', 'snoozed'].includes(state)) throw badRequest('state must be dismissed or snoozed')
  const why = String(reason ?? '').trim()
  if (!why) throw badRequest('A reason is required')
  if (state === 'snoozed' && (!until || Number.isNaN(Date.parse(until)) || Date.parse(until) <= Date.now())) throw badRequest('Snooze needs a future date')
  await store.insert('revenue_finding_preferences', [{ organization_id: ctx.orgId, finding_id: findingId, state, reason: why.slice(0, 500), until: state === 'snoozed' ? new Date(until).toISOString() : null, actor_user_id: ctx.userId }], { onConflict: 'organization_id,finding_id' })
  await store.rpc('rv_audit', { _org: ctx.orgId, _actor_type: 'user', _actor: ctx.userId, _event: `finding.${state}`, _entity_type: 'finding', _entity_id: findingId, _before: null, _after: { state, reason: why.slice(0, 200), until: until ?? null }, _request_id: requestId ?? null })
  return { ok: true } // evidence, score and the finding itself are untouched
}
