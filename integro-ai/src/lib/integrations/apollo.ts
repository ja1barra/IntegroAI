import type { ApolloContact, TestResult } from './types'
import { MOCK_APOLLO_CONTACTS } from './mock'

const BASE = 'https://api.apollo.io'

function isDemoKey(key: string): boolean {
  return key.includes('demo') || key.includes('xxxx') || key.startsWith('ap_demo')
}

export async function fetchContacts(apiKey: string): Promise<ApolloContact[]> {
  if (isDemoKey(apiKey)) return MOCK_APOLLO_CONTACTS
  const res = await fetch(`${BASE}/v1/contacts/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({ per_page: 50 }),
  })
  if (!res.ok) throw new Error(`Apollo API ${res.status}: ${res.statusText}`)
  const data = await res.json() as { contacts: ApolloContact[] }
  return data.contacts ?? []
}

export async function testConnection(apiKey: string): Promise<TestResult> {
  if (isDemoKey(apiKey)) {
    await new Promise(r => setTimeout(r, 700))
    return { ok: true, data: { credits_used: 1240, credits_limit: 10000 } }
  }
  try {
    const res = await fetch(`${BASE}/v1/auth/health`, {
      headers: { 'x-api-key': apiKey },
    })
    if (res.status === 401) return { ok: false, error: 'Invalid API key — check your Apollo.io account Settings → API Keys' }
    if (!res.ok) return { ok: false, error: `Apollo API error ${res.status}` }
    const data = await res.json() as { credits_used?: number; credits_limit?: number }
    return { ok: true, data: { credits_used: data.credits_used, credits_limit: data.credits_limit } }
  } catch {
    return { ok: false, error: 'Network error — Apollo API requires a server-side proxy for browser calls. Use demo key (ap_demo_xxxx) to preview.' }
  }
}
