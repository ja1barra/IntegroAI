// ── CRM prospect sync ────────────────────────────────────────
// Pulls contacts from connected CRMs (HubSpot / Apollo) into the
// prospects table. Reuses the existing integration libs, which return
// live data when an API key is stored and demo data otherwise — so a
// fresh account can populate prospects immediately.

import { supabase } from '../supabase'
import { loadCredential } from '../integrations/credentialStore'
import { fetchContacts as fetchHubSpotContacts } from '../integrations/hubspot'
import { fetchContacts as fetchApolloContacts } from '../integrations/apollo'
import { upsertProspects } from './store'
import type { ProspectInput } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function connectedCrmProviders(): Promise<string[]> {
  const { data } = await supabase
    .from('integrations')
    .select('provider, connected')
    .in('provider', ['hubspot', 'apollo'])
    .eq('connected', true)
  return ((data as any[]) ?? []).map(r => r.provider)
}

export interface SyncResult {
  synced: number
  sources: string[]
  demo: boolean
}

export async function syncCrmProspects(): Promise<SyncResult> {
  const connected = await connectedCrmProviders()
  const inputs: ProspectInput[] = []
  const sources = new Set<string>()

  // HubSpot
  try {
    const key = (await loadCredential('hubspot')) ?? 'demo'
    const contacts = await fetchHubSpotContacts(key)
    for (const c of contacts) {
      const p = c.properties
      if (!p?.email) continue
      inputs.push({
        firstName: p.firstname ?? '',
        lastName: p.lastname ?? '',
        email: p.email,
        title: p.jobtitle ?? '',
        company: p.company ?? '',
        source: 'hubspot',
        externalId: c.id,
      })
      sources.add('hubspot')
    }
  } catch { /* skip source on failure */ }

  // Apollo
  try {
    const key = (await loadCredential('apollo')) ?? 'demo'
    const contacts = await fetchApolloContacts(key)
    for (const c of contacts) {
      if (!c.email) continue
      inputs.push({
        firstName: c.first_name ?? '',
        lastName: c.last_name ?? '',
        email: c.email,
        title: c.title ?? '',
        company: c.organization_name ?? '',
        source: 'apollo',
        externalId: c.id,
      })
      sources.add('apollo')
    }
  } catch { /* skip source on failure */ }

  const synced = await upsertProspects(inputs)
  return { synced, sources: [...sources], demo: connected.length === 0 }
}
