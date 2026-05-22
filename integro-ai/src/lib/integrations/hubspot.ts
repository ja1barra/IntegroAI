import type { HubSpotContact, HubSpotDeal, TestResult } from './types'
import { MOCK_HUBSPOT_CONTACTS, MOCK_HUBSPOT_DEALS } from './mock'

const BASE = 'https://api.hubapi.com'
const PROXY = '/api/integrations/hubspot'

export function isDemoKey(key: string): boolean {
  return !key || key.includes('demo') || key.includes('xxxx') || key.startsWith('pat-demo')
}

async function proxyGet(endpoint: string, apiKey: string): Promise<Response> {
  // Try Vercel proxy first (avoids any CORS edge cases)
  try {
    const r = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, apiKey, httpMethod: 'GET' }),
    })
    // 404 means proxy isn't deployed yet — fall through to direct call
    if (r.status !== 404) return r
  } catch {
    // Proxy not reachable (local dev without vercel dev) — fall through
  }
  // Direct browser call (HubSpot v3 CRM API supports CORS with private app tokens)
  return fetch(`${BASE}${endpoint}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
}

export async function fetchContacts(apiKey: string): Promise<HubSpotContact[]> {
  if (isDemoKey(apiKey)) return MOCK_HUBSPOT_CONTACTS
  const res = await proxyGet(
    '/crm/v3/objects/contacts?limit=50&properties=firstname,lastname,email,jobtitle,company',
    apiKey
  )
  if (!res.ok) throw new Error(`HubSpot API ${res.status}: ${res.statusText}`)
  const data = await res.json() as { results: HubSpotContact[] }
  return data.results ?? []
}

export async function fetchDeals(apiKey: string): Promise<HubSpotDeal[]> {
  if (isDemoKey(apiKey)) return MOCK_HUBSPOT_DEALS
  const res = await proxyGet(
    '/crm/v3/objects/deals?limit=50&properties=dealname,amount,dealstage,closedate',
    apiKey
  )
  if (!res.ok) throw new Error(`HubSpot API ${res.status}: ${res.statusText}`)
  const data = await res.json() as { results: HubSpotDeal[] }
  return data.results ?? []
}

export async function testConnection(apiKey: string): Promise<TestResult> {
  if (isDemoKey(apiKey)) {
    await new Promise(r => setTimeout(r, 900))
    return { ok: true, data: { total: 1247 } }
  }
  try {
    const res = await proxyGet('/crm/v3/objects/contacts?limit=1', apiKey)
    if (res.status === 401) return { ok: false, error: 'Invalid token — verify your Private App Token in HubSpot' }
    if (res.status === 403) return { ok: false, error: 'Forbidden — check that your app has CRM object scopes enabled' }
    if (!res.ok) return { ok: false, error: `HubSpot API error ${res.status}` }
    const data = await res.json() as { total: number }
    return { ok: true, data: { total: data.total } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { ok: false, error: `Connection failed: ${msg}` }
  }
}
