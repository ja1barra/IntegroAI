import type { TestResult } from './types'
import { keyToTokens } from './oauth'

const PROXY = '/api/integrations/outreach'

export function isDemoToken(t: string): boolean {
  return !t || t.includes('demo') || t.includes('xxxx')
}

function getToken(credential: string): string {
  return keyToTokens(credential)?.access_token ?? credential
}

async function proxyCall(endpoint: string, credential: string, method = 'GET'): Promise<Response> {
  return fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, accessToken: getToken(credential), httpMethod: method }),
  })
}

export async function testConnection(credential: string): Promise<TestResult> {
  if (isDemoToken(credential)) {
    await new Promise(r => setTimeout(r, 700))
    return { ok: true, data: { total: 3840 } }
  }
  try {
    const res = await proxyCall('/api/v2/prospects?count=true&page[size]=1', credential)
    if (res.status === 401) return { ok: false, error: 'OAuth token expired — reconnect Outreach' }
    if (!res.ok) return { ok: false, error: `Outreach API error ${res.status}` }
    const data = await res.json() as { meta?: { count?: number } }
    return { ok: true, data: { total: data.meta?.count } }
  } catch (err) {
    return { ok: false, error: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

export async function fetchProspects(credential: string): Promise<OutreachProspect[]> {
  if (isDemoToken(credential)) return MOCK_OUTREACH_PROSPECTS
  const res = await proxyCall('/api/v2/prospects?page[size]=50', credential)
  if (!res.ok) throw new Error(`Outreach API ${res.status}`)
  const data = await res.json() as { data: OutreachProspect[] }
  return data.data ?? []
}

export async function fetchSequences(credential: string): Promise<OutreachSequence[]> {
  if (isDemoToken(credential)) return MOCK_OUTREACH_SEQUENCES
  const res = await proxyCall('/api/v2/sequences?page[size]=50', credential)
  if (!res.ok) throw new Error(`Outreach API ${res.status}`)
  const data = await res.json() as { data: OutreachSequence[] }
  return data.data ?? []
}

export interface OutreachProspect {
  id: string
  attributes: {
    firstName: string
    lastName: string
    emails: string[]
    title: string
    company: string
  }
}

export interface OutreachSequence {
  id: string
  attributes: {
    name: string
    enabled: boolean
    numSteps: number
    openCount: number
    clickCount: number
    replyCount: number
  }
}

const MOCK_OUTREACH_PROSPECTS: OutreachProspect[] = [
  { id: 'op1', attributes: { firstName: 'Daniel', lastName: 'Foster', emails: ['d.foster@syntheticai.com'], title: 'CTO', company: 'SyntheticAI' } },
  { id: 'op2', attributes: { firstName: 'Rachel', lastName: 'Kim', emails: ['r.kim@nexastack.io'], title: 'Head of Growth', company: 'NexaStack' } },
  { id: 'op3', attributes: { firstName: 'Carlos', lastName: 'Vega', emails: ['cvega@pulsehq.com'], title: 'VP Engineering', company: 'PulseHQ' } },
  { id: 'op4', attributes: { firstName: 'Nina', lastName: 'Patel', emails: ['nina@stackwise.io'], title: 'CEO', company: 'StackWise' } },
  { id: 'op5', attributes: { firstName: 'Owen', lastName: 'Miller', emails: ['o.miller@driftlab.com'], title: 'Director of Sales', company: 'DriftLab' } },
]

const MOCK_OUTREACH_SEQUENCES: OutreachSequence[] = [
  { id: 'sq1', attributes: { name: 'Q2 Enterprise Outbound', enabled: true, numSteps: 7, openCount: 284, clickCount: 67, replyCount: 38 } },
  { id: 'sq2', attributes: { name: 'Mid-Market Cold — May', enabled: true, numSteps: 5, openCount: 412, clickCount: 89, replyCount: 52 } },
  { id: 'sq3', attributes: { name: 'Trial Expired Win-Back', enabled: false, numSteps: 4, openCount: 186, clickCount: 34, replyCount: 21 } },
  { id: 'sq4', attributes: { name: 'Inbound Demo Follow-Up', enabled: true, numSteps: 3, openCount: 567, clickCount: 134, replyCount: 89 } },
]
