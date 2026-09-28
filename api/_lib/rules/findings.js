// Findings derivation and reconciliation (pure).

export const RULE_CATEGORY = {
  inactivity: 'inactivity', no_next_step: 'next_step', stalled_stage: 'stalled', overdue_close: 'close_date',
  single_contact: 'single_contact', missing_owner: 'owner', data_quality: 'data_quality',
}

export const RECOMMENDATION = {
  inactivity: 'Log or schedule a real touchpoint (call, email or meeting) with the buyer this week.',
  no_next_step: 'Create a dated next step (task or meeting) for this late-stage deal.',
  stalled_stage: 'Review why the deal has stayed in this stage longer than typical and agree the unblocker.',
  overdue_close: 'Update the close date to a realistic one, or move the deal to closed-lost if it is dead.',
  single_contact: 'Add and engage a second stakeholder (economic buyer / champion).',
  missing_owner: 'Assign an owner in HubSpot.',
  data_quality: 'Fill the missing fields in HubSpot so this deal can be evaluated.',
}

/** Desired findings from one evaluation (only triggered rules + data quality). */
export function findingsFromEvaluation(evaluation, rulesVersion) {
  const out = []
  for (const res of evaluation.results) {
    if (res.status !== 'triggered') continue
    out.push({
      deal_id: evaluation.deal_id, rule_key: res.rule_key, category: RULE_CATEGORY[res.rule_key], severity: res.severity ?? 'medium',
      rules_version: rulesVersion, recommendation: RECOMMENDATION[res.rule_key],
      evidence: { observed_value: res.observed_value, threshold: res.threshold, reason: res.reason, refs: res.evidence_refs, as_of: evaluation.as_of },
    })
  }
  if (evaluation.data_quality?.length) {
    out.push({
      deal_id: evaluation.deal_id, rule_key: 'data_quality', category: 'data_quality', severity: 'info', rules_version: rulesVersion,
      recommendation: RECOMMENDATION.data_quality, evidence: { issues: evaluation.data_quality, as_of: evaluation.as_of, refs: [] },
    })
  }
  return out
}

/**
 * Decide what to do with existing findings for a deal.
 *  - triggered now            -> open / keep open, refresh last_seen
 *  - clear or not_applicable  -> resolve
 *  - unknown                  -> untouched (no evidence to resolve)
 *  - sync not healthy         -> nothing is resolved
 * Preferences (dismiss/snooze) live elsewhere and never affect this.
 */
export function reconcile({ existing, evaluation, rulesVersion, syncOk, now }) {
  const desired = new Map(findingsFromEvaluation(evaluation, rulesVersion).map(f => [f.rule_key, f]))
  const byKey = new Map(existing.map(f => [f.rule_key, f]))
  const upserts = [], resolves = []
  for (const [k, f] of desired) {
    const cur = byKey.get(k)
    upserts.push({ ...f, status: 'open', last_seen_at: now, first_seen_at: cur && cur.status === 'open' ? cur.first_seen_at : now, resolved_at: null })
  }
  if (syncOk) {
    for (const cur of existing) {
      if (cur.status !== 'open' || desired.has(cur.rule_key)) continue
      if (cur.rule_key === 'data_quality') { resolves.push(cur.rule_key); continue }
      const res = evaluation.results.find(x => x.rule_key === cur.rule_key)
      if (res && (res.status === 'clear' || res.status === 'not_applicable')) resolves.push(cur.rule_key)
    }
  }
  return { upserts, resolves }
}

/** Effective visibility given user preferences (does not change the score). */
export function isSuppressed(pref, now) {
  if (!pref) return false
  if (pref.state === 'dismissed') return true
  if (pref.state === 'snoozed') return pref.until && new Date(pref.until).getTime() > new Date(now).getTime()
  return false
}
