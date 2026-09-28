// Versioned defaults. These are *proposed starting points*, not validated
// benchmarks (see docs/revenue/scoring.md). An org's active revenue_rule_sets
// row overrides them; rule sets are immutable, so changing thresholds means
// publishing a new version.

export const ENGINE_VERSION = '1.0.0'

export const RULE_KEYS = ['inactivity', 'no_next_step', 'stalled_stage', 'overdue_close', 'single_contact', 'missing_owner']

export const DEFAULT_RULESET = Object.freeze({
  engine_version: ENGINE_VERSION,
  weights: { inactivity: 20, no_next_step: 20, stalled_stage: 20, overdue_close: 15, single_contact: 15, missing_owner: 10 },
  thresholds: {
    inactivity_days: 14,
    stalled_multiplier: 1.5,
    stalled_min_samples: 20,
    stalled_window_days: 180,
    // Per-currency, no implicit conversion. USD only until an admin sets more.
    single_contact_min_amount: { USD: '20000' },
    // stage external_id -> days; used only when historical sample is too small.
    manual_stage_days: {},
  },
  min_coverage: 0.8,
  bands: { healthy_min: 80, attention_min: 60 },
  valid_activity_types: ['email', 'call', 'meeting'],
  // never count (neither as a past touch nor as a future next step)
  invalid_activity_statuses: ['cancelled', 'canceled', 'no_show', 'noshow', 'failed', 'bounced'],
  // did not actually happen yet: not a past touch, but valid as a future next step
  pending_activity_statuses: ['scheduled', 'rescheduled'],
  severity: { inactivity: 'high', no_next_step: 'high', stalled_stage: 'medium', overdue_close: 'medium', single_contact: 'medium', missing_owner: 'low' },
})

export function mergeRuleset(override) {
  const o = override ?? {}
  return {
    ...DEFAULT_RULESET,
    ...o,
    weights: { ...DEFAULT_RULESET.weights, ...(o.weights ?? {}) },
    thresholds: {
      ...DEFAULT_RULESET.thresholds,
      ...(o.thresholds ?? {}),
      single_contact_min_amount: { ...(o.thresholds?.single_contact_min_amount ?? DEFAULT_RULESET.thresholds.single_contact_min_amount) },
      manual_stage_days: { ...(o.thresholds?.manual_stage_days ?? {}) },
    },
    bands: { ...DEFAULT_RULESET.bands, ...(o.bands ?? {}) },
    severity: { ...DEFAULT_RULESET.severity, ...(o.severity ?? {}) },
  }
}
