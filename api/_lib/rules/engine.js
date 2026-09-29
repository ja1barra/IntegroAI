// Revenue Rules Engine — pure, deterministic, no I/O, no clock, no LLM.
// evaluateDeal(input, ruleset) -> Evaluation. Same input + ruleset => same output.

import { createHash } from 'node:crypto'
import { cmpDecimal, parseDecimal } from './decimal.js'
import { RULE_KEYS, mergeRuleset, ENGINE_VERSION } from './defaults.js'
import { DAY_MS, toMs, localDate, closeLocalDate } from './time.js'

/**
 * @typedef {'triggered'|'clear'|'unknown'|'not_applicable'} RuleStatus
 *
 * input = {
 *   as_of: ISO string (required), timezone: IANA (default UTC),
 *   deal: { id, external_id, amount, currency, is_open (bool|null), archived,
 *           stage: { id, external_id, category, is_closed }|null,
 *           owner_state: 'value'|'empty'|'unknown', owner_archived?: bool,
 *           field_states?: {amount?,close_at?,...}, close_at, created_at, stage_entered_at,
 *           contact_count: number|null },
 *   activities: [{ id, type, occurred_at, due_at, status, is_system }],
 *   coverage: { activities: 'complete'|'partial'|'none'|'denied',
 *               history_since_creation: bool },
 *   stage_stats: { sample_size, median_days }|null
 * }
 */

const r = (rule_key, status, extra = {}) => ({
  rule_key, status, severity: null, penalty: 0, evidence_refs: [], observed_value: null, threshold: null, reason: '', ...extra,
})

function fieldState(deal, key, value) {
  const s = deal.field_states?.[key]
  if (s) return s
  return value !== null && value !== undefined && value !== '' ? 'value' : 'unknown'
}

function isOpen(deal) {
  if (deal.archived) return false
  if (deal.is_open === false) return false
  if (deal.stage?.is_closed === true) return false
  return deal.is_open === true || deal.stage?.is_closed === false
}

const isValidCommercial = (a, rs) =>
  !a.is_system &&
  rs.valid_activity_types.includes(a.type) &&
  !rs.invalid_activity_statuses.includes(String(a.status ?? '').toLowerCase()) &&
  !rs.pending_activity_statuses.includes(String(a.status ?? '').toLowerCase())

// ── individual rules ────────────────────────────────────────────────────────

function ruleInactivity(inp, rs) {
  const key = 'inactivity', asOf = toMs(inp.as_of), th = rs.thresholds.inactivity_days
  const cov = inp.coverage?.activities ?? 'none'
  const valid = (inp.activities ?? []).filter(a => isValidCommercial(a, rs) && toMs(a.occurred_at) !== null && toMs(a.occurred_at) <= asOf)
  const last = valid.reduce((m, a) => Math.max(m, toMs(a.occurred_at)), -Infinity)
  if (valid.length) {
    const days = (asOf - last) / DAY_MS
    const ref = valid.filter(a => toMs(a.occurred_at) === last).map(a => ({ type: 'activity', id: a.id }))
    if (days > th) {
      // Old evidence only proves inactivity when we could see *all* activity.
      if (cov !== 'complete') return r(key, 'unknown', { observed_value: round(days), threshold: th, evidence_refs: ref, reason: 'activity_coverage_incomplete' })
      return r(key, 'triggered', { observed_value: round(days), threshold: th, evidence_refs: ref, reason: 'no_recent_activity' })
    }
    return r(key, 'clear', { observed_value: round(days), threshold: th, evidence_refs: ref, reason: 'recent_activity' })
  }
  if (cov === 'denied' || cov === 'none') return r(key, 'unknown', { threshold: th, reason: cov === 'denied' ? 'activity_permission_denied' : 'activity_not_synced' })
  const created = toMs(inp.deal.created_at)
  if (cov === 'complete' && inp.coverage?.history_since_creation && created !== null) {
    const age = (asOf - created) / DAY_MS
    return age > th
      ? r(key, 'triggered', { observed_value: round(age), threshold: th, reason: 'never_contacted_since_creation' })
      : r(key, 'clear', { observed_value: round(age), threshold: th, reason: 'deal_too_new_to_judge' })
  }
  return r(key, 'unknown', { threshold: th, reason: 'no_activity_and_history_incomplete' })
}

function ruleNoNextStep(inp, rs) {
  const key = 'no_next_step', asOf = toMs(inp.as_of), cat = inp.deal.stage?.category
  if (!cat || cat === 'unmapped') return r(key, 'unknown', { reason: 'stage_category_unmapped' })
  if (cat !== 'late') return r(key, 'not_applicable', { reason: 'only_late_stage' })
  const cov = inp.coverage?.activities ?? 'none'
  const future = (inp.activities ?? []).filter(a => {
    const st = String(a.status ?? '').toLowerCase()
    if (a.is_system || rs.invalid_activity_statuses.includes(st)) return false
    if (a.type === 'task') return !['completed', 'done'].includes(st) && toMs(a.due_at) !== null && toMs(a.due_at) > asOf
    if (a.type === 'meeting') { const t = toMs(a.due_at ?? a.occurred_at); return t !== null && t > asOf }
    return false
  })
  if (future.length) return r(key, 'clear', { observed_value: future.length, evidence_refs: future.map(a => ({ type: 'activity', id: a.id })), reason: 'future_task_or_meeting' })
  if (cov !== 'complete') return r(key, 'unknown', { reason: cov === 'denied' ? 'activity_permission_denied' : 'activity_coverage_incomplete' })
  return r(key, 'triggered', { observed_value: 0, reason: 'no_open_future_task_or_meeting' })
}

function ruleStalledStage(inp, rs) {
  const key = 'stalled_stage', asOf = toMs(inp.as_of), entered = toMs(inp.deal.stage_entered_at)
  if (entered === null) return r(key, 'unknown', { reason: 'stage_entry_date_unavailable' })
  const days = (asOf - entered) / DAY_MS
  const st = inp.stage_stats
  let threshold = null, source = null
  if (st && st.sample_size >= rs.thresholds.stalled_min_samples && st.median_days > 0) {
    threshold = st.median_days * rs.thresholds.stalled_multiplier; source = 'historical_median'
  } else {
    const manual = rs.thresholds.manual_stage_days?.[inp.deal.stage?.external_id]
    if (typeof manual === 'number' && manual > 0) { threshold = manual; source = 'manual' }
  }
  if (threshold === null) return r(key, 'unknown', { observed_value: round(days), reason: 'insufficient_history_and_no_manual_threshold', evidence_refs: [{ type: 'stage_stats', sample_size: st?.sample_size ?? 0 }] })
  const ev = [{ type: 'stage_stats', source, sample_size: st?.sample_size ?? 0, median_days: st?.median_days ?? null }]
  return days > threshold
    ? r(key, 'triggered', { observed_value: round(days), threshold: round(threshold), evidence_refs: ev, reason: `exceeds_${source}` })
    : r(key, 'clear', { observed_value: round(days), threshold: round(threshold), evidence_refs: ev, reason: `within_${source}` })
}

function ruleOverdueClose(inp) {
  const key = 'overdue_close', tz = inp.timezone ?? 'UTC'
  const close = toMs(inp.deal.close_at)
  if (close === null) {
    return fieldState(inp.deal, 'close_at', inp.deal.close_at) === 'empty'
      ? r(key, 'not_applicable', { reason: 'no_close_date_set' })
      : r(key, 'unknown', { reason: 'close_date_unknown' })
  }
  const today = localDate(toMs(inp.as_of), tz), closeDay = closeLocalDate(close, tz)
  return closeDay < today
    ? r(key, 'triggered', { observed_value: closeDay, threshold: today, reason: 'close_date_in_the_past' })
    : r(key, 'clear', { observed_value: closeDay, threshold: today, reason: 'close_date_not_past' })
}

function ruleSingleContact(inp, rs) {
  const key = 'single_contact', d = inp.deal
  const amountState = fieldState(d, 'amount', d.amount)
  if (amountState !== 'value') return amountState === 'empty' ? r(key, 'unknown', { reason: 'amount_empty' }) : r(key, 'unknown', { reason: 'amount_unknown' })
  if (parseDecimal(d.amount) === null) return r(key, 'unknown', { reason: 'amount_unparseable' })
  const min = d.currency ? rs.thresholds.single_contact_min_amount?.[d.currency] : undefined
  if (min === undefined) return r(key, 'unknown', { reason: d.currency ? 'no_threshold_for_currency' : 'currency_unknown' })
  if (cmpDecimal(d.amount, min) <= 0) return r(key, 'not_applicable', { reason: 'amount_not_above_threshold', threshold: min })
  if (d.contact_count === null || d.contact_count === undefined) return r(key, 'unknown', { threshold: min, reason: 'associations_unknown' })
  return d.contact_count === 1
    ? r(key, 'triggered', { observed_value: 1, threshold: min, reason: 'single_associated_contact' })
    : r(key, 'clear', { observed_value: d.contact_count, threshold: min, reason: 'multiple_or_no_contacts' })
}

function ruleMissingOwner(inp) {
  const key = 'missing_owner', d = inp.deal
  if (d.owner_state === 'empty') return r(key, 'triggered', { reason: 'owner_empty' })
  if (d.owner_state === 'value') return d.owner_archived ? r(key, 'triggered', { reason: 'owner_archived_or_removed' }) : r(key, 'clear', { reason: 'owner_assigned' })
  return r(key, 'unknown', { reason: 'owner_unknown' })
}

const RULES = {
  inactivity: ruleInactivity, no_next_step: ruleNoNextStep, stalled_stage: ruleStalledStage,
  overdue_close: ruleOverdueClose, single_contact: ruleSingleContact, missing_owner: ruleMissingOwner,
}

const round = n => Math.round(n * 100) / 100

// Informational (weight 0, not part of coverage): data quality gaps that are
// *known empty*, not merely inaccessible.
export function dataQualityIssues(deal) {
  const issues = []
  if (fieldState(deal, 'amount', deal.amount) === 'empty') issues.push('amount_missing')
  if (fieldState(deal, 'close_at', deal.close_at) === 'empty') issues.push('close_date_missing')
  if (deal.owner_state === 'empty') issues.push('owner_missing')
  if (deal.stage && deal.stage.category === 'unmapped') issues.push('stage_unmapped')
  if (fieldState(deal, 'currency', deal.currency) === 'empty' && fieldState(deal, 'amount', deal.amount) === 'value') issues.push('currency_missing')
  return issues
}

// ── evaluation ──────────────────────────────────────────────────────────────

export function evaluateDeal(input, rulesetOverride) {
  const rs = rulesetOverride?.weights && rulesetOverride?.thresholds && rulesetOverride?.bands ? rulesetOverride : mergeRuleset(rulesetOverride)
  const asOf = toMs(input.as_of)
  if (asOf === null) throw new TypeError('evaluateDeal: input.as_of is required (ISO timestamp)')
  const base = { deal_id: input.deal.id, as_of: new Date(asOf).toISOString(), engine_version: ENGINE_VERSION }

  if (!isOpen(input.deal)) {
    const reason = input.deal.archived ? 'archived' : input.deal.is_open === null && !input.deal.stage ? 'open_state_unknown' : 'closed'
    const results = RULE_KEYS.map(k => r(k, 'not_applicable', { reason }))
    return { ...base, input_hash: hashInput(input, rs, results), eligible: false, health: null, coverage: null, provisional: false, band: 'not_applicable', results, data_quality: [] }
  }

  const results = RULE_KEYS.map(k => {
    const res = RULES[k](input, rs)
    const w = rs.weights[k]
    return { ...res, severity: rs.severity[k] ?? null, penalty: res.status === 'triggered' ? w : 0 }
  })

  const applicable = results.filter(x => x.status !== 'not_applicable')
  const applicableW = applicable.reduce((s, x) => s + rs.weights[x.rule_key], 0)
  const knownW = applicable.filter(x => x.status === 'triggered' || x.status === 'clear').reduce((s, x) => s + rs.weights[x.rule_key], 0)
  if (applicableW === 0 || knownW === 0) {
    return { ...base, input_hash: hashInput(input, rs, results), eligible: false, health: null, coverage: applicableW === 0 ? null : 0, provisional: false, band: 'not_evaluable', results, data_quality: dataQualityIssues(input.deal) }
  }
  const coverage = round4(knownW / applicableW)
  const health = clamp(100 - results.reduce((s, x) => s + x.penalty, 0), 0, 100)
  const provisional = coverage < rs.min_coverage
  const band = provisional ? 'provisional'
    : health >= rs.bands.healthy_min ? 'healthy'
    : health >= rs.bands.attention_min ? 'attention' : 'high_risk'
  return { ...base, input_hash: hashInput(input, rs, results), eligible: !provisional, health, coverage, provisional, band, results, data_quality: dataQualityIssues(input.deal) }
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))
const round4 = n => Math.round(n * 10000) / 10000

// Stable, canonical JSON so equal inputs hash equal regardless of key order.
export function canonicalJson(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']'
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}'
}

// Hash of everything that determines the outcome: the inputs (WITHOUT the clock) plus a signature of the
// results at day granularity (rule status, penalty, whole days). Two runs with the same inputs and the same
// signature are the same evaluation (idempotent, storage stays small); a threshold crossed between 10:00 and
// 16:00 changes a status and therefore the hash, so a stale row can never be reused for a different outcome.
export function hashInput(input, rs, results = []) {
  const signature = results.map(r => [r.rule_key, r.status, r.penalty, typeof r.observed_value === 'number' ? Math.floor(r.observed_value) : r.observed_value ?? null])
  return createHash('sha256').update(canonicalJson({
    tz: input.timezone ?? 'UTC', deal: input.deal, activities: [...(input.activities ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    coverage: input.coverage, stage_stats: input.stage_stats, rules: rs, signature,
  })).digest('hex')
}
