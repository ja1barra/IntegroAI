// ── Expansion pipeline ─────────────────────────────────────────
// Sums open HubSpot deals whose dealtype is "existingbusiness" — a
// standard HubSpot property (new business vs. expansion/upsell on an
// existing account), not a custom field, so this works the moment
// HubSpot is connected without any extra setup.

import { supabase } from '../supabase'
import { loadCredential } from '../integrations/credentialStore'
import { fetchDeals } from '../integrations/hubspot'
import type { ExpansionSnapshot } from './types'

async function hubspotConnected(): Promise<boolean> {
  const { data } = await supabase
    .from('integrations')
    .select('connected')
    .eq('provider', 'hubspot')
    .eq('connected', true)
    .maybeSingle()
  return !!data
}

export async function fetchExpansionSnapshot(): Promise<ExpansionSnapshot> {
  const connected = await hubspotConnected()
  const key = (await loadCredential('hubspot')) ?? 'demo'
  const deals = await fetchDeals(key)

  const expansionDeals = deals.filter(d => {
    const p = d.properties
    const stage = (p.dealstage || '').toLowerCase()
    return p.dealtype === 'existingbusiness' && !stage.includes('closed')
  })

  const pipelineAmount = expansionDeals.reduce((sum, d) => sum + (Number(d.properties.amount) || 0), 0)

  return {
    pipelineAmount,
    deals: expansionDeals.slice(0, 5).map(d => ({
      id: d.id,
      name: d.properties.dealname || 'Untitled deal',
      amount: Number(d.properties.amount) || 0,
      stage: d.properties.dealstage || 'Unknown',
    })),
    demo: !connected,
  }
}
