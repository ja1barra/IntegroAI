import type { TestResult } from './types'
import { keyToTokens } from './oauth'

const PROXY = '/api/integrations/intercom'

export function isDemoToken(t: string): boolean {
  return !t || t.includes('demo') || t.includes('xxxx')
}

function getToken(credential: string): string {
  return keyToTokens(credential)?.access_token ?? credential
}

async function proxyCall(endpoint: string, credential: string): Promise<Response> {
  return fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, accessToken: getToken(credential) }),
  })
}

export async function testConnection(credential: string): Promise<TestResult> {
  if (isDemoToken(credential)) {
    await new Promise(r => setTimeout(r, 750))
    return { ok: true, data: { total: 4280 } }
  }
  try {
    const res = await proxyCall('/me', credential)
    if (res.status === 401) return { ok: false, error: 'OAuth token expired — reconnect Intercom' }
    if (!res.ok) return { ok: false, error: `Intercom API error ${res.status}` }
    const data = await res.json() as { app?: { id_code: string; name: string } }
    return { ok: true, data: { total: 0, team: data.app?.name } }
  } catch (err) {
    return { ok: false, error: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

export async function fetchContacts(credential: string): Promise<IntercomContact[]> {
  if (isDemoToken(credential)) return MOCK_INTERCOM_CONTACTS
  const res = await proxyCall('/contacts?per_page=50', credential)
  if (!res.ok) throw new Error(`Intercom API ${res.status}`)
  const data = await res.json() as { data: IntercomContact[] }
  return data.data ?? []
}

export async function fetchConversations(credential: string): Promise<IntercomConversation[]> {
  if (isDemoToken(credential)) return MOCK_INTERCOM_CONVERSATIONS
  const res = await proxyCall('/conversations?per_page=50', credential)
  if (!res.ok) throw new Error(`Intercom API ${res.status}`)
  const data = await res.json() as { conversations: IntercomConversation[] }
  return data.conversations ?? []
}

export interface IntercomContact {
  id: string
  email: string
  name: string
  role: 'user' | 'lead'
  custom_attributes: Record<string, string>
  created_at: number
  last_seen_at?: number
}

export interface IntercomConversation {
  id: string
  title?: string
  state: 'open' | 'closed' | 'snoozed'
  created_at: number
  updated_at: number
  assignee?: { name: string }
  contacts: { contacts: { id: string }[] }
}

const MOCK_INTERCOM_CONTACTS: IntercomContact[] = [
  { id: 'ic1', email: 'sarah@acmecorp.com', name: 'Sarah Chen', role: 'user', custom_attributes: { plan: 'enterprise' }, created_at: 1716000000, last_seen_at: 1716580000 },
  { id: 'ic2', email: 'marcus@techflow.io', name: 'Marcus Rodriguez', role: 'user', custom_attributes: { plan: 'growth' }, created_at: 1714000000, last_seen_at: 1716500000 },
  { id: 'ic3', email: 'emily@growthlab.com', name: 'Emily Park', role: 'user', custom_attributes: { plan: 'starter' }, created_at: 1712000000, last_seen_at: 1716200000 },
  { id: 'ic4', email: 'trial@cloudpilot.dev', name: 'Lisa Wang', role: 'lead', custom_attributes: { plan: 'trial' }, created_at: 1716400000 },
  { id: 'ic5', email: 'james@scalepro.io', name: 'James Wilson', role: 'user', custom_attributes: { plan: 'growth' }, created_at: 1710000000, last_seen_at: 1716100000 },
]

const MOCK_INTERCOM_CONVERSATIONS: IntercomConversation[] = [
  { id: 'conv1', title: 'Integration not syncing', state: 'open', created_at: 1716500000, updated_at: 1716580000, assignee: { name: 'Support' }, contacts: { contacts: [{ id: 'ic1' }] } },
  { id: 'conv2', title: 'Upgrade plan question', state: 'closed', created_at: 1716300000, updated_at: 1716400000, assignee: { name: 'Sales' }, contacts: { contacts: [{ id: 'ic4' }] } },
  { id: 'conv3', title: 'Feature request — bulk export', state: 'open', created_at: 1716100000, updated_at: 1716200000, assignee: { name: 'Product' }, contacts: { contacts: [{ id: 'ic2' }] } },
]
