// Seeds a realistic analyzed org (via the real sync + evaluation code) into a PGlite-backed store.
import { createFakeHubspot } from './fakeHubspot.js'
import { runSync } from '../../api/_lib/hubspot/sync.js'
import { evaluateOrg } from '../../api/_lib/revenue/evaluate.js'
import { seedUser } from '../sql/helpers.js'

export const NOW = Date.parse('2026-09-28T12:00:00Z')
export const ago = d => new Date(NOW - d * 86400000).toISOString()
export const fut = d => new Date(NOW + d * 86400000).toISOString()

export async function seedOrg(db, store, { name, portal, email, dealName = 'Acme renewal', injectedSubject = null }) {
  const user = await seedUser(db, email, name)
  const orgId = await store.rpc('rv_ensure_user_org', { _user: user, _name: name })
  const connId = (await store.insert('crm_connections', [{ organization_id: orgId, provider: 'hubspot', portal_id: portal, status: 'active', capabilities: { write_tasks: true, write_deals: true } }]))[0].id
  await store.update('revenue_settings', { organization_id: orgId }, { selected_pipeline_ids: ['p1'], timezone: 'UTC', currency: 'USD' })
  await store.update('revenue_org_flags', { organization_id: orgId }, { revenue_mvp_enabled: true, managed_ai_enabled: true, hubspot_write_actions_enabled: true })
  const fake = createFakeHubspot(); fake.state.clock = () => NOW
  fake.addDeal('d1', { dealname: dealName, dealstage: 's_late', amount: '50000', hs_date_entered_s_late: ago(5) })
  fake.state.assoc.contacts.set('d1', ['c1']); fake.state.contacts.set('c1', { id: 'c1', properties: { firstname: 'Cy' } })
  fake.state.assoc.emails.set('d1', ['e1'])
  fake.state.acts.emails.set('e1', { id: 'e1', properties: { hs_timestamp: ago(30), hs_email_status: 'SENT', hs_email_subject: injectedSubject ?? 'Intro' } })
  fake.addDeal('d2', { dealname: 'Healthy deal', dealstage: 's_late', amount: '30000', hs_date_entered_s_late: ago(3), hubspot_owner_id: 'o2' })
  fake.state.assoc.contacts.set('d2', ['c2', 'c3']); for (const c of ['c2', 'c3']) fake.state.contacts.set(c, { id: c, properties: { firstname: c } })
  fake.state.assoc.calls.set('d2', ['k1']); fake.state.acts.calls.set('k1', { id: 'k1', properties: { hs_timestamp: ago(2), hs_call_status: 'COMPLETED' } })
  fake.state.assoc.tasks.set('d2', ['t1']); fake.state.acts.tasks.set('t1', { id: 't1', properties: { hs_timestamp: fut(3), hs_task_status: 'NOT_STARTED' } })
  const run = (await store.insert('revenue_sync_runs', [{ organization_id: orgId, connection_id: connId, kind: 'full', status: 'queued' }]))[0]
  await runSync({ store, client: fake.client, orgId, connectionId: connId, runId: run.id, deadline: NOW + 3_600_000, now: () => NOW })
  for (const [ext, cat] of [['s_early', 'early'], ['s_mid', 'mid'], ['s_late', 'late']]) await store.update('crm_stages', { organization_id: orgId, external_id: ext }, { category: cat, category_source: 'admin' })
  const ev = await evaluateOrg({ store, orgId, asOf: new Date(NOW).toISOString(), syncRunId: run.id })
  const deals = await store.select('crm_deals', { where: { organization_id: orgId }, columns: 'id,external_id' })
  return { user, orgId, connId, fake, snapshotId: ev.snapshotId, dealId: e => deals.find(d => d.external_id === e).id }
}
