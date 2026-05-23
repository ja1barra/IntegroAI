import type { ApolloContact, TestResult } from './types'
import { MOCK_APOLLO_CONTACTS } from './mock'

const PROXY = '/api/integrations/apollo'

export function isDemoKey(key: string): boolean {
  return !key || key.includes('demo') || key.includes('xxxx') || key.startsWith('ap_demo')
}

async function proxyCall(
  endpoint: string,
  apiKey: string,
  options?: { httpMethod?: string; body?: object }
): Promise<Response> {
  const httpMethod = options?.httpMethod ?? 'POST'
  // Try Vercel proxy first (avoids CORS when deployed)
  try {
    const r = await fetch(PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, apiKey, httpMethod, body: options?.body }),
    })
    if (r.status !== 404) return r
  } catch {
    // Proxy not reachable — fall through to direct call
  }
  // Direct browser call fallback (Apollo API supports CORS)
  const base = 'https://api.apollo.io'
  const url = `${base}${endpoint}`
  if (httpMethod === 'GET') {
    return fetch(url, { headers: { 'X-Api-Key': apiKey } })
  }
  return fetch(url, {
    method: httpMethod,
    headers: { 'Content-Type': 'application/json', 'X-Api-Key': apiKey },
    ...(options?.body && { body: JSON.stringify(options.body) }),
  })
}

export async function fetchContacts(apiKey: string): Promise<ApolloContact[]> {
  if (isDemoKey(apiKey)) return MOCK_APOLLO_CONTACTS
  const res = await proxyCall('/v1/contacts/search', apiKey, { body: { per_page: 50 } })
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
    const res = await proxyCall('/v1/auth/health', apiKey, { httpMethod: 'GET' })
    if (res.status === 401) {
      return { ok: false, error: 'Invalid API key — check your Apollo.io account Settings → API Keys' }
    }
    if (!res.ok) return { ok: false, error: `Apollo API error ${res.status}` }
    const data = await res.json() as { credits_used?: number; credits_limit?: number; is_logged_in?: boolean }
    if (data.is_logged_in === false) {
      return { ok: false, error: 'Invalid API key — check your Apollo.io account Settings → API Keys' }
    }
    return { ok: true, data: { credits_used: data.credits_used, credits_limit: data.credits_limit } }
  } catch (err) {
    return { ok: false, error: `Proxy error: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}
