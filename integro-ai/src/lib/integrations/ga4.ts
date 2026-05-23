import type { TestResult } from './types'
import { keyToTokens } from './oauth'

const PROXY = '/api/integrations/ga4'

export function isDemoToken(t: string): boolean {
  return !t || t.includes('demo') || t.includes('xxxx')
}

function getToken(credential: string): string {
  return keyToTokens(credential)?.access_token ?? credential
}

async function proxyCall(endpoint: string, credential: string, body?: object): Promise<Response> {
  return fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint, accessToken: getToken(credential), body }),
  })
}

export async function testConnection(credential: string): Promise<TestResult> {
  if (isDemoToken(credential)) {
    await new Promise(r => setTimeout(r, 750))
    return { ok: true, data: { total: 28400 } }
  }
  try {
    const res = await proxyCall('/v1beta/accountSummaries', credential)
    if (res.status === 401) return { ok: false, error: 'OAuth token expired — reconnect Google Analytics' }
    if (res.status === 403) return { ok: false, error: 'Insufficient permissions — ensure GA4 API is enabled in Google Cloud' }
    if (!res.ok) return { ok: false, error: `GA4 API error ${res.status}` }
    const data = await res.json() as { accountSummaries?: { propertySummaries?: unknown[] }[] }
    const propCount = data.accountSummaries?.reduce((acc, a) => acc + (a.propertySummaries?.length ?? 0), 0) ?? 0
    return { ok: true, data: { total: propCount } }
  } catch (err) {
    return { ok: false, error: `Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

export async function fetchProperties(credential: string): Promise<GA4Property[]> {
  if (isDemoToken(credential)) return MOCK_GA4_PROPERTIES
  const res = await proxyCall('/v1beta/accountSummaries', credential)
  if (!res.ok) throw new Error(`GA4 API ${res.status}`)
  const data = await res.json() as { accountSummaries?: { name: string; displayName: string; propertySummaries?: { property: string; displayName: string }[] }[] }
  const props: GA4Property[] = []
  for (const account of data.accountSummaries ?? []) {
    for (const p of account.propertySummaries ?? []) {
      props.push({ id: p.property, name: p.displayName, account: account.displayName })
    }
  }
  return props
}

export async function runReport(credential: string, propertyId: string): Promise<GA4Report> {
  if (isDemoToken(credential)) return MOCK_GA4_REPORT
  const res = await proxyCall(`/v1beta/${propertyId}:runReport`, credential, {
    dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'sessionDefaultChannelGrouping' }],
    metrics: [{ name: 'sessions' }, { name: 'conversions' }, { name: 'totalRevenue' }],
  })
  if (!res.ok) throw new Error(`GA4 API ${res.status}`)
  return res.json() as Promise<GA4Report>
}

export interface GA4Property {
  id: string
  name: string
  account: string
}

export interface GA4Report {
  dimensionHeaders?: { name: string }[]
  metricHeaders?: { name: string }[]
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[]
}

const MOCK_GA4_PROPERTIES: GA4Property[] = [
  { id: 'properties/123456789', name: 'IntegroAI — Production', account: 'Integro Strategies' },
  { id: 'properties/987654321', name: 'IntegroAI — Staging', account: 'Integro Strategies' },
]

const MOCK_GA4_REPORT: GA4Report = {
  dimensionHeaders: [{ name: 'sessionDefaultChannelGrouping' }],
  metricHeaders: [{ name: 'sessions' }, { name: 'conversions' }, { name: 'totalRevenue' }],
  rows: [
    { dimensionValues: [{ value: 'Organic Search' }], metricValues: [{ value: '12400' }, { value: '287' }, { value: '48600' }] },
    { dimensionValues: [{ value: 'Direct' }], metricValues: [{ value: '8200' }, { value: '198' }, { value: '34200' }] },
    { dimensionValues: [{ value: 'Paid Search' }], metricValues: [{ value: '4800' }, { value: '142' }, { value: '27800' }] },
    { dimensionValues: [{ value: 'Email' }], metricValues: [{ value: '3000' }, { value: '89' }, { value: '18400' }] },
  ],
}
