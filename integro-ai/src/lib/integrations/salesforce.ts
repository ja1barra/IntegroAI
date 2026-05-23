import type { TestResult } from './types'
import { keyToTokens } from './oauth'

const PROXY = '/api/integrations/salesforce'

export function isDemoToken(t: string): boolean {
  return !t || t.includes('demo') || t.includes('xxxx')
}

function extractTokens(credential: string) {
  const parsed = keyToTokens(credential)
  return {
    access_token: parsed?.access_token ?? credential,
    instance_url: parsed?.instance_url ?? 'https://login.salesforce.com',
  }
}

async function proxyCall(endpoint: string, credential: string): Promise<Response> {
  const { access_token, instance_url } = extractTokens(credential)
  return fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, accessToken: access_token, instanceUrl: instance_url }),
  })
}

export async function testConnection(credential: string): Promise<TestResult> {
  if (isDemoToken(credential)) {
    await new Promise(r => setTimeout(r, 800))
    return { ok: true, data: { total: 2156 } }
  }
  try {
    const res = await proxyCall('/services/data/v59.0/limits', credential)
    if (res.status === 401) return { ok: false, error: 'OAuth token expired — reconnect Salesforce' }
    if (!res.ok) return { ok: false, error: `Salesforce API error ${res.status}` }
    const data = await res.json() as { DailyApiRequests?: { Remaining: number } }
    return { ok: true, data: { total: data.DailyApiRequests?.Remaining } }
  } catch (err) {
    return { ok: false, error: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

export async function fetchContacts(credential: string): Promise<SalesforceContact[]> {
  if (isDemoToken(credential)) return MOCK_SALESFORCE_CONTACTS
  const query = encodeURIComponent('SELECT Id,Name,Email,Title,Account.Name FROM Contact LIMIT 50')
  const res = await proxyCall(`/services/data/v59.0/query?q=${query}`, credential)
  if (!res.ok) throw new Error(`Salesforce API ${res.status}`)
  const data = await res.json() as { records: SalesforceContact[] }
  return data.records ?? []
}

export async function fetchOpportunities(credential: string): Promise<SalesforceOpportunity[]> {
  if (isDemoToken(credential)) return MOCK_SALESFORCE_OPPS
  const query = encodeURIComponent('SELECT Id,Name,Amount,StageName,CloseDate,Account.Name FROM Opportunity LIMIT 50')
  const res = await proxyCall(`/services/data/v59.0/query?q=${query}`, credential)
  if (!res.ok) throw new Error(`Salesforce API ${res.status}`)
  const data = await res.json() as { records: SalesforceOpportunity[] }
  return data.records ?? []
}

export interface SalesforceContact {
  Id: string
  Name: string
  Email: string
  Title: string
  Account: { Name: string }
}

export interface SalesforceOpportunity {
  Id: string
  Name: string
  Amount: number
  StageName: string
  CloseDate: string
  Account: { Name: string }
}

const MOCK_SALESFORCE_CONTACTS: SalesforceContact[] = [
  { Id: 'sf1', Name: 'Sarah Chen', Email: 'sarah@acmecorp.com', Title: 'VP Sales', Account: { Name: 'Acme Corp' } },
  { Id: 'sf2', Name: 'Marcus Rodriguez', Email: 'marcus@techflow.io', Title: 'Head of Revenue', Account: { Name: 'TechFlow' } },
  { Id: 'sf3', Name: 'Emily Park', Email: 'emily@growthlab.com', Title: 'CEO', Account: { Name: 'GrowthLab' } },
  { Id: 'sf4', Name: 'James Wilson', Email: 'james@scalepro.io', Title: 'VP Marketing', Account: { Name: 'ScalePro' } },
  { Id: 'sf5', Name: 'Priya Sharma', Email: 'priya@datastack.co', Title: 'Head of GTM', Account: { Name: 'DataStack' } },
  { Id: 'sf6', Name: 'Alex Turner', Email: 'alex@revops.xyz', Title: 'RevOps Director', Account: { Name: 'RevOps.xyz' } },
]

const MOCK_SALESFORCE_OPPS: SalesforceOpportunity[] = [
  { Id: 'op1', Name: 'Acme Corp — Enterprise', Amount: 48000, StageName: 'Closed Won', CloseDate: '2025-06-15', Account: { Name: 'Acme Corp' } },
  { Id: 'op2', Name: 'TechFlow — Growth', Amount: 24000, StageName: 'Proposal/Price Quote', CloseDate: '2025-07-01', Account: { Name: 'TechFlow' } },
  { Id: 'op3', Name: 'DataStack — Enterprise', Amount: 96000, StageName: 'Negotiation/Review', CloseDate: '2025-06-20', Account: { Name: 'DataStack' } },
  { Id: 'op4', Name: 'CloudPilot — Growth', Amount: 36000, StageName: 'Value Proposition', CloseDate: '2025-07-15', Account: { Name: 'CloudPilot' } },
]
