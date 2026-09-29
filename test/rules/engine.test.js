import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateDeal } from '../../api/_lib/rules/engine.js'
import { aggregate } from '../../api/_lib/rules/aggregate.js'
import { reconcile, findingsFromEvaluation, isSuppressed } from '../../api/_lib/rules/findings.js'
import { computeStageStats } from '../../api/_lib/rules/stagestats.js'
import { parseDecimal, sumDecimals, cmpDecimal } from '../../api/_lib/rules/decimal.js'
import { closeLocalDate } from '../../api/_lib/rules/time.js'

const AS_OF = '2026-09-28T12:00:00Z'
const day = n => new Date(Date.parse(AS_OF) - n * 86400000).toISOString()
const future = n => new Date(Date.parse(AS_OF) + n * 86400000).toISOString()

// A deal where every rule is evaluable and clear.
function healthy(over = {}) {
  return {
    as_of: AS_OF, timezone: 'UTC',
    deal: {
      id: 'd1', external_id: '1', amount: '50000', currency: 'USD', is_open: true, archived: false,
      stage: { id: 's1', external_id: 'late1', category: 'late', is_closed: false },
      owner_state: 'value', close_at: future(10), created_at: day(60), stage_entered_at: day(5), contact_count: 3,
      ...(over.deal ?? {}),
    },
    activities: over.activities ?? [
      { id: 'a1', type: 'email', occurred_at: day(2), status: 'sent' },
      { id: 'a2', type: 'task', due_at: future(3), status: 'not_started' },
    ],
    coverage: { activities: 'complete', history_since_creation: true, ...(over.coverage ?? {}) },
    stage_stats: 'stage_stats' in over ? over.stage_stats : { sample_size: 30, median_days: 10 },
  }
}
const rule = (ev, k) => ev.results.find(r => r.rule_key === k)

test('fixture: everything clear -> health 100, coverage 1, healthy', () => {
  const ev = evaluateDeal(healthy())
  assert.equal(ev.health, 100); assert.equal(ev.coverage, 1); assert.equal(ev.band, 'healthy'); assert.equal(ev.eligible, true)
})

test('fixture: inactivity + no_next_step => penalty 40, health 60 (attention) when the rest is known', () => {
  const ev = evaluateDeal(healthy({ activities: [{ id: 'a1', type: 'email', occurred_at: day(30), status: 'sent' }] }))
  assert.equal(rule(ev, 'inactivity').status, 'triggered')
  assert.equal(rule(ev, 'no_next_step').status, 'triggered')
  assert.equal(ev.results.reduce((s, r) => s + r.penalty, 0), 40)
  assert.equal(ev.health, 60); assert.equal(ev.band, 'attention'); assert.equal(ev.coverage, 1)
})

test('fixture: all rules unknown -> health null, no eligibility', () => {
  const ev = evaluateDeal({
    as_of: AS_OF, timezone: 'UTC',
    deal: { id: 'd', amount: null, currency: null, is_open: true, archived: false, stage: { external_id: 'x', category: 'unmapped', is_closed: false }, owner_state: 'unknown', close_at: null, created_at: null, stage_entered_at: null, contact_count: null },
    activities: [], coverage: { activities: 'denied', history_since_creation: false }, stage_stats: null,
  })
  assert.ok(ev.results.every(r => r.status === 'unknown'))
  assert.equal(ev.health, null); assert.equal(ev.coverage, 0); assert.equal(ev.eligible, false); assert.equal(ev.band, 'not_evaluable')
})

test('inaccessible next-step data is unknown, not confirmed absence', () => {
  const ev = evaluateDeal(healthy({ activities: [], coverage: { activities: 'denied' } }))
  assert.equal(rule(ev, 'no_next_step').status, 'unknown')
  assert.equal(rule(ev, 'inactivity').status, 'unknown')
  assert.equal(rule(ev, 'inactivity').reason, 'activity_permission_denied')
})

test('inactivity boundary: exactly 14 days clear, 14d+1ms triggered', () => {
  const exact = new Date(Date.parse(AS_OF) - 14 * 86400000).toISOString()
  const over = new Date(Date.parse(AS_OF) - 14 * 86400000 - 1).toISOString()
  assert.equal(rule(evaluateDeal(healthy({ activities: [{ id: 'a', type: 'call', occurred_at: exact, status: 'completed' }] })), 'inactivity').status, 'clear')
  assert.equal(rule(evaluateDeal(healthy({ activities: [{ id: 'a', type: 'call', occurred_at: over, status: 'completed' }] })), 'inactivity').status, 'triggered')
})

test('inactivity ignores notes, tasks, system updates and cancelled meetings', () => {
  const acts = [
    { id: 'n', type: 'note', occurred_at: day(1) }, { id: 't', type: 'task', occurred_at: day(1) },
    { id: 's', type: 'email', occurred_at: day(1), is_system: true }, { id: 'c', type: 'meeting', occurred_at: day(1), status: 'CANCELLED' },
    { id: 'old', type: 'call', occurred_at: day(40), status: 'completed' },
  ]
  assert.equal(rule(evaluateDeal(healthy({ activities: acts })), 'inactivity').status, 'triggered')
})

test('inactivity: partial coverage + stale evidence => unknown; partial + recent => clear', () => {
  assert.equal(rule(evaluateDeal(healthy({ coverage: { activities: 'partial' }, activities: [{ id: 'o', type: 'call', occurred_at: day(40), status: 'completed' }] })), 'inactivity').status, 'unknown')
  assert.equal(rule(evaluateDeal(healthy({ coverage: { activities: 'partial' }, activities: [{ id: 'o', type: 'call', occurred_at: day(1), status: 'completed' }] })), 'inactivity').status, 'clear')
})

test('inactivity with no activity: uses deal age only when history is complete', () => {
  const none = { activities: [] }
  assert.equal(rule(evaluateDeal(healthy({ ...none })), 'inactivity').status, 'triggered') // created 60d ago, complete history
  assert.equal(rule(evaluateDeal(healthy({ ...none, coverage: { history_since_creation: false } })), 'inactivity').status, 'unknown')
  assert.equal(rule(evaluateDeal(healthy({ ...none, deal: { created_at: day(3) } })), 'inactivity').status, 'clear')
})

test('no_next_step: only late stage; unmapped stage is unknown; completed/past tasks do not count', () => {
  assert.equal(rule(evaluateDeal(healthy({ deal: { stage: { external_id: 'e', category: 'early', is_closed: false } } })), 'no_next_step').status, 'not_applicable')
  assert.equal(rule(evaluateDeal(healthy({ deal: { stage: { external_id: 'e', category: 'unmapped', is_closed: false } } })), 'no_next_step').status, 'unknown')
  const acts = [{ id: 'x', type: 'task', due_at: future(2), status: 'COMPLETED' }, { id: 'y', type: 'task', due_at: day(2), status: 'not_started' }, { id: 'r', type: 'email', occurred_at: day(1), status: 'sent' }]
  assert.equal(rule(evaluateDeal(healthy({ activities: acts })), 'no_next_step').status, 'triggered')
  assert.equal(rule(evaluateDeal(healthy({ activities: [{ id: 'm', type: 'meeting', due_at: future(1), status: 'scheduled' }, ...acts.slice(2)] })), 'no_next_step').status, 'clear')
})

test('stalled_stage: 1.5x median with enough sample; boundary exact; small sample -> unknown or manual', () => {
  const st = (days, stats) => healthy({ deal: { stage_entered_at: day(days) }, stage_stats: stats })
  assert.equal(rule(evaluateDeal(st(15, { sample_size: 20, median_days: 10 })), 'stalled_stage').status, 'clear')     // exactly 1.5x
  assert.equal(rule(evaluateDeal(st(15.01, { sample_size: 20, median_days: 10 })), 'stalled_stage').status, 'triggered')
  const small = rule(evaluateDeal(st(100, { sample_size: 19, median_days: 10 })), 'stalled_stage')
  assert.equal(small.status, 'unknown'); assert.equal(small.reason, 'insufficient_history_and_no_manual_threshold')
  const manual = evaluateDeal(st(100, { sample_size: 3, median_days: 10 }), { thresholds: { manual_stage_days: { late1: 45 } } })
  assert.equal(rule(manual, 'stalled_stage').status, 'triggered'); assert.equal(rule(manual, 'stalled_stage').evidence_refs[0].source, 'manual')
  assert.equal(rule(evaluateDeal(healthy({ deal: { stage_entered_at: null } })), 'stalled_stage').status, 'unknown') // no history: never derived from created_at
})

test('overdue_close: local day in org timezone; UTC-midnight date-picker values keep their calendar date', () => {
  const asOf = '2026-09-28T03:00:00Z' // still Sep 27 in Mexico City (UTC-6)
  const mx = (close) => healthy({ deal: { close_at: close } }) && { ...healthy({ deal: { close_at: close } }), as_of: asOf, timezone: 'America/Mexico_City' }
  assert.equal(rule(evaluateDeal(mx('2026-09-27T00:00:00Z')), 'overdue_close').status, 'clear')    // due "today" locally
  assert.equal(rule(evaluateDeal(mx('2026-09-26T00:00:00Z')), 'overdue_close').status, 'triggered')
  assert.equal(closeLocalDate(Date.parse('2026-09-27T00:00:00Z'), 'America/Mexico_City'), '2026-09-27') // not shifted to the 26th
  assert.equal(closeLocalDate(Date.parse('2026-09-27T20:30:00Z'), 'America/Mexico_City'), '2026-09-27')
  const utc = { ...healthy({ deal: { close_at: '2026-09-28T00:00:00Z' } }) }
  assert.equal(rule(evaluateDeal(utc), 'overdue_close').status, 'clear') // today
  assert.equal(rule(evaluateDeal(healthy({ deal: { close_at: null } })), 'overdue_close').status, 'unknown')
  assert.equal(rule(evaluateDeal(healthy({ deal: { close_at: null, field_states: { close_at: 'empty' } } })), 'overdue_close').status, 'not_applicable')
})

test('single_contact: threshold per currency, exact decimal, null/0 amounts, unknown associations', () => {
  const sc = (d) => rule(evaluateDeal(healthy({ deal: d })), 'single_contact')
  assert.equal(sc({ contact_count: 1 }).status, 'triggered')
  assert.equal(sc({ contact_count: 2 }).status, 'clear')
  assert.equal(sc({ contact_count: 1, amount: '20000' }).status, 'not_applicable')       // not strictly above
  assert.equal(sc({ contact_count: 1, amount: '20000.01' }).status, 'triggered')
  assert.equal(sc({ contact_count: 1, amount: '0' }).status, 'not_applicable')
  assert.equal(sc({ contact_count: 1, amount: null }).status, 'unknown')                  // null is not zero
  assert.equal(sc({ contact_count: 1, currency: 'EUR' }).reason, 'no_threshold_for_currency')
  assert.equal(sc({ contact_count: null }).status, 'unknown')
})

test('missing_owner: empty, archived owner, unknown', () => {
  const mo = d => rule(evaluateDeal(healthy({ deal: d })), 'missing_owner')
  assert.equal(mo({ owner_state: 'empty' }).status, 'triggered')
  assert.equal(mo({ owner_state: 'value', owner_archived: true }).status, 'triggered')
  assert.equal(mo({ owner_state: 'value' }).status, 'clear')
  assert.equal(mo({ owner_state: 'unknown' }).status, 'unknown')
})

test('closed / archived / unknown-open deals are not evaluated', () => {
  for (const d of [{ archived: true }, { is_open: false }, { stage: { external_id: 'w', category: 'closed', is_closed: true } }]) {
    const ev = evaluateDeal(healthy({ deal: d }))
    assert.equal(ev.health, null); assert.equal(ev.eligible, false); assert.equal(ev.band, 'not_applicable')
  }
})

test('coverage < 80% => provisional, never labelled healthy, excluded from the aggregate', () => {
  // unknown: stalled(20) + single_contact(15) => known 65/100
  const ev = evaluateDeal(healthy({ stage_stats: null, deal: { contact_count: null } }))
  assert.equal(ev.coverage, 0.65); assert.equal(ev.provisional, true); assert.equal(ev.band, 'provisional'); assert.equal(ev.eligible, false)
  assert.equal(ev.health, 100)
})

test('not_applicable rules leave the coverage denominator', () => {
  const ev = evaluateDeal(healthy({ deal: { stage: { external_id: 'e', category: 'early', is_closed: false } } })) // no_next_step n/a
  assert.equal(rule(ev, 'no_next_step').status, 'not_applicable'); assert.equal(ev.coverage, 1)
})

test('determinism: same input + ruleset => identical output; as_of is mandatory; input order irrelevant', () => {
  const a = evaluateDeal(healthy()), b = evaluateDeal(healthy())
  assert.deepEqual(a, b)
  const i = healthy(); i.activities = [...i.activities].reverse()
  assert.equal(evaluateDeal(i).input_hash, a.input_hash)
  assert.throws(() => evaluateDeal({ ...healthy(), as_of: undefined }), /as_of/)
  assert.notEqual(evaluateDeal(healthy(), { thresholds: { inactivity_days: 3 } }).input_hash, a.input_hash) // rules version changes the hash
})

// ── aggregate ───────────────────────────────────────────────────────────────
const D = (id, health, extra = {}) => ({ id, amount: '1000.10', currency: 'USD', is_open: true, evaluation: { band: health < 60 ? 'high_risk' : 'healthy', eligible: true, provisional: false, health, coverage: 1 }, ...extra })

test('aggregate: empty set -> null score; only eligible deals count; exact money; currencies never mixed', () => {
  assert.equal(aggregate([]).score, null)
  const res = aggregate([
    D('a', 100), D('b', 50), D('c', 40, { amount: '0.20' }), D('d', 40, { currency: 'EUR', amount: '5' }),
    D('p', 10, { evaluation: { band: 'provisional', eligible: false, provisional: true, health: 10, coverage: 0.5 } }),
    D('n', null, { amount: null, evaluation: { band: 'not_evaluable', eligible: false, provisional: false, health: null, coverage: 0 } }),
    { id: 'closed', amount: '999', currency: 'USD', is_open: false, evaluation: { band: 'not_applicable', eligible: false, health: null, coverage: null } },
  ])
  assert.equal(res.eligible_count, 4); assert.equal(res.total_open_count, 6)
  assert.equal(res.score, 57.5) // (100+50+40+40)/4
  const usd = res.by_currency.find(c => c.currency === 'USD'), eur = res.by_currency.find(c => c.currency === 'EUR')
  assert.equal(usd.at_risk_amount, '1000.3')          // 1000.10 + 0.20 — exact, no float drift
  assert.equal(usd.at_risk_deal_count, 2)
  assert.equal(usd.provisional_at_risk_amount, '1000.1'); assert.equal(usd.provisional_at_risk_deal_count, 1)
  assert.equal(usd.unknown_amount_count, 1)
  assert.equal(eur.at_risk_amount, '5')
  assert.equal(res.exclusions.provisional, 1); assert.equal(res.exclusions.not_evaluable, 1)
})

test('aggregate: a deal is counted once even if duplicated / has many findings', () => {
  const res = aggregate([D('a', 20), D('a', 20)])
  assert.equal(res.by_currency[0].at_risk_deal_count, 1)
})

test('decimal helpers', () => {
  assert.equal(sumDecimals(['0.1', '0.2', null, 'x']).sum, '0.3')
  assert.equal(sumDecimals(['0.1', '0.2', null, 'x']).unknown, 2)
  assert.equal(cmpDecimal('20000.000001', '20000'), 1)
  assert.equal(parseDecimal('1e3'), null)
})

// ── findings ────────────────────────────────────────────────────────────────
test('findings: opened for triggered rules; resolved only on confirmed clear/n-a; unknown and failed sync never resolve', () => {
  const trig = evaluateDeal(healthy({ activities: [] , deal: { contact_count: 1 } }))
  const opened = reconcile({ existing: [], evaluation: trig, rulesVersion: 1, syncOk: true, now: AS_OF })
  const keys = opened.upserts.map(u => u.rule_key)
  assert.ok(keys.includes('inactivity') && keys.includes('no_next_step') && keys.includes('single_contact'))
  const existing = opened.upserts.map((u, i) => ({ id: 'f' + i, ...u, status: 'open' }))

  const nowClear = evaluateDeal(healthy())
  const r1 = reconcile({ existing, evaluation: nowClear, rulesVersion: 1, syncOk: true, now: AS_OF })
  assert.deepEqual(r1.resolves.sort(), ['inactivity', 'no_next_step', 'single_contact'].sort())

  assert.deepEqual(reconcile({ existing, evaluation: nowClear, rulesVersion: 1, syncOk: false, now: AS_OF }).resolves, [])   // failed sync

  const nowUnknown = evaluateDeal(healthy({ activities: [], coverage: { activities: 'denied' } }))
  assert.equal(reconcile({ existing, evaluation: nowUnknown, rulesVersion: 1, syncOk: true, now: AS_OF }).resolves.includes('inactivity'), false)
})

test('findings: first_seen preserved while still open; dismiss/snooze are display-only', () => {
  const ev = evaluateDeal(healthy({ activities: [] }))
  const ex = [{ rule_key: 'inactivity', status: 'open', first_seen_at: '2026-01-01T00:00:00Z' }]
  const out = reconcile({ existing: ex, evaluation: ev, rulesVersion: 1, syncOk: true, now: AS_OF })
  assert.equal(out.upserts.find(u => u.rule_key === 'inactivity').first_seen_at, '2026-01-01T00:00:00Z')
  assert.equal(isSuppressed({ state: 'dismissed' }, AS_OF), true)
  assert.equal(isSuppressed({ state: 'snoozed', until: future(2) }, AS_OF), true)
  assert.equal(isSuppressed({ state: 'snoozed', until: day(1) }, AS_OF), false)
  // evaluation & aggregate are unaffected by preferences (they never see them)
  assert.equal(findingsFromEvaluation(ev, 1).length > 0, true)
})

// ── stage stats ─────────────────────────────────────────────────────────────
test('stage stats: only completed intervals inside the window; open ages never used', () => {
  const h = []
  for (let i = 0; i < 4; i++) {
    h.push({ deal_id: 'd' + i, stage_external_id: 'a', effective_at: day(50) })
    h.push({ deal_id: 'd' + i, stage_external_id: 'b', effective_at: day(50 - (i + 1) * 2) }) // durations 2,4,6,8 in 'a'
  }
  h.push({ deal_id: 'open', stage_external_id: 'a', effective_at: day(170) }) // still open in 'a': no completed interval
  h.push({ deal_id: 'old', stage_external_id: 'a', effective_at: day(400) }, { deal_id: 'old', stage_external_id: 'b', effective_at: day(390) }) // outside window
  const s = computeStageStats(h, { asOf: AS_OF, windowDays: 180 }).get('a')
  assert.equal(s.sample_size, 4); assert.equal(s.median_days, 5)
})

test('review regression: a threshold crossed later the same day yields a different evaluation hash (no stale row reuse)', () => {
  const lastTouch = '2026-09-14T15:00:00Z'                                    // exactly 14 days before 2026-09-28T15:00
  const at = asOf => evaluateDeal({ ...healthy({ activities: [{ id: 'a', type: 'call', occurred_at: lastTouch, status: 'completed' }] }), as_of: asOf })
  const morning = at('2026-09-28T10:00:00Z'), afternoon = at('2026-09-28T16:00:00Z')
  assert.equal(rule(morning, 'inactivity').status, 'clear')
  assert.equal(rule(afternoon, 'inactivity').status, 'triggered')
  assert.notEqual(morning.input_hash, afternoon.input_hash)
  // ...while two runs with identical inputs and identical outcomes (same whole day count) do dedupe
  const a = at('2026-09-27T16:00:00Z'), b = at('2026-09-27T17:30:00Z')
  assert.equal(a.input_hash, b.input_hash)
})
