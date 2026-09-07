// ── Account health & churn risk ───────────────────────────────
// Pulls contacts + conversations from connected Intercom (demo data
// otherwise, same resilience pattern as lib/demand/mqls.ts) and reduces
// them to a scored, sorted account list. "Users" (as opposed to Intercom
// "leads") are treated as paying accounts; open support conversations
// and product-usage recency (last_seen_at) are the two signals Intercom
// already gives us for free, no extra integration required.

import { supabase } from '../supabase'
import { loadCredential } from '../integrations/credentialStore'
import { fetchContacts, fetchConversations } from '../integrations/intercom'
import type { Account, AccountsSnapshot, AccountStatus } from './types'

function daysSince(unixSeconds?: number): number | null {
  if (!unixSeconds) return null
  const ms = Date.now() - unixSeconds * 1000
  return Number.isFinite(ms) ? ms / (24 * 60 * 60 * 1000) : null
}

// Deterministic 0–100 health score: a baseline for any active user,
// adjusted for how recently they've actually used the product and how
// many support conversations are still unresolved. Transparent and
// explainable, same reasoning as the MQL score in lib/demand/mqls.ts.
export function computeHealthScore(daysSinceSeen: number | null, openConversations: number): number {
  let score = 60
  if (daysSinceSeen === null) score -= 20
  else if (daysSinceSeen <= 3) score += 25
  else if (daysSinceSeen <= 14) score += 10
  else if (daysSinceSeen <= 30) score -= 10
  else score -= 35

  score -= Math.min(30, openConversations * 15)

  return Math.max(0, Math.min(100, score))
}

function statusFor(score: number): AccountStatus {
  if (score >= 65) return 'healthy'
  if (score >= 40) return 'watch'
  return 'at_risk'
}

async function intercomConnected(): Promise<boolean> {
  const { data } = await supabase
    .from('integrations')
    .select('connected')
    .eq('provider', 'intercom')
    .eq('connected', true)
    .maybeSingle()
  return !!data
}

export async function fetchAccountsSnapshot(): Promise<AccountsSnapshot> {
  const connected = await intercomConnected()
  const key = (await loadCredential('intercom')) ?? 'demo'
  const [contacts, conversations] = await Promise.all([fetchContacts(key), fetchConversations(key)])

  const openConvCountByContact = new Map<string, number>()
  for (const c of conversations) {
    if (c.state !== 'open') continue
    for (const cc of c.contacts?.contacts ?? []) {
      openConvCountByContact.set(cc.id, (openConvCountByContact.get(cc.id) ?? 0) + 1)
    }
  }

  const accounts: Account[] = contacts
    .filter(c => c.role === 'user')
    .map(c => {
      const daysSinceSeen = daysSince(c.last_seen_at)
      const openConversations = openConvCountByContact.get(c.id) ?? 0
      const healthScore = computeHealthScore(daysSinceSeen, openConversations)
      return {
        id: c.id,
        name: c.name || c.email,
        email: c.email,
        company: c.custom_attributes?.company ?? '',
        plan: c.custom_attributes?.plan ?? 'Unknown',
        healthScore,
        status: statusFor(healthScore),
        lastSeenDaysAgo: daysSinceSeen !== null ? Math.round(daysSinceSeen) : null,
        openConversations,
      }
    })
    .sort((a, b) => a.healthScore - b.healthScore) // worst first — most actionable

  const activeCount = accounts.length
  const avgHealthScore = activeCount
    ? Math.round(accounts.reduce((sum, a) => sum + a.healthScore, 0) / activeCount)
    : 0
  const atRiskCount = accounts.filter(a => a.status === 'at_risk').length

  return { accounts, activeCount, avgHealthScore, atRiskCount, demo: !connected }
}
