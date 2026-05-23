import type { TestResult } from './types'

const PROXY = '/api/integrations/gong'

export function isDemoKey(key: string): boolean {
  return !key || key.includes('demo') || key.includes('xxxx')
}

// Gong uses Basic auth: base64(accessKey:accessKeySecret)
// Stored credential format: "accessKey:accessKeySecret"
function parseCredential(credential: string): { accessKey: string; accessSecret: string } | null {
  const parts = credential.split(':')
  if (parts.length < 2) return null
  const accessKey = parts[0]
  const accessSecret = parts.slice(1).join(':')
  return { accessKey, accessSecret }
}

async function proxyCall(endpoint: string, credential: string): Promise<Response> {
  const parsed = parseCredential(credential)
  return fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint,
      accessKey: parsed?.accessKey ?? credential,
      accessSecret: parsed?.accessSecret ?? '',
    }),
  })
}

export async function testConnection(credential: string): Promise<TestResult> {
  if (isDemoKey(credential)) {
    await new Promise(r => setTimeout(r, 800))
    return { ok: true, data: { total: 847 } }
  }
  try {
    const res = await proxyCall('/v2/calls?limit=1', credential)
    if (res.status === 401) return { ok: false, error: 'Invalid Gong credentials — check your Access Key and Secret' }
    if (!res.ok) return { ok: false, error: `Gong API error ${res.status}` }
    const data = await res.json() as { records?: { totalRecords: number } }
    return { ok: true, data: { total: data.records?.totalRecords } }
  } catch (err) {
    return { ok: false, error: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

export async function fetchCalls(credential: string): Promise<GongCall[]> {
  if (isDemoKey(credential)) return MOCK_GONG_CALLS
  const res = await proxyCall('/v2/calls?limit=50', credential)
  if (!res.ok) throw new Error(`Gong API ${res.status}`)
  const data = await res.json() as { calls: GongCall[] }
  return data.calls ?? []
}

export interface GongCall {
  id: string
  title: string
  started: string
  duration: number
  direction: string
  disposition?: string
  primaryUserId?: string
  parties?: { name: string; title?: string; affiliation: string }[]
}

const MOCK_GONG_CALLS: GongCall[] = [
  { id: 'gc1', title: 'Acme Corp — Discovery Call', started: '2025-05-22T14:00:00Z', duration: 2820, direction: 'OUTBOUND', disposition: 'Interested', parties: [{ name: 'Sarah Chen', title: 'VP Sales', affiliation: 'External' }] },
  { id: 'gc2', title: 'TechFlow — Demo', started: '2025-05-21T16:30:00Z', duration: 3600, direction: 'OUTBOUND', disposition: 'Demo Scheduled', parties: [{ name: 'Marcus Rodriguez', title: 'Head of Revenue', affiliation: 'External' }] },
  { id: 'gc3', title: 'DataStack — Negotiation', started: '2025-05-20T11:00:00Z', duration: 2100, direction: 'INBOUND', disposition: 'Contract Sent', parties: [{ name: 'Priya Sharma', title: 'Head of GTM', affiliation: 'External' }] },
  { id: 'gc4', title: 'CloudPilot — QBR', started: '2025-05-19T15:00:00Z', duration: 4200, direction: 'OUTBOUND', disposition: 'At Risk', parties: [{ name: 'Lisa Wang', title: 'CRO', affiliation: 'External' }] },
  { id: 'gc5', title: 'ScalePro — Onboarding', started: '2025-05-18T10:00:00Z', duration: 1800, direction: 'INBOUND', disposition: 'Healthy', parties: [{ name: 'James Wilson', title: 'VP Marketing', affiliation: 'External' }] },
]
