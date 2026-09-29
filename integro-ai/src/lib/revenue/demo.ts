// Explicit DEMO mode for Revenue Manager: fictitious data, in-memory only.
//
// It is never a fallback. It is only active when the user opts in with `?demo=1`
// (remembered for the browser session, cleared with `?demo=0` or the banner button),
// and the UI shows a permanent "DEMO" banner. Nothing here talks to the server,
// HubSpot or OpenAI, and nothing is persisted.

import { ApiError } from './api'

const KEY = 'integro_revenue_demo'

export function isDemo(): boolean {
  try {
    const p = new URLSearchParams(window.location.search).get('demo')
    if (p === '1') sessionStorage.setItem(KEY, '1')
    if (p === '0') sessionStorage.removeItem(KEY)
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function exitDemo() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  window.location.assign(window.location.pathname)
}

const day = 86400000
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString()
const NOW = () => new Date().toISOString()

interface D { id: string; name: string; company: string | null; owner: string | null; amount: string | null; currency: string | null; stage: string; category: string; closeIn: number | null; sinceAct: number | null; health: number | null; band: string; coverage: number; provisional: boolean; contacts: string[]; rules: Record<string, [string, number, unknown, unknown, string]> }

// rules: key -> [status, penalty, observed, threshold, reason]
const DEALS: D[] = [
  { id: 'demo-1', name: 'Globex — renewal', company: 'Globex', owner: 'Ann Lee', amount: '50000', currency: 'USD', stage: 'Negotiation', category: 'late', closeIn: -3, sinceAct: 31, health: 45, band: 'high_risk', coverage: 1, provisional: false, contacts: ['Cy Buyer · VP Ops', 'Dana Ruiz · Finance'],
    rules: { inactivity: ['triggered', 20, 31, 14, 'no_recent_activity'], no_next_step: ['triggered', 20, 0, null, 'no_open_future_task_or_meeting'], overdue_close: ['triggered', 15, '2 days ago', 'today', 'close_date_in_the_past'] } },
  { id: 'demo-2', name: 'Initech — platform rollout', company: 'Initech', owner: 'Bo Chen', amount: '120000', currency: 'USD', stage: 'Proposal', category: 'mid', closeIn: 20, sinceAct: 4, health: 100, band: 'healthy', coverage: 1, provisional: false, contacts: ['Peter G. · Director', 'Samir N. · CTO', 'Milton W. · Procurement'], rules: {} },
  { id: 'demo-3', name: 'Umbrella — expansion', company: 'Umbrella Corp', owner: 'Ann Lee', amount: '80000', currency: 'USD', stage: 'Negotiation', category: 'late', closeIn: 9, sinceAct: 18, health: 60, band: 'attention', coverage: 1, provisional: false, contacts: ['Alice A. · VP', 'Wesker · Legal'],
    rules: { inactivity: ['triggered', 20, 18, 14, 'no_recent_activity'], no_next_step: ['triggered', 20, 0, null, 'no_open_future_task_or_meeting'] } },
  { id: 'demo-4', name: 'Hooli — pilot', company: 'Hooli', owner: null, amount: '30000', currency: 'USD', stage: 'Discovery', category: 'early', closeIn: 40, sinceAct: 2, health: 90, band: 'healthy', coverage: 1, provisional: false, contacts: ['Gavin B. · Head of Product'],
    rules: { missing_owner: ['triggered', 10, null, null, 'owner_empty'] } },
  { id: 'demo-5', name: 'Stark — analytics seats', company: 'Stark Industries', owner: 'Bo Chen', amount: '45000', currency: 'EUR', stage: 'Proposal', category: 'mid', closeIn: 15, sinceAct: 9, health: 100, band: 'healthy', coverage: 1, provisional: false, contacts: ['Pepper P. · COO', 'Happy H. · IT'], rules: {} },
  { id: 'demo-6', name: 'Wayne — enterprise suite', company: 'Wayne Enterprises', owner: 'Cy Ruiz', amount: '65000', currency: 'USD', stage: 'Negotiation', category: 'late', closeIn: 5, sinceAct: 40, health: 45, band: 'high_risk', coverage: 1, provisional: false, contacts: ['Lucius F. · CFO'],
    rules: { inactivity: ['triggered', 20, 40, 14, 'no_recent_activity'], no_next_step: ['triggered', 20, 0, null, 'no_open_future_task_or_meeting'], single_contact: ['triggered', 15, 1, '20000', 'single_associated_contact'] } },
  { id: 'demo-7', name: 'Pied Piper — data platform', company: 'Pied Piper', owner: 'Cy Ruiz', amount: null, currency: null, stage: 'Proposal', category: 'mid', closeIn: null, sinceAct: null, health: 70, band: 'provisional', coverage: 0.55, provisional: true, contacts: ['Richard H. · CEO'],
    rules: { inactivity: ['unknown', 0, null, 14, 'activity_coverage_incomplete'], stalled_stage: ['unknown', 0, null, null, 'insufficient_history_and_no_manual_threshold'], overdue_close: ['unknown', 0, null, null, 'close_date_unknown'], single_contact: ['unknown', 0, null, null, 'amount_unknown'] } },
  { id: 'demo-8', name: 'Acme — onboarding pack', company: 'Acme Corp', owner: 'Ann Lee', amount: '28000', currency: 'EUR', stage: 'Discovery', category: 'early', closeIn: 30, sinceAct: 1, health: 100, band: 'healthy', coverage: 1, provisional: false, contacts: ['Wile E. · Ops', 'Road R. · Finance'], rules: {} },
]

const RULE_KEYS = ['inactivity', 'no_next_step', 'stalled_stage', 'overdue_close', 'single_contact', 'missing_owner']
const CATEGORY: Record<string, string> = { inactivity: 'inactivity', no_next_step: 'next_step', stalled_stage: 'stalled', overdue_close: 'close_date', single_contact: 'single_contact', missing_owner: 'owner' }
const SEVERITY: Record<string, string> = { inactivity: 'high', no_next_step: 'high', stalled_stage: 'medium', overdue_close: 'medium', single_contact: 'medium', missing_owner: 'low' }
const RECO: Record<string, string> = {
  inactivity: 'Log or schedule a real touchpoint (call, email or meeting) with the buyer this week.',
  no_next_step: 'Create a dated next step (task or meeting) for this late-stage deal.',
  overdue_close: 'Update the close date to a realistic one, or move the deal to closed-lost if it is dead.',
  single_contact: 'Add and engage a second stakeholder (economic buyer / champion).',
  missing_owner: 'Assign an owner in HubSpot.',
  data_quality: 'Fill the missing fields in HubSpot so this deal can be evaluated.',
}

interface Finding { id: string; deal_id: string; rule_key: string; category: string; severity: string; status: string; evidence: Record<string, unknown>; recommendation: string; first_seen_at: string; preference: { state: string; reason: string; until: string | null } | null }

// ── mutable in-memory state (resets on reload) ─────────────────────────────
const S = {
  findings: [] as Finding[],
  actions: [] as Record<string, unknown>[],
  briefs: [] as Record<string, unknown>[],
  chat: [] as { id: string; title: string; created_at: string; messages: Record<string, unknown>[] }[],
  lastSync: NOW(),
  seq: 0,
}

function init() {
  if (S.findings.length) return
  let n = 0
  for (const d of DEALS) {
    for (const [k, r] of Object.entries(d.rules)) {
      if (r[0] !== 'triggered') continue
      S.findings.push({ id: `demo-f${++n}`, deal_id: d.id, rule_key: k, category: CATEGORY[k], severity: SEVERITY[k], status: 'open', evidence: { observed_value: r[2], threshold: r[3], reason: r[4] }, recommendation: RECO[k], first_seen_at: iso(-(3 + n)), preference: null })
    }
  }
  S.findings.push({ id: `demo-f${++n}`, deal_id: 'demo-7', rule_key: 'data_quality', category: 'data_quality', severity: 'info', status: 'open', evidence: { issues: ['amount_missing', 'close_date_missing'], reason: 'known_empty_fields' }, recommendation: RECO.data_quality, first_seen_at: iso(-6), preference: null })
  S.actions.push({ id: 'demo-p1', deal_id: 'demo-1', kind: 'create_task', payload: { subject: 'Re-engage Globex buyer before renewal', body: 'No touchpoint in 31 days; confirm budget owner and next meeting.', due_at: iso(2), owner_external_id: null }, payload_hash: 'a1b2c3d4e5f60718', version: 1, base_state: {}, rationale: 'inactivity: 31 days without a real touchpoint', source: 'ai', portal_id: 'demo', status: 'proposed', created_by: null, approved_by: null, approved_at: null, expires_at: iso(7), result: null, created_at: iso(-1) })
  S.actions.push({ id: 'demo-p2', deal_id: 'demo-6', kind: 'create_task', payload: { subject: 'Multi-thread Wayne: intro to CEO sponsor', body: 'Only one contact (CFO) on a 65k deal.', due_at: iso(3), owner_external_id: null }, payload_hash: '9f8e7d6c5b4a3210', version: 1, base_state: {}, rationale: 'single_contact', source: 'user', portal_id: 'demo', status: 'succeeded', created_by: 'u', approved_by: 'm', approved_at: iso(-2), expires_at: iso(5), result: { external_result_id: 'demo-task-88' }, created_at: iso(-3) })
  S.briefs.push(makeBrief(true, iso(-7)))
}

const money = (a: string | null) => (a === null ? 0n : BigInt(a))
const openDeals = () => DEALS
const visible = (f: Finding) => f.status === 'open' && !(f.preference && (f.preference.state === 'dismissed' || (f.preference.until && Date.parse(f.preference.until) > Date.now())))

function overview() {
  const vis = S.findings.filter(visible)
  const usd = DEALS.filter(d => d.currency === 'USD' || d.currency === null)
  const eur = DEALS.filter(d => d.currency === 'EUR')
  const sum = (ds: D[]) => ds.reduce((s, d) => s + money(d.amount), 0n).toString()
  const risk = (ds: D[]) => ds.filter(d => !d.provisional && d.health !== null && d.health < 60)
  const eligible = DEALS.filter(d => !d.provisional && d.health !== null)
  const score = Math.round((eligible.reduce((s, d) => s + (d.health ?? 0), 0) / eligible.length) * 100) / 100
  const priorities = vis.filter(f => f.category !== 'data_quality').sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1)).slice(0, 3).map(f => { const d = DEALS.find(x => x.id === f.deal_id)!; return { finding_id: f.id, deal_id: d.id, deal_name: d.name, rule_key: f.rule_key, severity: f.severity, recommendation: f.recommendation, amount: d.amount, currency: d.currency } })
  return {
    connection: { status: 'active', portal_id: 'demo' }, onboarding_state: 'synced',
    last_sync: { id: 'demo-run', status: 'partial', finished_at: S.lastSync, warnings: ['activities_email_denied'], error: null },
    snapshot: { id: 'demo-snap', as_of: S.lastSync, rules_version: 1, status: 'partial', timezone: 'America/Mexico_City' }, filters: {},
    kpis: {
      revenue_score: score, eligible_deals: eligible.length, open_deals: DEALS.length, average_coverage: 0.94, exclusions: { provisional: 1, not_evaluable: 0 },
      by_currency: [
        { currency: 'USD', open_count: usd.length, unknown_amount_count: 1, open_pipeline: sum(usd), at_risk_amount: sum(risk(usd)), at_risk_deal_count: risk(usd).length, provisional_at_risk_amount: '0', provisional_at_risk_deal_count: 0 },
        { currency: 'EUR', open_count: eur.length, unknown_amount_count: 0, open_pipeline: sum(eur), at_risk_amount: '0', at_risk_deal_count: 0, provisional_at_risk_amount: '0', provisional_at_risk_deal_count: 0 },
      ],
      findings_open: vis.length, deals_with_findings: new Set(vis.map(f => f.deal_id)).size,
      coverage_summary: { activities: 'partial', stage_history: 'complete', associations_contacts: 'complete' },
    },
    priorities,
    filter_options: { pipelines: [{ id: 'p1', label: 'Sales pipeline' }], stages: ['Discovery', 'Proposal', 'Negotiation'].map(s => ({ id: s, label: s })), owners: ['Ann Lee', 'Bo Chen', 'Cy Ruiz'].map(o => ({ id: o, label: o })) },
  }
}

function dealRow(d: D) {
  return { id: d.id, name: d.name, company: d.company, owner: d.owner, amount: d.amount, currency: d.currency, stage: d.stage, close_at: d.closeIn === null ? null : iso(d.closeIn), days_since_activity: d.sinceAct, health: d.health, band: d.band, coverage: d.coverage, provisional: d.provisional, hubspot_url: null }
}

function findingRow(f: Finding) {
  const d = DEALS.find(x => x.id === f.deal_id)!
  return { id: f.id, deal_id: d.id, deal_name: d.name, amount: d.amount, currency: d.currency, owner: d.owner, stage: d.stage, rule_key: f.rule_key, category: f.category, severity: f.severity, status: f.status, evidence: f.evidence, recommendation: f.recommendation, first_seen_at: f.first_seen_at, age_days: Math.max(0, Math.floor((Date.now() - Date.parse(f.first_seen_at)) / day)), preference: f.preference, hubspot_url: null }
}

function findings(q: Record<string, string | number | undefined | null>) {
  const status = String(q.status ?? 'open')
  let rows = S.findings.filter(f => {
    if (status === 'open') return visible(f)
    if (status === 'resolved') return f.status === 'resolved'
    if (status === 'dismissed') return f.preference?.state === 'dismissed'
    if (status === 'snoozed') return f.preference?.state === 'snoozed'
    return true
  })
  const d = (f: Finding) => DEALS.find(x => x.id === f.deal_id)!
  if (q.category) rows = rows.filter(f => f.category === q.category)
  if (q.severity) rows = rows.filter(f => f.severity === q.severity)
  if (q.owner) rows = rows.filter(f => (q.owner === 'none' ? d(f).owner === null : d(f).owner === q.owner))
  if (q.stage) rows = rows.filter(f => d(f).stage === q.stage)
  const groups = new Map<string, Finding[]>()
  for (const f of rows) groups.set(f.category, [...(groups.get(f.category) ?? []), f])
  return {
    items: rows.map(findingRow), total: rows.length, snapshot: { id: 'demo-snap', as_of: S.lastSync }, next_offset: null,
    groups: [...groups].map(([category, fs]) => {
      const deals = [...new Set(fs.map(f => f.deal_id))].map(id => DEALS.find(x => x.id === id)!)
      const cur = [...new Set(deals.map(x => x.currency))]
      return { category, findings: fs.length, unique_deals: deals.length, severity: fs.reduce<Record<string, number>>((m, f) => ((m[f.severity] = (m[f.severity] ?? 0) + 1), m), {}), unique_amount_by_currency: cur.map(c => ({ currency: c, amount: deals.filter(x => x.currency === c).reduce((s, x) => s + money(x.amount), 0n).toString(), unknown_amount_deals: deals.filter(x => x.currency === c && x.amount === null).length })) }
    }).sort((a, b) => b.findings - a.findings),
  }
}

function dealDetail(id: string) {
  const d = DEALS.find(x => x.id === id)
  if (!d) throw new ApiError(404, 'not_found', 'Deal not found')
  const factors = RULE_KEYS.map(k => {
    const r = d.rules[k]
    if (r) return { rule_key: k, status: r[0], severity: SEVERITY[k], penalty: r[1], observed_value: r[2], threshold: r[3], reason: r[4] }
    const na = k === 'no_next_step' && d.category !== 'late'
    return { rule_key: k, status: na ? 'not_applicable' : 'clear', severity: SEVERITY[k], penalty: 0, observed_value: null, threshold: null, reason: na ? 'only_late_stage' : 'within_threshold' }
  })
  return {
    deal: { id: d.id, external_id: d.id, name: d.name, amount: d.amount, currency: d.currency, close_at: d.closeIn === null ? null : iso(d.closeIn), stage: d.stage, stage_category: d.category, pipeline: 'Sales pipeline', owner: d.owner, company: d.company, stage_entered_at: iso(-12), stage_entered_source: 'history', hubspot_url: null, synced_at: S.lastSync },
    evaluation: { health: d.health, coverage: d.coverage, band: d.band, provisional: d.provisional, as_of: S.lastSync, rules_version: 1, factors },
    unknown_data: factors.filter(f => f.status === 'unknown').map(f => ({ rule_key: f.rule_key, reason: f.reason })),
    findings: S.findings.filter(f => f.deal_id === id).map(f => ({ ...findingRow(f), suppressed: !visible(f) })),
    associations: { contacts: d.contacts.map(c => ({ name: c.split(' · ')[0], title: c.split(' · ')[1] ?? null })), company: d.company },
    timeline: d.sinceAct === null ? [] : [{ id: `${d.id}-a1`, type: 'email', occurred_at: iso(-d.sinceAct), due_at: null, status: 'sent', direction: 'EMAIL', subject: 'Follow-up on proposal' }, { id: `${d.id}-a2`, type: 'call', occurred_at: iso(-d.sinceAct - 6), due_at: null, status: 'completed', direction: 'OUTBOUND', subject: 'Discovery call' }],
    stage_history: [{ value: d.stage, effective_at: iso(-12), source: 'hubspot_history' }],
    proposals: S.actions.filter(a => a.deal_id === id).map(a => ({ id: a.id, kind: a.kind, status: a.status, version: a.version, created_at: a.created_at })),
  }
}

function makeBrief(baseline: boolean, when: string) {
  const o = overview()
  const top = S.findings.filter(f => f.category !== 'data_quality' && f.status === 'open').slice(0, 4)
  const id = `demo-b${++S.seq}`
  return {
    id, period: 'weekly', period_start: when.slice(0, 10), period_end: when.slice(0, 10), is_baseline: baseline, status: 'ready', created_at: when,
    content: {
      period: 'weekly', as_of: when, snapshot_status: 'partial',
      comparison: baseline ? { available: false, reason: 'baseline' } : { available: true },
      metrics: { revenue_score: o.kpis.revenue_score, eligible_deals: o.kpis.eligible_deals, open_deals: o.kpis.open_deals, average_coverage: o.kpis.average_coverage, by_currency: o.kpis.by_currency, open_findings: o.kpis.findings_open },
      changes: baseline ? null : { score_delta: 1.5, open_findings_delta: -1, previous_as_of: iso(-7) },
      top_risks: top.map(f => { const d = DEALS.find(x => x.id === f.deal_id)!; return { evidence_id: `finding:${f.id}`, deal_id: d.id, deal_name: d.name, amount: d.amount, currency: d.currency, rule: f.rule_key, severity: f.severity, recommendation: f.recommendation } }),
      actions: top.map(f => { const d = DEALS.find(x => x.id === f.deal_id)!; return { deal_id: d.id, deal_name: d.name, text: f.recommendation, evidence_id: `finding:${f.id}` } }),
      sources: top.map(f => ({ id: `finding:${f.id}`, type: 'finding', label: `${f.rule_key} — ${DEALS.find(x => x.id === f.deal_id)!.name}`, deal_id: f.deal_id, hubspot_url: null, as_of: when })),
      narrative: { headline: 'Two late-stage deals need attention this week.', summary: 'Globex and Wayne are the main risks: both have gone weeks without a real touchpoint and lack a dated next step. This is demo text, not real analysis.', priorities: top.slice(0, 2).map(f => ({ text: RECO[f.rule_key], evidence_ids: [`finding:${f.id}`] })) },
      ai: { status: 'ok', model: 'demo' },
    },
  }
}

function ask(question: string) {
  const q = question.toLowerCase()
  const dealSrc = (ids: string[]) => ids.map(id => { const d = DEALS.find(x => x.id === id)!; return { id: `deal:${id}`, type: 'deal', label: d.name ?? id, deal_id: id, hubspot_url: null } })
  let answer: string, sources: ReturnType<typeof dealSrc> = [], insufficient = false
  if (/risk|riesgo/.test(q)) { answer = 'Two deals are at high risk: Globex — renewal (USD 50,000) and Wayne — enterprise suite (USD 65,000). Both scored 45 because of inactivity and no dated next step; Wayne also depends on a single contact.'; sources = dealSrc(['demo-1', 'demo-6']) }
  else if (/next step|siguiente/.test(q)) { answer = 'Late-stage deals without a dated next step: Globex — renewal, Umbrella — expansion and Wayne — enterprise suite.'; sources = dealSrc(['demo-1', 'demo-3', 'demo-6']) }
  else if (/single|contact|contacto/.test(q)) { answer = 'Wayne — enterprise suite has exactly one associated contact (above the USD 20,000 threshold).'; sources = dealSrc(['demo-6']) }
  else if (/change|cambi|brief/.test(q)) { answer = 'This is the first snapshot, so there is nothing comparable yet: no trend can be shown.'; insufficient = true }
  else { answer = 'I cannot answer that reliably from the synced data (demo mode answers only the suggested questions).'; insufficient = true }
  return { session_id: 'demo-s1', message_id: `demo-m${++S.seq}`, answer, verified: true, insufficient_data: insufficient, sources, limitations: ['DEMO: canned answers over fictitious data.', 'Some CRM data (for example e-mail activities) could not be read, so some rules are marked unknown.'], data_as_of: S.lastSync }
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export async function demoApi<T>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; query?: Record<string, string | number | undefined | null> } = {}): Promise<T> {
  init()
  await sleep(120)
  const m = opts.method ?? 'GET'
  const q = opts.query ?? {}
  const body = (opts.body ?? {}) as Record<string, unknown>
  const out = (v: unknown) => v as T
  let r: RegExpExecArray | null

  if (path === 'revenue/context') return out({ organization: { id: 'demo-org', name: 'Demo Company', timezone: 'America/Mexico_City' }, role: 'admin', flags: { revenue_mvp_enabled: true, managed_ai_enabled: true, hubspot_write_actions_enabled: true, legacy_outreach_enabled: false }, ai_configured: true })
  if (path === 'revenue/overview') return out(overview())
  if (path === 'revenue/findings') return out(findings(q))
  if ((r = /^revenue\/findings\/([^/]+)\/preference$/.exec(path))) {
    const f = S.findings.find(x => x.id === r![1])
    if (!f) throw new ApiError(404, 'not_found', 'Finding not found')
    if (body.state === 'clear') f.preference = null
    else {
      if (!String(body.reason ?? '').trim()) throw new ApiError(400, 'bad_request', 'A reason is required')
      f.preference = { state: String(body.state), reason: String(body.reason), until: body.until ? String(body.until) : null }
    }
    return out({ ok: true })
  }
  if (path === 'revenue/deals') {
    let rows = openDeals().map(dealRow)
    if (q.q) rows = rows.filter(d => (d.name ?? '').toLowerCase().includes(String(q.q).toLowerCase()))
    rows.sort(q.sort === 'amount' ? (a, b) => Number(b.amount ?? -1) - Number(a.amount ?? -1) : (a, b) => (a.health ?? 1000) - (b.health ?? 1000))
    return out({ items: rows, total: rows.length, snapshot: { id: 'demo-snap', as_of: S.lastSync }, next_offset: null })
  }
  if ((r = /^revenue\/deals\/([^/]+)$/.exec(path))) return out(dealDetail(r[1]))
  if (path === 'revenue/briefs' && m === 'GET') return out({ items: S.briefs.map(b => ({ id: b.id, period: b.period, period_start: b.period_start, period_end: b.period_end, is_baseline: b.is_baseline, status: b.status, created_at: b.created_at })).reverse() })
  if (path === 'revenue/briefs' && m === 'POST') { S.briefs.push(makeBrief(false, NOW())); return out({ job_id: 'demo-job', period: body.period ?? 'weekly', snapshot_id: 'demo-snap' }) }
  if ((r = /^revenue\/briefs\/([^/]+)$/.exec(path))) { const b = S.briefs.find(x => x.id === r![1]); if (!b) throw new ApiError(404, 'not_found', 'Brief not found'); return out(b) }
  if (path === 'revenue/ask') {
    const a = ask(String(body.question ?? ''))
    const s = S.chat[0] ?? (S.chat[0] = { id: 'demo-s1', title: String(body.question ?? '').slice(0, 80), created_at: NOW(), messages: [] })
    s.messages.push({ id: `${a.message_id}u`, role: 'user', content: String(body.question ?? ''), evidence_refs: [], data_as_of: null, created_at: NOW() }, { id: a.message_id, role: 'assistant', content: a.answer, evidence_refs: a.sources, data_as_of: a.data_as_of, created_at: NOW() })
    await sleep(500)
    return out(a)
  }
  if (path === 'revenue/chat/sessions') return out({ items: S.chat.map(s => ({ id: s.id, title: s.title, created_at: s.created_at })) })
  if ((r = /^revenue\/chat\/sessions\/([^/]+)$/.exec(path))) { const s = S.chat.find(x => x.id === r![1]); if (!s) throw new ApiError(404, 'not_found', 'Session not found'); return out({ session: s, messages: s.messages }) }
  if (path === 'revenue/actions' && m === 'GET') { const st = q.status ? String(q.status) : ''; return out({ items: S.actions.filter(a => !st || a.status === st) }) }
  if (path === 'revenue/actions' && m === 'POST') {
    const p = { id: `demo-p${++S.seq + 10}`, deal_id: body.deal_id, kind: body.kind, payload: body.payload, payload_hash: Math.random().toString(16).slice(2, 18), version: 1, base_state: {}, rationale: body.rationale ?? null, source: 'user', portal_id: 'demo', status: 'proposed', created_by: 'u', approved_by: null, approved_at: null, expires_at: iso(7), result: null, created_at: NOW() }
    S.actions.unshift(p); return out(p)
  }
  if ((r = /^revenue\/actions\/([^/]+)\/(edit|approve|reject)$/.exec(path))) {
    const a = S.actions.find(x => x.id === r![1]); if (!a) throw new ApiError(404, 'not_found', 'Proposal not found')
    if (r[2] === 'edit') { a.payload = body.payload; a.version = Number(a.version) + 1; a.payload_hash = Math.random().toString(16).slice(2, 18); a.status = 'proposed'; a.approved_at = null; a.approved_by = null; return out({ result: 'edited', new_version: a.version }) }
    if (r[2] === 'reject') { a.status = 'rejected'; return out({ status: 'rejected' }) }
    if (Number(body.version) !== a.version || body.payload_hash !== a.payload_hash) throw new ApiError(409, 'stale_version', 'The proposal was edited after you opened it; review the new version')
    a.status = 'succeeded'; a.approved_by = 'demo-manager'; a.approved_at = NOW(); a.result = { external_result_id: `demo-task-${100 + S.seq++}` }
    return out({ status: 'approved', execution_id: 'demo-exec', job_id: 'demo-job' })
  }
  if (path === 'revenue/sync') { S.lastSync = NOW(); return out({ job_id: 'demo-job', sync_run_id: 'demo-run', kind: 'incremental' }) }
  if ((r = /^revenue\/jobs\//.exec(path))) return out({ job: { id: 'demo-job', kind: 'sync', status: 'succeeded', attempts: 1, last_error: null }, sync_run: { id: 'demo-run', status: 'succeeded', step: 'finalize', warnings: [], error: null, counters: { deals: 8, contacts: 14 } } })
  if (path === 'revenue/worker/kick') return out({ processed: 0 })
  if (path === 'revenue/rules') { if (m === 'POST') return out({ version: 2, note: 'DEMO: nothing was saved.' }); return out({ version: 1, engine_version: '1.0.0', thresholds: { inactivity_days: 14, stalled_multiplier: 1.5, single_contact_min_amount: { USD: '20000' } } }) }
  if (path === 'integrations/hubspot/status') return out({ oauth_configured: true, connected: true, reconnect_required: false, write_actions_enabled: true, connection: { status: 'active', portal_id: 'demo', connected_at: iso(-14), last_success_at: S.lastSync, last_error: null, scopes: [], capabilities: { read: true, write_tasks: true, write_deals: false }, coverage: { activities: 'partial', stage_history: 'complete', associations_contacts: 'complete' } }, last_sync: { id: 'demo-run', status: 'partial', started_at: S.lastSync, finished_at: S.lastSync, warnings: ['activities_email_denied'], error: null, step: 'finalize', counters: { deals: 8, contacts: 14, owners: 3 } } })
  if (path === 'revenue/onboarding' && m === 'GET') return out({ state: 'synced', settings: { selected_pipeline_ids: ['p1'], timezone: 'America/Mexico_City', currency: 'USD', brief_cadence: 'weekly' }, pipelines: [{ external_id: 'p1', label: 'Sales pipeline', stages: [
    { external_id: 'st1', label: 'Discovery', display_order: 0, is_closed: false, category: 'early', category_source: 'admin', suggested_category: 'early' },
    { external_id: 'st2', label: 'Proposal', display_order: 1, is_closed: false, category: 'mid', category_source: 'admin', suggested_category: 'mid' },
    { external_id: 'st3', label: 'Negotiation', display_order: 2, is_closed: false, category: 'late', category_source: 'admin', suggested_category: 'late' },
    { external_id: 'st4', label: 'Closed won', display_order: 3, is_closed: true, category: 'closed', category_source: 'metadata', suggested_category: 'closed' }] }] })
  if (path === 'revenue/onboarding' && m === 'POST') return out({ state: 'synced' })
  if (path.startsWith('integrations/hubspot/')) throw new ApiError(400, 'demo', 'Demo mode: connecting or disconnecting HubSpot is disabled.')
  throw new ApiError(404, 'not_found', `Demo mode has no data for ${path}`)
}
