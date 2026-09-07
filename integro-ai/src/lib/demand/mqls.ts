// ── MQL scoring & sourcing ────────────────────────────────────
// Pulls contacts from connected HubSpot (demo data otherwise, same
// resilience pattern as lib/playbooks/crmSummary.ts and
// lib/outbound/sync.ts) and reduces them to a scored, sorted MQL queue —
// no separate marketing-automation integration required, since HubSpot's
// default contact properties already carry lifecycle stage, source, and
// creation date.

import { supabase } from '../supabase'
import { loadCredential } from '../integrations/credentialStore'
import { fetchContacts } from '../integrations/hubspot'
import type { HubSpotContact } from '../integrations/types'
import type { MQL, MqlSnapshot } from './types'

const SENIOR_TITLE_RE = /\b(chief|c[a-z]o|vp|vice president|head of|director|founder|owner|president)\b/i

const STAGE_LABELS: Record<string, string> = {
  subscriber: 'Subscriber',
  lead: 'Lead',
  marketingqualifiedlead: 'MQL',
  salesqualifiedlead: 'SQL',
  opportunity: 'Opportunity',
  customer: 'Customer',
  evangelist: 'Evangelist',
  other: 'Other',
}

const SOURCE_LABELS: Record<string, string> = {
  ORGANIC_SEARCH: 'Organic Search',
  PAID_SEARCH: 'Paid Search',
  PAID_SOCIAL: 'Paid Social',
  SOCIAL_MEDIA: 'Social',
  EMAIL_MARKETING: 'Email',
  REFERRALS: 'Referral',
  DIRECT_TRAFFIC: 'Direct',
  OFFLINE: 'Offline',
  OTHER_CAMPAIGNS: 'Campaign',
}

function daysSince(iso?: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - new Date(iso).getTime()
  return Number.isFinite(ms) ? ms / (24 * 60 * 60 * 1000) : null
}

// Deterministic 0–100 lead score: lifecycle stage (how far HubSpot's own
// scoring/nurture already thinks they are) + title seniority + how fresh
// the lead is + whether they arrived via a high-intent channel. No AI
// call needed for this — it's a transparent, explainable rule, which is
// exactly what a rep triaging a queue wants to be able to trust.
export function scoreContact(c: HubSpotContact['properties']): number {
  let score = 10
  const stage = (c.lifecyclestage || '').toLowerCase()
  if (stage === 'opportunity' || stage === 'salesqualifiedlead') score += 45
  else if (stage === 'marketingqualifiedlead') score += 35
  else if (stage === 'lead') score += 15

  if (SENIOR_TITLE_RE.test(c.jobtitle || '')) score += 20

  const age = daysSince(c.createdate)
  if (age !== null) {
    if (age <= 3) score += 20
    else if (age <= 7) score += 12
    else if (age <= 14) score += 5
  }

  const source = (c.hs_analytics_source || '').toUpperCase()
  if (source === 'PAID_SEARCH' || source === 'ORGANIC_SEARCH' || source === 'DIRECT_TRAFFIC') score += 5

  return Math.max(0, Math.min(100, score))
}

function toMQL(c: HubSpotContact): MQL {
  const p = c.properties
  const sourceKey = (p.hs_analytics_source || '').toUpperCase()
  const stageKey = (p.lifecyclestage || '').toLowerCase()
  return {
    id: c.id,
    firstName: p.firstname ?? '',
    lastName: p.lastname ?? '',
    email: p.email ?? '',
    title: p.jobtitle ?? '',
    company: p.company ?? '',
    source: SOURCE_LABELS[sourceKey] ?? (p.hs_analytics_source || 'Unknown'),
    stage: STAGE_LABELS[stageKey] ?? (p.lifecyclestage || 'Unknown'),
    score: scoreContact(p),
    createdAt: p.createdate ?? null,
  }
}

async function hubspotConnected(): Promise<boolean> {
  const { data } = await supabase
    .from('integrations')
    .select('connected')
    .eq('provider', 'hubspot')
    .eq('connected', true)
    .maybeSingle()
  return !!data
}

export async function fetchMqlSnapshot(): Promise<MqlSnapshot> {
  const connected = await hubspotConnected()
  const key = (await loadCredential('hubspot')) ?? 'demo'
  const contacts = await fetchContacts(key)

  const mqls = contacts
    .filter(c => c.properties?.email)
    .map(toMQL)
    .sort((a, b) => b.score - a.score)

  const mqlsThisMonth = mqls.filter(m => {
    const age = daysSince(m.createdAt)
    return age !== null && age <= 30
  }).length

  return {
    mqls: mqls.slice(0, 20),
    mqlsThisMonth,
    demo: !connected,
    sources: connected ? ['hubspot'] : [],
  }
}
