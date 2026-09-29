// Pure normalizers: HubSpot payloads -> rows of our mirror tables. No I/O.

export const DEAL_BASE_PROPERTIES = [
  'dealname', 'amount', 'deal_currency_code', 'closedate', 'dealstage', 'pipeline',
  'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate', 'hs_is_closed',
]
export const stageEnteredProp = stageId => `hs_date_entered_${stageId}`

export const ACTIVITY_TYPES = {
  calls:    { type: 'call',    properties: ['hs_timestamp', 'hs_call_status', 'hs_call_direction', 'hs_call_title', 'hs_lastmodifieddate'] },
  emails:   { type: 'email',   properties: ['hs_timestamp', 'hs_email_status', 'hs_email_direction', 'hs_email_subject', 'hs_lastmodifieddate'] },
  meetings: { type: 'meeting', properties: ['hs_timestamp', 'hs_meeting_start_time', 'hs_meeting_outcome', 'hs_meeting_title', 'hs_lastmodifieddate'] },
  tasks:    { type: 'task',    properties: ['hs_timestamp', 'hs_task_status', 'hs_task_subject', 'hs_task_type', 'hs_lastmodifieddate'] },
}
// Notes are deliberately not synced: internal notes are not "commercial contact".

const iso = v => {
  if (v === null || v === undefined || v === '') return null
  // HubSpot returns ISO strings for datetimes and epoch-millis strings for some properties.
  const t = /^\d{10,}$/.test(String(v)) ? Number(v) : Date.parse(v)
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}
const text = (v, max) => (v === null || v === undefined || v === '' ? null : String(v).slice(0, max))

export function normalizePipelines(payload) {
  const pipelines = [], stages = []
  for (const p of payload?.results ?? []) {
    pipelines.push({ external_id: String(p.id), label: p.label ?? String(p.id), display_order: p.displayOrder ?? null, archived: !!p.archived })
    for (const s of p.stages ?? []) {
      const md = s.metadata ?? {}
      const isClosed = md.isClosed === undefined ? null : String(md.isClosed) === 'true'
      const prob = md.probability === undefined || md.probability === '' ? null : Number(md.probability)
      stages.push({
        pipeline_external_id: String(p.id), external_id: String(s.id), label: s.label ?? String(s.id), display_order: s.displayOrder ?? null,
        is_closed: isClosed, is_won: isClosed === true && prob !== null ? prob >= 1 : null,
        probability: prob !== null && Number.isFinite(prob) ? prob : null, archived: !!s.archived,
      })
    }
  }
  return { pipelines, stages }
}

// Suggestion only (never persisted as truth): open stages split by their order.
// The admin confirms/edits in onboarding; labels are never parsed.
export function suggestCategories(stages) {
  const open = stages.filter(s => s.is_closed !== true).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  const n = open.length
  return Object.fromEntries(open.map((s, i) => [s.external_id, n <= 1 ? 'mid' : i < n / 3 ? 'early' : i >= (2 * n) / 3 ? 'late' : 'mid']))
}

export function normalizeOwner(o) {
  const name = [o.firstName, o.lastName].filter(Boolean).join(' ') || null
  return { external_id: String(o.id), name, email: o.email ?? null, archived: !!o.archived }
}

export const normalizeContact = c => ({
  external_id: String(c.id), first_name: text(c.properties?.firstname, 100), last_name: text(c.properties?.lastname, 100),
  job_title: text(c.properties?.jobtitle, 150), source_updated_at: iso(c.properties?.lastmodifieddate ?? c.updatedAt), archived: !!c.archived,
})
export const normalizeCompany = c => ({
  external_id: String(c.id), name: text(c.properties?.name, 200), domain: text(c.properties?.domain, 200),
  source_updated_at: iso(c.properties?.hs_lastmodifieddate ?? c.updatedAt), archived: !!c.archived,
})

/**
 * maps: { stageByExternal: Map, pipelineByExternal: Map, ownerByExternal: Map, defaultCurrency }
 * Returns a row with a UNIFORM key set (required for bulk upsert).
 */
export function normalizeDeal(raw, maps) {
  const props = raw.properties ?? {}
  const has = k => Object.prototype.hasOwnProperty.call(props, k)
  const state = (k, parsed) => (!has(k) ? 'unknown' : props[k] === null || props[k] === '' ? 'empty' : parsed === null ? 'unknown' : 'value')

  const amountRaw = has('amount') && props.amount !== null && props.amount !== '' ? String(props.amount).trim() : null
  // must fit numeric(20,4): a poison value must degrade to "unknown", never fail the whole page
  const amount = amountRaw !== null && /^-?\d{1,16}(\.\d+)?$/.test(amountRaw) ? amountRaw : null
  const currencyCandidate = text(props.deal_currency_code, 10)?.toUpperCase() ?? null
  const currencyRaw = currencyCandidate && /^[A-Z]{3}$/.test(currencyCandidate) ? currencyCandidate : null // violates the DB check otherwise
  const stageExt = text(props.dealstage, 100), pipeExt = text(props.pipeline, 100), ownerExt = text(props.hubspot_owner_id, 50)
  const stage = stageExt ? maps.stageByExternal.get(stageExt) : undefined
  const owner = ownerExt ? maps.ownerByExternal.get(ownerExt) : undefined
  const enteredProp = stageExt ? props[stageEnteredProp(stageExt)] : undefined

  return {
    external_id: String(raw.id),
    name: text(props.dealname, 300),
    pipeline_id: pipeExt ? maps.pipelineByExternal.get(pipeExt) ?? null : null,
    stage_id: stage?.id ?? null,
    stage_external_id: stageExt,
    owner_id: owner ?? null,
    owner_external_id: ownerExt,
    owner_state: !has('hubspot_owner_id') ? 'unknown' : ownerExt ? 'value' : 'empty',
    amount,
    currency: currencyRaw ?? (amount !== null ? maps.defaultCurrency ?? null : null),
    close_at: iso(props.closedate),
    stage_entered_at: iso(enteredProp),
    stage_entered_source: iso(enteredProp) ? 'history' : null,
    created_at_source: iso(props.createdate ?? raw.createdAt),
    source_updated_at: iso(props.hs_lastmodifieddate ?? raw.updatedAt),
    archived: !!raw.archived,
    synced_at: new Date().toISOString(),
    field_states: {
      amount: state('amount', amount),
      close_at: state('closedate', iso(props.closedate)),
      currency: currencyRaw ? 'value' : amount !== null && maps.defaultCurrency ? 'defaulted' : has('deal_currency_code') && !currencyCandidate ? 'empty' : 'unknown',
      owner: !has('hubspot_owner_id') ? 'unknown' : ownerExt ? 'value' : 'empty',
    },
  }
}

const MEETING_OUTCOME = { SCHEDULED: 'scheduled', COMPLETED: 'completed', RESCHEDULED: 'rescheduled', NO_SHOW: 'no_show', CANCELED: 'cancelled', CANCELLED: 'cancelled' }

export function normalizeActivity(objectType, raw) {
  const def = ACTIVITY_TYPES[objectType]
  if (!def) throw new Error(`Unsupported activity object type: ${objectType}`)
  const p = raw.properties ?? {}
  const ts = iso(p.hs_timestamp)
  const base = { external_id: String(raw.id), type: def.type, provenance: 'hubspot', archived: !!raw.archived, is_system: false, source_updated_at: iso(p.hs_lastmodifieddate ?? raw.updatedAt), synced_at: new Date().toISOString() }
  switch (def.type) {
    case 'call':    return { ...base, occurred_at: ts, due_at: null, status: text(p.hs_call_status, 40)?.toLowerCase() ?? null, direction: text(p.hs_call_direction, 20)?.toLowerCase() ?? null, subject: text(p.hs_call_title, 200), body_excerpt: null }
    case 'email':   return { ...base, occurred_at: ts, due_at: null, status: text(p.hs_email_status, 40)?.toLowerCase() ?? null, direction: text(p.hs_email_direction, 30)?.toLowerCase() ?? null, subject: text(p.hs_email_subject, 200), body_excerpt: null }
    case 'meeting': {
      const start = iso(p.hs_meeting_start_time) ?? ts
      const outcome = MEETING_OUTCOME[String(p.hs_meeting_outcome ?? '').toUpperCase()] ?? (text(p.hs_meeting_outcome, 30)?.toLowerCase() ?? null)
      // Both fields carry the meeting time: past => a touch (if completed), future => a next step.
      return { ...base, occurred_at: start, due_at: start, status: outcome, direction: null, subject: text(p.hs_meeting_title, 200), body_excerpt: null }
    }
    case 'task':    return { ...base, occurred_at: null, due_at: ts, status: text(p.hs_task_status, 40)?.toLowerCase() ?? null, direction: null, subject: text(p.hs_task_subject, 200), body_excerpt: null }
    default: throw new Error('unreachable')
  }
}

/** v4 batch association read -> [{ from, to, typeIds, primary }] */
export function normalizeAssociationsV4(payload) {
  const out = []
  for (const r of payload?.results ?? []) {
    const from = String(r.from?.id ?? r._from?.id ?? '')
    for (const t of r.to ?? []) {
      const types = t.associationTypes ?? []
      out.push({ from, to: String(t.toObjectId ?? t.id), association_type: types.map(x => x.typeId).sort((a, b) => a - b).join(','), primary: types.some(x => String(x.label ?? '').toLowerCase() === 'primary' || x.typeId === 5) })
    }
  }
  return out
}

export function propertyHistoryRows(rawDeal, property) {
  const h = rawDeal?.propertiesWithHistory?.[property] ?? []
  return h.map(x => ({ property, value: x.value ?? null, effective_at: iso(x.timestamp), source: 'hubspot_history' })).filter(x => x.effective_at)
}
