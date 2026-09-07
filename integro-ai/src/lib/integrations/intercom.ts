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

// last_seen_at values are relative to "now" so the recency component of
// health scoring (see lib/success/accounts.ts) reacts to something real in
// demo mode, the same way the other agents' mock data stays "live-looking".
function secondsAgo(daysBack: number): number {
  return Math.floor((Date.now() - daysBack * 24 * 60 * 60 * 1000) / 1000)
}

const MOCK_INTERCOM_CONTACTS: IntercomContact[] = [
  { id: 'ic1', email: 'sarah@acmecorp.com', name: 'Sarah Chen', role: 'user', custom_attributes: { plan: 'enterprise', company: 'Acme Corp' }, created_at: secondsAgo(120), last_seen_at: secondsAgo(1) },
  { id: 'ic2', email: 'marcus@techflow.io', name: 'Marcus Rodriguez', role: 'user', custom_attributes: { plan: 'growth', company: 'TechFlow' }, created_at: secondsAgo(200), last_seen_at: secondsAgo(4) },
  { id: 'ic3', email: 'emily@growthlab.com', name: 'Emily Park', role: 'user', custom_attributes: { plan: 'starter', company: 'GrowthLab' }, created_at: secondsAgo(90), last_seen_at: secondsAgo(22) },
  { id: 'ic4', email: 'trial@cloudpilot.dev', name: 'Lisa Wang', role: 'lead', custom_attributes: { plan: 'trial', company: 'CloudPilot' }, created_at: secondsAgo(3) },
  { id: 'ic5', email: 'james@scalepro.io', name: 'James Wilson', role: 'user', custom_attributes: { plan: 'growth', company: 'ScalePro' }, created_at: secondsAgo(260), last_seen_at: secondsAgo(45) },
  { id: 'ic6', email: 'nina@scalex.ai', name: 'Nina Okafor', role: 'user', custom_attributes: { plan: 'enterprise', company: 'ScaleX AI' }, created_at: secondsAgo(150), last_seen_at: secondsAgo(60) },
]

const MOCK_INTERCOM_CONVERSATIONS: IntercomConversation[] = [
  { id: 'conv1', title: 'Integration not syncing', state: 'open', created_at: secondsAgo(6), updated_at: secondsAgo(1), assignee: { name: 'Support' }, contacts: { contacts: [{ id: 'ic5' }] } },
  { id: 'conv2', title: 'Upgrade plan question', state: 'closed', created_at: secondsAgo(9), updated_at: secondsAgo(8), assignee: { name: 'Sales' }, contacts: { contacts: [{ id: 'ic4' }] } },
  { id: 'conv3', title: 'Feature request — bulk export', state: 'open', created_at: secondsAgo(3), updated_at: secondsAgo(2), assignee: { name: 'Product' }, contacts: { contacts: [{ id: 'ic2' }] } },
  { id: 'conv4', title: 'Billing discrepancy', state: 'open', created_at: secondsAgo(12), updated_at: secondsAgo(5), assignee: { name: 'Support' }, contacts: { contacts: [{ id: 'ic6' }] } },
]
