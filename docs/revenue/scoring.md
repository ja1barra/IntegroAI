# Scoring methodology (versioned, deterministic, explainable)

The rule values below are **proposed starting points, not validated benchmarks.** They are stored per organization as immutable
`revenue_rule_sets` versions; changing them creates a new version and snapshots from different versions are **not** directly comparable.
Code: `api/_lib/rules/*` (engine v`1.0.0`). Tests: `test/rules/engine.test.js`.

## Rule result
`{ rule_key, status: triggered|clear|unknown|not_applicable, severity, penalty, evidence_refs, observed_value, threshold, reason }`.
`unknown` = insufficient coverage (never null→0, never permission-denied→"no activity"). `clear` requires sufficient evidence.

| Rule (weight) | Triggered when | Notes |
|---|---|---|
| `inactivity` (20) | last valid commercial activity is **> 14 days** before `as_of` | Valid = email/call/meeting, not system, not cancelled/no-show/failed, not merely "scheduled". Notes/tasks excluded. Old evidence only triggers when activity coverage is complete (partial ⇒ unknown; a recent activity ⇒ clear even if partial). No activity at all: deal age is used **only** if history since creation is complete, else unknown |
| `no_next_step` (20) | **late-stage** (org-confirmed mapping) and no open task with future due date and no future meeting | Unmapped stage ⇒ unknown; non-late ⇒ not_applicable. "Next step" means *recorded*, not inferred from notes |
| `stalled_stage` (20) | days in current stage **> 1.5 × median** completed-interval duration of that pipeline+stage (window 180 d, **≥20 samples**) | Below the sample threshold: a manual per-stage threshold if configured (labelled `manual`), else unknown. Open deals' current ages never form the benchmark. Stage entry unknown ⇒ unknown |
| `overdue_close` (15) | open and close date **before today in the org timezone** | HubSpot date-picker values (00:00:00Z) keep their calendar date instead of shifting in western timezones. No close date: unknown (or not_applicable if known-empty) |
| `single_contact` (15) | amount **strictly above** the per-currency minimum (USD 20,000 default) and **exactly one** associated contact | Proxy for single-threading, not proof. Other currencies need an explicit threshold (no conversion) ⇒ unknown otherwise. Amount null ⇒ unknown; 0 ⇒ not applicable |
| `missing_owner` (10) | owner known-empty, or owner archived/removed | |
| `data_quality` (0, informational) | amount / close date / owner known-empty, or unmapped stage | Never affects Health or coverage |

## Deal Health, coverage, bands
* `Health = clamp(100 − Σ penalties of triggered rules, 0, 100)`.
* `Coverage = Σ weights of triggered+clear rules ÷ Σ weights of applicable rules` (`unknown` stays in the denominator, `not_applicable` leaves it).
* No applicable/evaluable rules ⇒ **Health = null**.
* Coverage < 80 % ⇒ **provisional**: no "healthy" label, excluded from the aggregate score.
* Bands (eligible only): 80–100 healthy · 60–79 needs attention · < 60 high risk.
* Worked example (tested): inactivity + no_next_step triggered, everything else known ⇒ penalty 40 ⇒ Health **60**, coverage 100 %, band *attention*. All rules unknown ⇒ Health **null**.
* Closed-won/lost and archived deals never participate; "closed" comes from stage metadata / mapping, never from label text.

## Revenue Score and money KPIs
* `Revenue Score` = simple mean of Health of **eligible open deals** in the current filters; empty set ⇒ **null**. Shown with `eligible/total_open`, average coverage and exclusions. It is **not** a win probability, forecast or ARR.
* `Amount at risk` = Σ known amounts of eligible deals with Health < 60, **unique per deal, per currency, exact decimals**. Provisional high-risk deals are reported separately ("risk detected with incomplete data"); deals without an amount are counted, not treated as 0. Currencies are never added together.
* Overview, Findings and Deals all read the same snapshot (id + `as_of` + rules version) and share filters.

## Findings lifecycle
Created/kept open while triggered; **resolved (history kept) when the deal closes, is archived or leaves the analyzed pipelines**; resolved **only** when new evidence says `clear`/`not_applicable`; `unknown` and failed/partial syncs never resolve anything. Dismiss/snooze are stored separately (`revenue_finding_preferences`, reason required) and only hide the finding: evidence and score are unchanged (tested).

## Known limits
Weights and thresholds are unvalidated heuristics. Coverage/`unknown` handling deliberately makes the score more conservative than a naive one. Stage benchmarks need ≥20 completed intervals per pipeline+stage within 180 days.
