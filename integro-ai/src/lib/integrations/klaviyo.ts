import type { TestResult } from './types'

const BASE = 'https://a.klaviyo.com/api'
const REVISION = '2024-02-15'

export interface KlaviyoList {
  id: string
  attributes: {
    name: string
    created: string
    updated: string
    profile_count?: number
  }
}

export interface KlaviyoCampaign {
  id: string
  attributes: {
    name: string
    status: string
    created_at: string
    send_time?: string
  }
}

function isDemoKey(key: string): boolean {
  return !key || key.includes('demo') || key.includes('xxxx') || key.startsWith('pk_demo')
}

function headers(apiKey: string) {
  return {
    Authorization: `Klaviyo-API-Key ${apiKey}`,
    revision: REVISION,
    accept: 'application/json',
  }
}

export async function fetchLists(apiKey: string): Promise<KlaviyoList[]> {
  if (isDemoKey(apiKey)) return MOCK_KLAVIYO_LISTS
  const res = await fetch(`${BASE}/lists/?page[size]=50`, { headers: headers(apiKey) })
  if (!res.ok) throw new Error(`Klaviyo API ${res.status}: ${res.statusText}`)
  const data = await res.json() as { data: KlaviyoList[] }
  return data.data ?? []
}

export async function fetchCampaigns(apiKey: string): Promise<KlaviyoCampaign[]> {
  if (isDemoKey(apiKey)) return MOCK_KLAVIYO_CAMPAIGNS
  const res = await fetch(`${BASE}/campaigns/?filter=equals(messages.channel,'email')&page[size]=50`, {
    headers: headers(apiKey),
  })
  if (!res.ok) throw new Error(`Klaviyo API ${res.status}: ${res.statusText}`)
  const data = await res.json() as { data: KlaviyoCampaign[] }
  return data.data ?? []
}

export async function testConnection(apiKey: string): Promise<TestResult> {
  if (isDemoKey(apiKey)) {
    await new Promise(r => setTimeout(r, 700))
    return { ok: true, data: { total: 12840 } }
  }
  try {
    const res = await fetch(`${BASE}/lists/?page[size]=1`, { headers: headers(apiKey) })
    if (res.status === 401) return { ok: false, error: 'Invalid API key — check your Klaviyo account Settings → API Keys' }
    if (res.status === 403) return { ok: false, error: 'Forbidden — ensure your Private API Key has list read permissions' }
    if (!res.ok) return { ok: false, error: `Klaviyo API error ${res.status}` }
    const data = await res.json() as { data: unknown[] }
    return { ok: true, data: { total: data.data?.length } }
  } catch (err) {
    return { ok: false, error: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

const MOCK_KLAVIYO_LISTS: KlaviyoList[] = [
  { id: 'l1', attributes: { name: 'All Subscribers', created: '2025-01-01', updated: '2025-05-20', profile_count: 12840 } },
  { id: 'l2', attributes: { name: 'Active Customers', created: '2025-01-15', updated: '2025-05-18', profile_count: 4230 } },
  { id: 'l3', attributes: { name: 'Trial Users', created: '2025-02-01', updated: '2025-05-19', profile_count: 1876 } },
  { id: 'l4', attributes: { name: 'Churned — Win Back', created: '2025-03-01', updated: '2025-05-10', profile_count: 892 } },
]

const MOCK_KLAVIYO_CAMPAIGNS: KlaviyoCampaign[] = [
  { id: 'c1', attributes: { name: 'May Product Update', status: 'sent', created_at: '2025-05-01', send_time: '2025-05-05' } },
  { id: 'c2', attributes: { name: 'Customer Onboarding — Week 1', status: 'active', created_at: '2025-04-15' } },
  { id: 'c3', attributes: { name: 'Win-Back — Q2', status: 'draft', created_at: '2025-05-10' } },
  { id: 'c4', attributes: { name: 'Feature Announcement — AI Agents', status: 'scheduled', created_at: '2025-05-15', send_time: '2025-05-25' } },
]
