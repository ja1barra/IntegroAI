// ── CRM win/loss summary ─────────────────────────────────────
// Pulls deals/opportunities from connected CRMs (HubSpot / Salesforce)
// and reduces them to a compact win/loss snapshot the AI can reason
// about. Reuses the existing integration libs, which return demo data
// when no live credential is stored — so "Generate from CRM data" is
// always demoable, same as CRM prospect sync in Outbound.

import { supabase } from '../supabase'
import { loadCredential } from '../integrations/credentialStore'
import { fetchDeals as fetchHubSpotDeals } from '../integrations/hubspot'
import { fetchOpportunities as fetchSalesforceOpps } from '../integrations/salesforce'

export interface StageCount {
  stage: string
  count: number
}

export interface CrmSummary {
  totalDeals: number
  wonCount: number
  lostCount: number
  openCount: number
  winRatePct: number | null   // won / (won + lost), null if no closed deals yet
  avgDealSize: number | null
  topOpenStages: StageCount[]
  sampleWonDeals: string[]
  sampleOpenDeals: string[]
  sources: string[]
  demo: boolean
}

async function connectedCrmProviders(): Promise<string[]> {
  const { data } = await supabase
    .from('integrations')
    .select('provider, connected')
    .in('provider', ['hubspot', 'salesforce'])
    .eq('connected', true)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data as any[]) ?? []).map(r => r.provider)
}

function classifyHubSpotStage(stage: string): 'won' | 'lost' | 'open' {
  const s = (stage || '').toLowerCase()
  if (s.includes('closedwon') || s === 'won') return 'won'
  if (s.includes('closedlost') || s === 'lost') return 'lost'
  return 'open'
}

function classifySalesforceStage(stage: string): 'won' | 'lost' | 'open' {
  const s = (stage || '').toLowerCase()
  if (s.includes('closed won')) return 'won'
  if (s.includes('closed lost')) return 'lost'
  return 'open'
}

function prettyStage(raw: string): string {
  if (!raw) return 'Unknown'
  // HubSpot internal stage ids are camelCase, e.g. "presentationscheduled"
  if (!raw.includes(' ')) {
    return raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase())
  }
  return raw
}

export async function buildCrmSummary(): Promise<CrmSummary> {
  const connected = await connectedCrmProviders()
  const sources = new Set<string>()
  const deals: { name: string; amount: number; stage: 'won' | 'lost' | 'open'; stageLabel: string }[] = []

  try {
    const key = (await loadCredential('hubspot')) ?? 'demo'
    const hsDeals = await fetchHubSpotDeals(key)
    for (const d of hsDeals) {
      const p = d.properties
      if (!p) continue
      deals.push({
        name: p.dealname || 'Untitled deal',
        amount: Number(p.amount) || 0,
        stage: classifyHubSpotStage(p.dealstage),
        stageLabel: prettyStage(p.dealstage),
      })
      sources.add('hubspot')
    }
  } catch { /* skip source on failure */ }

  try {
    const key = (await loadCredential('salesforce')) ?? 'demo'
    const opps = await fetchSalesforceOpps(key)
    for (const o of opps) {
      deals.push({
        name: o.Name || 'Untitled opportunity',
        amount: Number(o.Amount) || 0,
        stage: classifySalesforceStage(o.StageName),
        stageLabel: prettyStage(o.StageName),
      })
      sources.add('salesforce')
    }
  } catch { /* skip source on failure */ }

  const won = deals.filter(d => d.stage === 'won')
  const lost = deals.filter(d => d.stage === 'lost')
  const open = deals.filter(d => d.stage === 'open')

  const stageCounts = new Map<string, number>()
  for (const d of open) stageCounts.set(d.stageLabel, (stageCounts.get(d.stageLabel) ?? 0) + 1)
  const topOpenStages: StageCount[] = [...stageCounts.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const dealsWithAmount = deals.filter(d => d.amount > 0)
  const avgDealSize = dealsWithAmount.length
    ? Math.round(dealsWithAmount.reduce((sum, d) => sum + d.amount, 0) / dealsWithAmount.length)
    : null

  return {
    totalDeals: deals.length,
    wonCount: won.length,
    lostCount: lost.length,
    openCount: open.length,
    winRatePct: (won.length + lost.length) > 0
      ? Math.round((won.length / (won.length + lost.length)) * 100)
      : null,
    avgDealSize,
    topOpenStages,
    sampleWonDeals: won.slice(0, 5).map(d => d.name),
    sampleOpenDeals: open.slice(0, 5).map(d => `${d.name} (${d.stageLabel})`),
    sources: [...sources],
    demo: connected.length === 0,
  }
}

// Renders a CrmSummary as readable text for embedding in an AI prompt.
export function summarizeCrmForPrompt(s: CrmSummary): string {
  const lines: string[] = []
  lines.push(`Pipeline snapshot: ${s.totalDeals} deals total — ${s.wonCount} won, ${s.lostCount} lost, ${s.openCount} open.`)
  if (s.winRatePct !== null) lines.push(`Win rate on closed deals: ${s.winRatePct}%.`)
  if (s.avgDealSize !== null) lines.push(`Average deal size: $${s.avgDealSize.toLocaleString()}.`)
  if (s.topOpenStages.length) {
    lines.push(`Open deals are concentrated in: ${s.topOpenStages.map(t => `${t.stage} (${t.count})`).join(', ')}.`)
  }
  if (s.sampleWonDeals.length) lines.push(`Examples of won deals: ${s.sampleWonDeals.join('; ')}.`)
  if (s.sampleOpenDeals.length) lines.push(`Examples of deals currently stuck/open: ${s.sampleOpenDeals.join('; ')}.`)
  if (s.demo) lines.push('(This is demo CRM data — connect HubSpot or Salesforce in Integrations for a playbook grounded in real pipeline data.)')
  return lines.join('\n')
}
