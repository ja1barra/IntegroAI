import type { TestResult } from './types'
import { keyToTokens } from './oauth'

const PROXY = '/api/integrations/linkedin'

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
    return { ok: true, data: { total: 500 } }
  }
  try {
    const res = await proxyCall('/v2/me', credential)
    if (res.status === 401) return { ok: false, error: 'OAuth token expired — reconnect LinkedIn' }
    if (res.status === 403) return { ok: false, error: 'Insufficient permissions — verify your LinkedIn app scopes' }
    if (!res.ok) return { ok: false, error: `LinkedIn API error ${res.status}` }
    const data = await res.json() as { id?: string; localizedFirstName?: string }
    return { ok: true, data: { total: data.id ? 1 : 0 } }
  } catch (err) {
    return { ok: false, error: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

export async function fetchProfile(credential: string): Promise<LinkedInProfile | null> {
  if (isDemoToken(credential)) return MOCK_LINKEDIN_PROFILE
  const res = await proxyCall('/v2/me?projection=(id,localizedFirstName,localizedLastName,profilePicture)', credential)
  if (!res.ok) return null
  return res.json() as Promise<LinkedInProfile>
}

export async function fetchConnections(credential: string): Promise<LinkedInConnection[]> {
  if (isDemoToken(credential)) return MOCK_LINKEDIN_CONNECTIONS
  // LinkedIn restricts connections API — returns demo data for now
  return MOCK_LINKEDIN_CONNECTIONS
}

export interface LinkedInProfile {
  id: string
  localizedFirstName: string
  localizedLastName: string
  profilePicture?: { displayImage: string }
}

export interface LinkedInConnection {
  id: string
  firstName: string
  lastName: string
  headline: string
  company: string
}

const MOCK_LINKEDIN_PROFILE: LinkedInProfile = {
  id: 'li_001',
  localizedFirstName: 'Jay',
  localizedLastName: 'Ibarra',
}

const MOCK_LINKEDIN_CONNECTIONS: LinkedInConnection[] = [
  { id: 'lc1', firstName: 'Sarah', lastName: 'Chen', headline: 'VP of Sales @ Acme Corp', company: 'Acme Corp' },
  { id: 'lc2', firstName: 'Marcus', lastName: 'Rodriguez', headline: 'Head of Revenue @ TechFlow', company: 'TechFlow' },
  { id: 'lc3', firstName: 'Emily', lastName: 'Park', headline: 'CEO @ GrowthLab', company: 'GrowthLab' },
  { id: 'lc4', firstName: 'James', lastName: 'Wilson', headline: 'VP Marketing @ ScalePro', company: 'ScalePro' },
  { id: 'lc5', firstName: 'Priya', lastName: 'Sharma', headline: 'Head of GTM @ DataStack', company: 'DataStack' },
]
