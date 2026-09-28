// Aggregation of per-deal evaluations into Revenue Score and money KPIs.
// Money is summed exactly and never across currencies; a deal is counted once.

import { parseDecimal, formatDecimal } from './decimal.js'

const key = c => c ?? 'UNKNOWN'

/**
 * deals: [{ id, amount, currency, is_open, evaluation }]  (evaluation from evaluateDeal)
 * -> { score, eligible_count, total_open_count, avg_coverage, exclusions, by_currency, ... }
 */
export function aggregate(deals) {
  const open = deals.filter(d => d.is_open && d.evaluation && d.evaluation.band !== 'not_applicable')
  const eligible = open.filter(d => d.evaluation.eligible && d.evaluation.health !== null)
  const score = eligible.length ? Math.round((eligible.reduce((s, d) => s + d.evaluation.health, 0) / eligible.length) * 100) / 100 : null
  const avgCoverage = open.filter(d => d.evaluation.coverage !== null).length
    ? Math.round((open.reduce((s, d) => s + (d.evaluation.coverage ?? 0), 0) / open.filter(d => d.evaluation.coverage !== null).length) * 10000) / 10000
    : null

  const by = {}
  const bucket = c => (by[key(c)] ??= { currency: c ?? null, open_pipeline: 0n, open_count: 0, unknown_amount_count: 0, at_risk: 0n, at_risk_count: 0, provisional_at_risk: 0n, provisional_at_risk_count: 0 })
  const seen = new Set()
  for (const d of open) {
    if (seen.has(d.id)) continue // a deal contributes once, however many findings it has
    seen.add(d.id)
    const b = bucket(d.currency)
    const amt = parseDecimal(d.amount)
    b.open_count++
    if (amt === null) b.unknown_amount_count++
    else b.open_pipeline += amt
    const high = d.evaluation.health !== null && d.evaluation.health < 60
    if (d.evaluation.eligible && high) { b.at_risk_count++; if (amt !== null) b.at_risk += amt }
    else if (d.evaluation.provisional && high) { b.provisional_at_risk_count++; if (amt !== null) b.provisional_at_risk += amt }
  }
  const by_currency = Object.values(by).map(b => ({
    currency: b.currency, open_count: b.open_count, unknown_amount_count: b.unknown_amount_count,
    open_pipeline: formatDecimal(b.open_pipeline),
    at_risk_amount: formatDecimal(b.at_risk), at_risk_deal_count: b.at_risk_count,
    provisional_at_risk_amount: formatDecimal(b.provisional_at_risk), provisional_at_risk_deal_count: b.provisional_at_risk_count,
  })).sort((a, b) => String(a.currency).localeCompare(String(b.currency)))

  return {
    score,
    eligible_count: eligible.length,
    total_open_count: open.length,
    avg_coverage: avgCoverage,
    exclusions: {
      provisional: open.filter(d => d.evaluation.provisional).length,
      not_evaluable: open.filter(d => d.evaluation.band === 'not_evaluable').length,
    },
    by_currency,
  }
}
