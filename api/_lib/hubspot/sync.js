// Resumable HubSpot -> Supabase mirror sync.
//
// One sync run = ordered steps, each idempotent and checkpointed in
// revenue_sync_runs.counters.state, so a crash / 429 / time-budget yield resumes
// where it stopped. A page is persisted BEFORE its cursor advances. Nothing is
// ever deleted because it was absent from a page; archival is learned only from
// HubSpot's explicit archived listing.

import { insertChunked, selectAll } from '../store.js'
import { HubSpotForbidden } from './client.js'
import { HttpError } from '../http.js'
import {
  DEAL_BASE_PROPERTIES, ACTIVITY_TYPES, stageEnteredProp, normalizePipelines, normalizeOwner, normalizeDeal,
  normalizeContact, normalizeCompany, normalizeActivity, normalizeAssociationsV4, propertyHistoryRows,
} from './mapping.js'

const OVERLAP_MS = 5 * 60_000
const SEARCH_WINDOW_LIMIT = 9_800       // HubSpot Search returns at most 10,000 results per query
const CLOSED_DEAL_LOOKBACK_DAYS = 400   // closed deals older than this are not needed (stage stats use 180d)
const STEPS = ['metadata', 'deals', 'associations', 'activities', 'history', 'reconcile', 'finalize']
const conflictKey = 'organization_id,connection_id,external_id'

export class TimeBudgetExceeded extends Error { constructor() { super('time budget exhausted'); this.name = 'TimeBudgetExceeded' } }

export async function runSync({ store, client, orgId, connectionId, runId, deadline, now = () => Date.now(), log = () => {} }) {
  const scope = { organization_id: orgId, connection_id: connectionId }
  const [run] = await store.select('revenue_sync_runs', { where: { id: runId, organization_id: orgId } })
  if (!run) throw new Error('sync run not found')
  const [settings] = await store.select('revenue_settings', { where: { organization_id: orgId } })
  const selected = settings?.selected_pipeline_ids ?? []
  const state = run.counters?.state ?? { step: 'metadata' }
  const counters = { ...(run.counters ?? {}) }
  const warnings = [...(run.warnings ?? [])]
  const coverage = { ...(run.coverage ?? {}) }
  const startedAt = run.started_at ?? new Date(now()).toISOString()
  const checkTime = () => { if (now() > deadline) throw new TimeBudgetExceeded() }
  const bump = (k, n = 1) => { counters[k] = (counters[k] ?? 0) + n }
  let finalStatus = 'succeeded'
  const warn = w => { if (!warnings.includes(w)) warnings.push(w) }
  const save = (extra = {}) => store.update('revenue_sync_runs', { id: runId, organization_id: orgId }, {
    status: 'running', started_at: startedAt, counters: { ...counters, state }, coverage, warnings, ...extra,
  })
  const upsert = (table, rows, onConflict = conflictKey, opts = {}) => insertChunked(store, table, rows.map(r => ({ ...scope, ...r })), { onConflict, ...opts })
  // One malformed record must not fail a whole page (and then every retry): on a data error, isolate the bad rows,
  // skip only those and report them as a warning.
  const upsertSafe = async (table, rows, onConflict = conflictKey, label = table) => {
    try { return await upsert(table, rows, onConflict) } catch (e) {
      if (!(e instanceof HttpError) || e.code !== 'store_error') throw e
      for (const r of rows) {
        try { await upsert(table, [r], onConflict) } catch (e2) {
          if (!(e2 instanceof HttpError) || e2.code !== 'store_error') throw e2
          bump(`${label}_skipped`); warn(`${label}_skipped`); log('warn', 'sync.row_skipped', { table, external_id: r.external_id })
        }
      }
    }
  }

  await save()
  const full = run.kind === 'full'

  try {
    let idx = STEPS.indexOf(state.step)
    if (idx < 0) idx = 0
    for (; idx < STEPS.length; idx++) {
      state.step = STEPS[idx]
      checkTime()
      await ({ metadata, deals, associations, activities, history, reconcile, finalize })[STEPS[idx]]()
      if (STEPS[idx] !== 'finalize') await save()
    }
  } catch (e) {
    await save().catch(() => {})
    throw e
  }
  return { status: finalStatus }

  // ── steps ────────────────────────────────────────────────────────────────

  async function loadMaps() {
    const [pl, st, ow] = await Promise.all([
      selectAll(store, 'crm_pipelines', { where: scope, columns: 'id,external_id', order: 'id.asc' }),
      selectAll(store, 'crm_stages', { where: scope, columns: 'id,external_id,pipeline_id,is_closed,category', order: 'id.asc' }),
      selectAll(store, 'crm_owners', { where: scope, columns: 'id,external_id', order: 'id.asc' }),
    ])
    return {
      pipelineByExternal: new Map(pl.map(p => [p.external_id, p.id])),
      stageByExternal: new Map(st.map(s => [s.external_id, s])),
      ownerByExternal: new Map(ow.map(o => [o.external_id, o.id])),
      defaultCurrency: settings?.currency ?? null,
      stages: st,
    }
  }

  async function metadata() {
    try {
      const payload = await client.get('/crm/v3/pipelines/deals')
      const { pipelines, stages } = normalizePipelines(payload)
      await upsert('crm_pipelines', pipelines.map(p => ({ ...p, synced_at: new Date(now()).toISOString() })))
      const pipeIds = new Map((await store.select('crm_pipelines', { where: scope, columns: 'id,external_id' })).map(p => [p.external_id, p.id]))
      const toRow = s => { const { pipeline_external_id, ...rest } = s; return { ...rest, pipeline_id: pipeIds.get(pipeline_external_id), synced_at: new Date(now()).toISOString() } }
      // Closed stages get their category from HubSpot metadata; open stages keep
      // whatever the admin chose (their category column is simply not sent).
      await upsert('crm_stages', stages.filter(s => s.is_closed === true).map(s => ({ ...toRow(s), category: 'closed', category_source: 'metadata' })))
      await upsert('crm_stages', stages.filter(s => s.is_closed !== true).map(toRow))
      bump('pipelines', pipelines.length); bump('stages', stages.length)
    } catch (e) {
      if (e instanceof HubSpotForbidden) { coverage.metadata = 'denied'; throw Object.assign(new Error('Missing permission to read deal pipelines'), { fatal: true, code: 'metadata_denied' }) }
      throw e
    }
    for (const archived of [false, true]) {
      let after
      do {
        checkTime()
        const page = await client.get('/crm/v3/owners', { limit: 100, after, archived: archived ? 'true' : undefined }).catch(e => {
          if (e instanceof HubSpotForbidden) { coverage.owners = 'denied'; warn('owners_denied'); return null }
          throw e
        })
        if (!page) break
        await upsert('crm_owners', (page.results ?? []).map(o => ({ ...normalizeOwner({ ...o, archived: archived || o.archived }), synced_at: new Date(now()).toISOString() })))
        bump('owners', page.results?.length ?? 0)
        after = page.paging?.next?.after
      } while (after)
    }
    state.step_done_metadata = true
  }

  async function deals() {
    if (!selected.length) { warn('no_pipeline_selected'); return }
    const maps = await loadMaps()
    const selStages = maps.stages.filter(s => [...maps.pipelineByExternal].some(([ext, id]) => selected.includes(ext) && id === s.pipeline_id))
    const properties = [...new Set([...DEAL_BASE_PROPERTIES, ...selStages.map(s => stageEnteredProp(s.external_id))])]
    const [cursor] = await store.select('revenue_sync_cursors', { where: { ...scope, object_type: 'deals' } })
    const d = (state.deals ??= { window_start: full || !cursor?.high_watermark ? 0 : Date.parse(cursor.high_watermark) - OVERLAP_MS, after: null, max_seen: null })

    while (true) {
      checkTime()
      const closedFrom = Math.max(d.window_start, now() - CLOSED_DEAL_LOOKBACK_DAYS * 86400000)
      const f = (closed, from) => ({ filters: [
        { propertyName: 'pipeline', operator: 'IN', values: selected },
        { propertyName: 'hs_is_closed', operator: 'EQ', value: closed ? 'true' : 'false' },
        { propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: String(from) },
      ] })
      const page = await client.post('/crm/v3/objects/deals/search', {
        filterGroups: [f(false, d.window_start), f(true, closedFrom)],
        sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'ASCENDING' }], properties, limit: 100, ...(d.after ? { after: d.after } : {}),
      })
      const rows = (page.results ?? []).map(r => normalizeDeal(r, maps))
      await upsertSafe('crm_deals', rows, conflictKey, 'deals')
      bump('deals', rows.length)
      for (const r of rows) if (r.source_updated_at && (!d.max_seen || r.source_updated_at > d.max_seen)) d.max_seen = r.source_updated_at
      const next = page.paging?.next?.after ?? null
      if (next && Number(next) >= SEARCH_WINDOW_LIMIT) {
        // Search cannot page past 10k results: restart the window at the last modified date seen (dupes are idempotent).
        d.window_start = Date.parse(d.max_seen) - 1; d.after = null
      } else d.after = next
      await save() // page persisted -> cursor may advance
      if (!next) break
    }
    if (d.max_seen) {
      await store.insert('revenue_sync_cursors', [{ ...scope, object_type: 'deals', high_watermark: d.max_seen, cursor_after: null, status: 'idle', updated_at: new Date(now()).toISOString() }], { onConflict: 'organization_id,connection_id,object_type' })
    }
  }

  function openDealPage(offset, limit) {
    return store.select('crm_deals', { where: { ...scope, archived: false }, columns: 'id,external_id,stage_id', order: 'external_id.asc', limit, offset })
  }

  async function openDealIds(offset, limit) {
    const stages = await store.select('crm_stages', { where: scope, columns: 'id,is_closed' })
    const closed = new Set(stages.filter(s => s.is_closed === true).map(s => s.id))
    const rows = await openDealPage(offset, limit)
    return { rows: rows.filter(r => !closed.has(r.stage_id)), raw: rows.length }
  }

  async function associations() {
    const a = (state.assoc ??= { offset: 0 })
    const PAGE = 500
    while (true) {
      checkTime()
      const { rows, raw } = await openDealIds(a.offset, PAGE)
      if (raw === 0) break
      const ids = rows.map(r => r.external_id)
      for (const [toType, objType, normalize, table] of [['contact', 'contacts', normalizeContact, 'crm_contacts'], ['company', 'companies', normalizeCompany, 'crm_companies']]) {
        try {
          const fresh = []
          for (let i = 0; i < ids.length; i += 1000) {
            const res = await client.post(`/crm/v4/associations/deals/${objType}/batch/read`, { inputs: ids.slice(i, i + 1000).map(id => ({ id })) })
            fresh.push(...normalizeAssociationsV4(res))
          }
          await replaceAssociations({ fromType: 'deal', toType, fromIds: ids, fresh: fresh.map(x => ({ from: x.from, to: x.to, association_type: x.association_type })) })
          const objIds = [...new Set(fresh.map(x => x.to))]
          await ensureObjects(table, objType, normalize, objIds)
          if (toType === 'company') await setPrimaryCompanies(fresh)
          coverage[`associations_${toType}`] = 'complete'
        } catch (e) {
          if (e instanceof HubSpotForbidden) { coverage[`associations_${toType}`] = 'denied'; warn(`associations_${toType}_denied`) } else throw e
        }
      }
      bump('deals_associated', rows.length)
      a.offset += PAGE
      await save()
      if (raw < PAGE) break
    }
  }

  // Replace the association set of `fromIds` with `fresh`; only pairs that HubSpot
  // no longer returns for a successfully-read batch are tombstoned.
  async function replaceAssociations({ fromType, toType, fromIds, fresh }) {
    const nowIso = new Date(now()).toISOString()
    await upsert('crm_associations', fresh.map(x => ({ from_type: fromType, from_external_id: x.from, to_type: toType, to_external_id: x.to, association_type: x.association_type, synced_at: nowIso, deleted_at: null })),
      'organization_id,connection_id,from_type,from_external_id,to_type,to_external_id,association_type')
    const keep = new Set(fresh.map(x => `${x.from}|${x.to}|${x.association_type}`))
    for (let i = 0; i < fromIds.length; i += 200) {
      const existing = await store.select('crm_associations', { where: { ...scope, from_type: fromType, to_type: toType, from_external_id: { in: fromIds.slice(i, i + 200) }, deleted_at: { isnull: true } }, columns: 'from_external_id,to_external_id,association_type' })
      const stale = existing.filter(e => !keep.has(`${e.from_external_id}|${e.to_external_id}|${e.association_type}`))
      for (const s of stale) {
        await store.update('crm_associations', { ...scope, from_type: fromType, to_type: toType, from_external_id: s.from_external_id, to_external_id: s.to_external_id, association_type: s.association_type }, { deleted_at: nowIso })
        bump('associations_removed')
      }
    }
  }

  async function ensureObjects(table, objType, normalize, ids) {
    if (!ids.length) return
    const have = new Set()
    for (let i = 0; i < ids.length; i += 200) {
      for (const r of await store.select(table, { where: { ...scope, external_id: { in: ids.slice(i, i + 200) } }, columns: 'external_id' })) have.add(r.external_id)
    }
    const missing = ids.filter(id => !have.has(id))
    const props = objType === 'contacts' ? ['firstname', 'lastname', 'jobtitle', 'lastmodifieddate'] : ['name', 'domain', 'hs_lastmodifieddate']
    for (let i = 0; i < missing.length; i += 100) {
      checkTime()
      const res = await client.post(`/crm/v3/objects/${objType}/batch/read`, { properties: props, inputs: missing.slice(i, i + 100).map(id => ({ id })) })
      await upsertSafe(table, (res?.results ?? []).map(r => ({ ...normalize(r), synced_at: new Date(now()).toISOString() })), conflictKey, table)
    }
  }

  async function setPrimaryCompanies(fresh) {
    const byDeal = new Map()
    for (const x of fresh) if (!byDeal.has(x.from) || x.primary) byDeal.set(x.from, x.to)
    const companies = new Map((await store.select('crm_companies', { where: { ...scope, external_id: { in: [...new Set(byDeal.values())].slice(0, 500) } }, columns: 'id,external_id' })).map(c => [c.external_id, c.id]))
    for (const [dealExt, coExt] of byDeal) {
      const id = companies.get(coExt)
      if (id) await store.update('crm_deals', { ...scope, external_id: dealExt }, { company_id: id })
    }
  }

  async function activities() {
    const a = (state.act ??= { offset: 0, denied: {} })
    const PAGE = 500
    const TERMINAL = new Set(['completed', 'done', 'cancelled', 'canceled', 'no_show'])
    while (true) {
      checkTime()
      const { rows, raw } = await openDealIds(a.offset, PAGE)
      if (raw === 0) break
      const dealIds = rows.map(r => r.external_id)
      for (const [objType, def] of Object.entries(ACTIVITY_TYPES)) {
        if (a.denied[objType]) continue
        try {
          const fresh = []
          for (let i = 0; i < dealIds.length; i += 1000) {
            const res = await client.post(`/crm/v4/associations/deals/${objType}/batch/read`, { inputs: dealIds.slice(i, i + 1000).map(id => ({ id })) })
            // v4 read from deal -> activity: from = deal, to = activity. We store activity -> deal.
            for (const x of normalizeAssociationsV4(res)) fresh.push({ from: x.to, to: x.from, association_type: x.association_type })
          }
          // replace by DEAL side: tombstone activity->deal rows for these deals no longer returned
          await replaceActivityLinks(def.type, dealIds, fresh)
          const ids = [...new Set(fresh.map(x => x.from))]
          const local = new Map()
          for (let i = 0; i < ids.length; i += 200) for (const r of await store.select('crm_activities', { where: { ...scope, type: def.type, external_id: { in: ids.slice(i, i + 200) } }, columns: 'external_id,status,due_at' })) local.set(r.external_id, r)
          // Immutable-ish kinds (calls/emails) are fetched once; tasks/meetings whose state can still change are re-read every run.
          const refetch = ids.filter(id => {
            const l = local.get(id)
            if (!l) return true
            if (def.type === 'call' || def.type === 'email') return false
            return !TERMINAL.has(String(l.status ?? '').toLowerCase()) || (l.due_at && Date.parse(l.due_at) >= now() - 30 * 86400000)
          })
          for (let i = 0; i < refetch.length; i += 100) {
            checkTime()
            const res = await client.post(`/crm/v3/objects/${objType}/batch/read`, { properties: def.properties, inputs: refetch.slice(i, i + 100).map(id => ({ id })) })
            await upsertSafe('crm_activities', (res?.results ?? []).map(r => normalizeActivity(objType, r)), 'organization_id,connection_id,type,external_id', 'activities')
            bump(`activities_${def.type}`, res?.results?.length ?? 0)
          }
          coverage[`activities_${def.type}`] = 'complete'
        } catch (e) {
          if (e instanceof HubSpotForbidden) { a.denied[objType] = true; coverage[`activities_${def.type}`] = 'denied'; warn(`activities_${def.type}_denied`) } else throw e
        }
      }
      a.offset += PAGE
      await save()
      if (raw < PAGE) break
    }
  }

  async function replaceActivityLinks(type, dealIds, fresh) {
    const nowIso = new Date(now()).toISOString()
    await upsert('crm_associations', fresh.map(x => ({ from_type: type, from_external_id: x.from, to_type: 'deal', to_external_id: x.to, association_type: x.association_type, synced_at: nowIso, deleted_at: null })),
      'organization_id,connection_id,from_type,from_external_id,to_type,to_external_id,association_type')
    const keep = new Set(fresh.map(x => `${x.from}|${x.to}`))
    for (let i = 0; i < dealIds.length; i += 200) {
      const existing = await store.select('crm_associations', { where: { ...scope, from_type: type, to_type: 'deal', to_external_id: { in: dealIds.slice(i, i + 200) }, deleted_at: { isnull: true } }, columns: 'from_external_id,to_external_id,association_type' })
      for (const e of existing.filter(e => !keep.has(`${e.from_external_id}|${e.to_external_id}`))) {
        await store.update('crm_associations', { ...scope, from_type: type, to_type: 'deal', from_external_id: e.from_external_id, to_external_id: e.to_external_id, association_type: e.association_type }, { deleted_at: nowIso })
        bump('associations_removed')
      }
    }
  }

  async function history() {
    const h = (state.hist ??= { offset: 0 })
    const PAGE = 50
    while (true) {
      checkTime()
      const touched = await store.select('crm_deals', { where: { ...scope, archived: false, synced_at: { gte: startedAt } }, columns: 'id,external_id,stage_external_id,stage_entered_at', order: 'external_id.asc', limit: PAGE, offset: h.offset })
      if (!touched.length) break
      try {
        const res = await client.post('/crm/v3/objects/deals/batch/read', { properties: ['dealstage'], propertiesWithHistory: ['dealstage'], inputs: touched.map(t => ({ id: t.external_id })) })
        const byExt = new Map(touched.map(t => [t.external_id, t]))
        const rows = [], fallback = []
        for (const raw of res?.results ?? []) {
          const deal = byExt.get(String(raw.id)); if (!deal) continue
          const hist = propertyHistoryRows(raw, 'dealstage')
          for (const r of hist) rows.push({ deal_id: deal.id, ...r })
          if (!deal.stage_entered_at && hist.length) {
            const cur = hist.filter(x => x.value === deal.stage_external_id).sort((a, b) => b.effective_at.localeCompare(a.effective_at))[0]
            if (cur) fallback.push({ external_id: deal.external_id, stage_entered_at: cur.effective_at })
          }
        }
        await upsert('crm_property_history', rows, 'organization_id,deal_id,property,effective_at', { ignoreDuplicates: true })
        for (const f of fallback) await store.update('crm_deals', { ...scope, external_id: f.external_id }, { stage_entered_at: f.stage_entered_at, stage_entered_source: 'history' })
        bump('history_rows', rows.length)
        coverage.stage_history = 'complete'
      } catch (e) {
        if (e instanceof HubSpotForbidden) { coverage.stage_history = 'denied'; warn('stage_history_denied'); break } else throw e
      }
      h.offset += PAGE
      await save()
      if (touched.length < PAGE) break
    }
  }

  async function reconcile() {
    if (!full) return
    const r = (state.recon ??= { after: null })
    do {
      checkTime()
      const page = await client.get('/crm/v3/objects/deals', { archived: 'true', limit: 100, after: r.after ?? undefined, properties: 'dealname' })
      const ids = (page.results ?? []).map(x => String(x.id))
      for (let i = 0; i < ids.length; i += 100) await store.update('crm_deals', { ...scope, external_id: { in: ids.slice(i, i + 100) } }, { archived: true })
      bump('deals_archived', ids.length)
      r.after = page.paging?.next?.after ?? null
      await save()
    } while (r.after)
  }

  async function finalize() {
    const actCov = ['call', 'email', 'meeting', 'task'].map(t => coverage[`activities_${t}`])
    const activityCoverage = actCov.every(c => c === 'complete') ? 'complete' : actCov.some(c => c === 'complete') ? 'partial' : actCov.every(c => c === 'denied') ? 'denied' : 'none'
    const summary = {
      activities: activityCoverage,
      history_since_creation: activityCoverage === 'complete',
      associations_contacts: coverage.associations_contact ?? 'none',
      stage_history: coverage.stage_history ?? 'observed_only',
    }
    coverage.summary = summary
    const [conn] = await store.select('crm_connections', { where: { id: connectionId, organization_id: orgId } })
    if (conn) {
      await store.update('crm_connections', { id: connectionId, organization_id: orgId }, {
        capabilities: { ...(conn.capabilities ?? {}), coverage: summary, last_sync_warnings: warnings }, last_success_at: new Date(now()).toISOString(), status: conn.status === 'reconnect_required' ? conn.status : 'active',
      })
    }
    const status = warnings.length ? 'partial' : 'succeeded'
    finalStatus = status
    // first successful sync after the admin confirmed the setup
    await store.update('revenue_settings', { organization_id: orgId, onboarding_state: 'confirmed' }, { onboarding_state: 'synced' })
    await save({ status, finished_at: new Date(now()).toISOString() })
    await store.rpc('rv_enqueue_job', { _org: orgId, _kind: 'evaluate', _payload: { sync_run_id: runId }, _dedupe: `evaluate:${runId}`, _run_after: null, _max_attempts: 3, _created_by: null })
  }
}
