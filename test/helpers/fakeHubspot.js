// In-memory HubSpot for tests: implements just the endpoints the sync uses.
import { HubSpotRateLimited, HubSpotForbidden } from '../../api/_lib/hubspot/client.js'

export function createFakeHubspot() {
  const state = {
    pipelines: [{ id: 'p1', label: 'Sales', displayOrder: 0, archived: false, stages: [
      { id: 's_early', label: 'Discovery', displayOrder: 0, metadata: { isClosed: 'false', probability: '0.2' } },
      { id: 's_mid', label: 'Proposal', displayOrder: 1, metadata: { isClosed: 'false', probability: '0.5' } },
      { id: 's_late', label: 'Negotiation', displayOrder: 2, metadata: { isClosed: 'false', probability: '0.8' } },
      { id: 's_won', label: 'Closed Won', displayOrder: 3, metadata: { isClosed: 'true', probability: '1.0' } },
      { id: 's_lost', label: 'Closed Lost', displayOrder: 4, metadata: { isClosed: 'true', probability: '0.0' } },
    ] }],
    owners: [{ id: 'o1', email: 'a@x.com', firstName: 'Ann', lastName: 'Lee', archived: false }, { id: 'o2', email: 'b@x.com', firstName: 'Bo', archived: false }],
    archivedOwners: [],
    deals: new Map(),     // id -> { id, properties, history:[{value,timestamp}], archived }
    contacts: new Map(),
    companies: new Map(),
    acts: { calls: new Map(), emails: new Map(), meetings: new Map(), tasks: new Map() },
    assoc: { contacts: new Map(), companies: new Map(), calls: new Map(), emails: new Map(), meetings: new Map(), tasks: new Map() }, // dealId -> [ids]
    forbid: new Set(),    // path substrings that return 403
    failNext: [],         // [{ match, error }] one-shot injected failures
    tasks: new Map(),
    calls: [],
    clock: () => Date.now(),
  }
  const iso = ms => new Date(ms).toISOString()

  function addDeal(id, props = {}, opts = {}) {
    const now = state.clock()
    state.deals.set(String(id), {
      id: String(id), archived: false, history: opts.history ?? [],
      properties: { dealname: `Deal ${id}`, amount: '1000', deal_currency_code: 'USD', pipeline: 'p1', dealstage: 's_mid', hubspot_owner_id: 'o1', createdate: iso(now - 60 * 86400000), hs_lastmodifieddate: iso(now), hs_is_closed: 'false', closedate: iso(now + 10 * 86400000), ...props },
    })
    return state.deals.get(String(id))
  }
  const touch = id => { state.deals.get(String(id)).properties.hs_lastmodifieddate = iso(state.clock()) }

  function maybeFail(path) {
    for (const f of state.forbid) if (path.includes(f)) throw new HubSpotForbidden(path, 'MISSING_SCOPES')
    const i = state.failNext.findIndex(f => path.includes(f.match))
    if (i >= 0) { const [f] = state.failNext.splice(i, 1); throw f.error }
  }

  const pick = (obj, props) => Object.fromEntries((props ?? []).map(p => [p, obj.properties[p] ?? null]))

  const client = {
    async get(path, query = {}) {
      state.calls.push(['GET', path]); maybeFail(path)
      if (path === '/crm/v3/pipelines/deals') return { results: state.pipelines }
      if (path === '/crm/v3/owners') return { results: query.archived === 'true' ? state.archivedOwners : state.owners }
      let mm
      if ((mm = /^\/crm\/v3\/objects\/deals\/(\d+|[\w-]+)$/.exec(path)) && !path.endsWith('/deals/batch')) {
        const d = state.deals.get(mm[1]); if (!d) throw new HubSpotForbidden(path, 'NOT_FOUND')
        return { id: d.id, archived: d.archived, properties: d.properties }
      }
      if ((mm = /^\/crm\/v3\/objects\/tasks\/([\w-]+)$/.exec(path))) { const t = state.tasks.get(mm[1]); if (!t) throw new Error('task not found'); return t }
      if (path === '/crm/v3/objects/deals') { // archived listing
        const all = [...state.deals.values()].filter(d => d.archived)
        return { results: all.map(d => ({ id: d.id, archived: true, properties: {} })) }
      }
      throw new Error('fake: unhandled GET ' + path)
    },
    async post(path, body) {
      state.calls.push(['POST', path]); maybeFail(path)
      if (path === '/crm/v3/objects/deals/search') {
        let rows = [...state.deals.values()].filter(d => !d.archived)
        rows = rows.filter(d => body.filterGroups.some(g => g.filters.every(f => {
          const v = d.properties[f.propertyName]
          if (f.operator === 'IN') return f.values.includes(v)
          if (f.operator === 'EQ') return String(v) === String(f.value)
          if (f.operator === 'GTE') return Date.parse(v) >= Number(f.value)
          return false
        })))
        rows.sort((a, b) => Date.parse(a.properties.hs_lastmodifieddate) - Date.parse(b.properties.hs_lastmodifieddate))
        const start = Number(body.after ?? 0), limit = body.limit ?? 100
        const slice = rows.slice(start, start + limit)
        return { results: slice.map(d => ({ id: d.id, properties: pick(d, body.properties), archived: false })), paging: start + limit < rows.length ? { next: { after: String(start + limit) } } : undefined }
      }
      let m
      if ((m = /^\/crm\/v4\/associations\/deals\/(\w+)\/batch\/read$/.exec(path))) {
        const map = state.assoc[m[1]]
        return { results: body.inputs.filter(i => map.has(i.id) && map.get(i.id).length).map(i => ({ from: { id: i.id }, to: map.get(i.id).map(t => ({ toObjectId: t, associationTypes: [{ typeId: m[1] === 'companies' ? 5 : 3, label: m[1] === 'companies' ? 'Primary' : null }] })) })) }
      }
      if ((m = /^\/crm\/v3\/objects\/(contacts|companies)\/batch\/read$/.exec(path))) {
        const store = state[m[1]]
        return { results: body.inputs.filter(i => store.has(i.id)).map(i => store.get(i.id)) }
      }
      if ((m = /^\/crm\/v3\/objects\/(calls|emails|meetings|tasks)\/batch\/read$/.exec(path))) {
        return { results: body.inputs.filter(i => state.acts[m[1]].has(i.id)).map(i => state.acts[m[1]].get(i.id)) }
      }
      if (path === '/crm/v3/objects/tasks') {
        const id = 'task-' + (state.tasks.size + 1)
        state.tasks.set(id, { id, properties: body.properties, associations: body.associations })
        return { id }
      }
      if (path === '/crm/v3/objects/tasks/search') {
        const tok = body.filterGroups[0].filters[0].value
        return { results: [...state.tasks.values()].filter(t => String(t.properties.hs_task_body ?? '').includes(tok)).map(t => ({ id: t.id })) }
      }
      if (path === '/crm/v3/objects/deals/batch/read') {
        return { results: body.inputs.filter(i => state.deals.has(i.id)).map(i => { const d = state.deals.get(i.id); return { id: d.id, properties: pick(d, body.properties), propertiesWithHistory: { dealstage: [...d.history].reverse() } } }) }
      }
      throw new Error('fake: unhandled POST ' + path)
    },
  }
  client.request = async (method, path, { body } = {}) => {
    state.calls.push([method, path]); maybeFail(path)
    if (method === 'PATCH') { const id = path.split('/').pop(); Object.assign(state.deals.get(id).properties, body.properties); return {} }
    return method === 'GET' ? client.get(path) : client.post(path, body)
  }
  return { state, client, addDeal, touch }
}

export { HubSpotRateLimited }
