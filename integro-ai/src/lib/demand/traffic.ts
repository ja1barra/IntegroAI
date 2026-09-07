// ── Traffic & channel performance ─────────────────────────────
// Pulls a 30-day channel + landing-page report from connected GA4 (demo
// data otherwise). Reuses the existing GA4 lib, which already handles the
// OAuth token and demo fallback — this just shapes the report rows for
// the Demand Gen dashboard.

import { supabase } from '../supabase'
import { loadCredential } from '../integrations/credentialStore'
import { fetchPrimaryPropertyId, runReport, runLandingPageReport } from '../integrations/ga4'
import type { GA4Report } from '../integrations/ga4'
import type { ChannelStat, LandingPageStat, TrafficSnapshot } from './types'

async function ga4Connected(): Promise<boolean> {
  const { data } = await supabase
    .from('integrations')
    .select('connected')
    .eq('provider', 'ga4')
    .eq('connected', true)
    .maybeSingle()
  return !!data
}

function num(v: string | undefined): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function toChannelStats(report: GA4Report): ChannelStat[] {
  return (report.rows ?? []).map(r => ({
    channel: r.dimensionValues[0]?.value ?? 'Unknown',
    sessions: num(r.metricValues[0]?.value),
    conversions: num(r.metricValues[1]?.value),
    revenue: num(r.metricValues[2]?.value),
  }))
}

function toLandingPageStats(report: GA4Report): LandingPageStat[] {
  return (report.rows ?? []).map(r => ({
    path: r.dimensionValues[0]?.value ?? '/',
    sessions: num(r.metricValues[0]?.value),
    conversions: num(r.metricValues[1]?.value),
  }))
}

const EMPTY: Omit<TrafficSnapshot, 'demo'> = { monthlyVisitors: 0, channels: [], topPages: [] }

export async function fetchTrafficSnapshot(): Promise<TrafficSnapshot> {
  const connected = await ga4Connected()
  const key = (await loadCredential('ga4')) ?? 'demo'

  try {
    const propertyId = await fetchPrimaryPropertyId(key)
    if (!propertyId) return { ...EMPTY, demo: !connected }

    const [channelReport, pageReport] = await Promise.all([
      runReport(key, propertyId),
      runLandingPageReport(key, propertyId),
    ])

    const channels = toChannelStats(channelReport)
    const topPages = toLandingPageStats(pageReport)
    const monthlyVisitors = channels.reduce((sum, c) => sum + c.sessions, 0)

    return { monthlyVisitors, channels, topPages, demo: !connected }
  } catch {
    return { ...EMPTY, demo: !connected }
  }
}
