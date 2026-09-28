// Onboarding + rules configuration (admin only).

import { badRequest } from '../http.js'
import { requireCan } from '../auth.js'
import { suggestCategories } from '../hubspot/mapping.js'
import { getActiveRuleset } from './evaluate.js'
import { mergeRuleset, ENGINE_VERSION } from '../rules/defaults.js'
import { enqueue } from '../jobs.js'

const CATEGORIES = ['early', 'mid', 'late']

export async function getOnboarding({ store, orgId }) {
  const [settings] = await store.select('revenue_settings', { where: { organization_id: orgId } })
  const [org] = await store.select('organizations', { where: { id: orgId } })
  const pipelines = await store.select('crm_pipelines', { where: { organization_id: orgId }, columns: 'id,external_id,label,display_order', order: 'display_order.asc' })
  const stages = await store.select('crm_stages', { where: { organization_id: orgId }, columns: 'id,external_id,pipeline_id,label,display_order,is_closed,category,category_source', order: 'display_order.asc' })
  return {
    state: settings?.onboarding_state ?? 'not_started',
    settings: { selected_pipeline_ids: settings?.selected_pipeline_ids ?? [], timezone: settings?.timezone ?? org?.timezone ?? 'UTC', currency: settings?.currency ?? null, brief_cadence: settings?.brief_cadence ?? 'weekly' },
    pipelines: pipelines.map(p => {
      const ps = stages.filter(s => s.pipeline_id === p.id).map(s => ({ external_id: s.external_id, label: s.label, display_order: s.display_order, is_closed: s.is_closed, category: s.category, category_source: s.category_source }))
      const sug = suggestCategories(ps)
      return { external_id: p.external_id, label: p.label, stages: ps.map(s => ({ ...s, suggested_category: s.is_closed === true ? 'closed' : sug[s.external_id] ?? null })) }
    }),
  }
}

const validTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }

export async function saveOnboarding({ store, ctx, body, requestId }) {
  requireCan(ctx, 'manage_rules')
  const orgId = ctx.orgId
  const patch = {}
  const pipelines = await store.select('crm_pipelines', { where: { organization_id: orgId }, columns: 'id,external_id' })
  if (body.selected_pipeline_ids !== undefined) {
    if (!Array.isArray(body.selected_pipeline_ids) || body.selected_pipeline_ids.length > 10) throw badRequest('selected_pipeline_ids must be a short list')
    const known = new Set(pipelines.map(p => p.external_id))
    for (const id of body.selected_pipeline_ids) if (!known.has(String(id))) throw badRequest(`Unknown pipeline ${String(id).slice(0, 40)}`)
    patch.selected_pipeline_ids = body.selected_pipeline_ids.map(String)
  }
  if (body.timezone !== undefined) { if (!validTz(String(body.timezone))) throw badRequest('Invalid IANA timezone'); patch.timezone = String(body.timezone) }
  if (body.currency !== undefined) { if (!/^[A-Z]{3}$/.test(String(body.currency))) throw badRequest('currency must be an ISO 4217 code'); patch.currency = String(body.currency) }
  if (body.brief_cadence !== undefined) { if (!['daily', 'weekly'].includes(body.brief_cadence)) throw badRequest('brief_cadence must be daily or weekly'); patch.brief_cadence = body.brief_cadence }
  if (body.stage_categories !== undefined) {
    const stages = await store.select('crm_stages', { where: { organization_id: orgId }, columns: 'external_id,is_closed' })
    const open = new Map(stages.filter(s => s.is_closed !== true).map(s => [s.external_id, s]))
    for (const [ext, cat] of Object.entries(body.stage_categories ?? {})) {
      if (!open.has(ext)) throw badRequest(`Stage ${ext.slice(0, 40)} is unknown or closed (closed stages come from HubSpot metadata)`)
      if (!CATEGORIES.includes(cat)) throw badRequest('category must be early, mid or late')
    }
    for (const [ext, cat] of Object.entries(body.stage_categories ?? {})) await store.update('crm_stages', { organization_id: orgId, external_id: ext }, { category: cat, category_source: 'admin' })
  }
  // state machine
  const [cur] = await store.select('revenue_settings', { where: { organization_id: orgId } })
  const merged = { ...cur, ...patch }
  let state = cur?.onboarding_state ?? 'not_started'
  if (state !== 'not_started') {
    const stagesNow = await store.select('crm_stages', { where: { organization_id: orgId }, columns: 'pipeline_id,is_closed,category' })
    const selPipes = new Set(pipelines.filter(p => (merged.selected_pipeline_ids ?? []).includes(p.external_id)).map(p => p.id))
    const openStages = stagesNow.filter(s => selPipes.has(s.pipeline_id) && s.is_closed !== true)
    if (selPipes.size) state = 'pipeline_selected'
    if (selPipes.size && openStages.length && openStages.every(s => s.category !== 'unmapped')) state = 'stages_mapped'
    if (state === 'stages_mapped' && body.confirm === true && merged.currency && merged.timezone) state = 'confirmed'
    if (cur?.onboarding_state === 'synced' && state === 'confirmed') state = 'synced'
  }
  patch.onboarding_state = state
  await store.update('revenue_settings', { organization_id: orgId }, patch)
  await store.rpc('rv_audit', { _org: orgId, _actor_type: 'user', _actor: ctx.userId, _event: 'onboarding.saved', _entity_type: 'revenue_settings', _entity_id: orgId, _before: null, _after: { ...patch, stage_categories: body.stage_categories ?? undefined }, _request_id: requestId ?? null })
  return { state }
}

export async function publishRuleset({ store, ctx, body, requestId }) {
  requireCan(ctx, 'manage_rules')
  const t = body?.thresholds ?? {}, w = body?.weights ?? {}
  const num = (v, min, max, name) => { if (v === undefined) return undefined; const n = Number(v); if (!Number.isFinite(n) || n < min || n > max) throw badRequest(`${name} out of range`); return n }
  const cfg = { thresholds: {}, weights: {} }
  const days = num(t.inactivity_days, 1, 365, 'inactivity_days'); if (days !== undefined) cfg.thresholds.inactivity_days = days
  const mult = num(t.stalled_multiplier, 1, 10, 'stalled_multiplier'); if (mult !== undefined) cfg.thresholds.stalled_multiplier = mult
  if (t.single_contact_min_amount !== undefined) {
    for (const [cur, amt] of Object.entries(t.single_contact_min_amount)) if (!/^[A-Z]{3}$/.test(cur) || !/^\d+(\.\d+)?$/.test(String(amt))) throw badRequest('single_contact_min_amount must map ISO currency -> decimal string')
    cfg.thresholds.single_contact_min_amount = Object.fromEntries(Object.entries(t.single_contact_min_amount).map(([k, v]) => [k, String(v)]))
  }
  if (t.manual_stage_days !== undefined) { for (const [k, v] of Object.entries(t.manual_stage_days)) if (!(Number(v) > 0)) throw badRequest(`manual_stage_days.${k} must be > 0`); cfg.thresholds.manual_stage_days = Object.fromEntries(Object.entries(t.manual_stage_days).map(([k, v]) => [k, Number(v)])) }
  for (const [k, v] of Object.entries(w)) { const n = num(v, 0, 100, `weights.${k}`); if (!(k in mergeRuleset({}).weights)) throw badRequest(`Unknown rule ${k}`); cfg.weights[k] = n }
  const cur = await getActiveRuleset(store, ctx.orgId)
  const next = cur.version + 1
  const config = mergeRuleset({ ...cur.ruleset, thresholds: { ...cur.ruleset.thresholds, ...cfg.thresholds }, weights: { ...cur.ruleset.weights, ...cfg.weights } })
  await store.insert('revenue_rule_sets', [{ organization_id: ctx.orgId, version: next, engine_version: ENGINE_VERSION, config, created_by: ctx.userId }])
  await store.rpc('rv_audit', { _org: ctx.orgId, _actor_type: 'user', _actor: ctx.userId, _event: 'rules.published', _entity_type: 'rule_set', _entity_id: String(next), _before: { version: cur.version }, _after: { version: next, thresholds: cfg.thresholds, weights: cfg.weights }, _request_id: requestId ?? null })
  await enqueue(store, { orgId: ctx.orgId, kind: 'evaluate', payload: {}, dedupe: `evaluate:rules:${next}`, maxAttempts: 3, userId: ctx.userId })
  return { version: next, note: 'Snapshots computed under a previous rules version are not directly comparable with new ones.' }
}
