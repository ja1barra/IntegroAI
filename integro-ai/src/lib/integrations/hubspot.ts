import type { HubSpotContact, HubSpotDeal, TestResult } from './types'
import { MOCK_HUBSPOT_CONTACTS, MOCK_HUBSPOT_DEALS } from './mock'

const BASE = 'https://api.hubapi.com'

function isDemoKey(key: string): boolean {
  return key.includes('demo') || key.includes('xxxx') || key.startsWith('pat-demo')
}

export async function fetchContacts(apiKey: string): Promise<HubSpotContact[]> {
  if (isDemoKey(apiKey)) return MOCK_HUBSPOT_CONTACTS
  const res = await fetch(
    `${BASE}/crm/v3/objects/contacts?limit=50&properties=firstname,lastname,email,jobtitle,company`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  )
  if (!res.ok) throw new Error(`HubSpot API ${res.status}: ${res.statusText}`)
  const data = await res.json() as { results: HubSpotContact[] }
  return data.results
}

export async function fetchDeals(apiKey: string): Promise<HubSpotDeal[]> {
  if (isDemoKey(apiKey)) return MOCK_HUBSPOT_DEALS
  const res = await fetch(
    `${BASE}/crm/v3/objects/deals?limit=50&properties=dealname,amount,dealstage,closedate`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  )
  if (!res.ok) throw new Error(`HubSpot API ${res.status}: ${res.statusText}`)
  const data = await res.json() as { results: HubSpotDeal[] }
  return data.results
}

export async function testConnection(apiKey: string): Promise<TestResult> {
  if (isDemoKey(apiKey)) {
    await new Promise(r => setTimeout(r, 900))
    return { ok: true, data: { total: 1247 } }
  }
  try {
    const res = await fetch(`${BASE}/crm/v3/objects/contacts?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.status === 401) return { ok: false, error: 'Invalid token — verify your Private App Token in HubSpot' }
    if (res.status === 403) return { ok: false, error: 'Forbidden — check that your app has CRM object scopes enabled' }
    if (!res.ok) return { ok: false, error: `HubSpot API error ${res.status}` }
    const data = await res.json() as { total: number }
    return { ok: true, data: { total: data.total } }
  } catch {
    return { ok: false, error: 'Network error — HubSpot API requires a server-side proxy for browser calls. Use demo key (pat-demo-xxxx) to preview.' }
  }
}
