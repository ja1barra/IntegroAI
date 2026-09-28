// Historical stage-duration statistics from real property history only.
// Open deals' current ages are NEVER used to estimate a benchmark.

import { DAY_MS, toMs } from './time.js'

/**
 * history: [{ deal_id, stage_external_id, effective_at }]  (dealstage changes, any order)
 * dealIsClosedAt: optional map deal_id -> ms of closure, to close the final interval
 * Returns Map<stage_external_id, { sample_size, median_days }> using only COMPLETED
 * intervals (stage left) that ended within the window ending at asOf.
 */
export function computeStageStats(history, { asOf, windowDays = 180 }) {
  const asOfMs = toMs(asOf), from = asOfMs - windowDays * DAY_MS
  const byDeal = new Map()
  for (const h of history) {
    const t = toMs(h.effective_at)
    if (t === null) continue
    if (!byDeal.has(h.deal_id)) byDeal.set(h.deal_id, [])
    byDeal.get(h.deal_id).push({ stage: h.stage_external_id, t })
  }
  const durations = new Map()
  for (const rows of byDeal.values()) {
    rows.sort((a, b) => a.t - b.t)
    for (let i = 0; i < rows.length - 1; i++) {
      const end = rows[i + 1].t
      if (end > asOfMs || end < from || rows[i].stage === rows[i + 1].stage) continue
      const d = (end - rows[i].t) / DAY_MS
      if (!durations.has(rows[i].stage)) durations.set(rows[i].stage, [])
      durations.get(rows[i].stage).push(d)
    }
  }
  const out = new Map()
  for (const [stage, ds] of durations) {
    ds.sort((a, b) => a - b)
    const mid = Math.floor(ds.length / 2)
    out.set(stage, { sample_size: ds.length, median_days: ds.length % 2 ? ds[mid] : (ds[mid - 1] + ds[mid]) / 2 })
  }
  return out
}
