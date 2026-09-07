// ── Demand Generation — domain types ──────────────────────────

export interface MQL {
  id: string
  firstName: string
  lastName: string
  email: string
  title: string
  company: string
  source: string        // human-readable traffic/lead source
  stage: string          // human-readable HubSpot lifecycle stage
  score: number          // 0–100, see lib/demand/mqls.ts
  createdAt: string | null
}

export interface ChannelStat {
  channel: string
  sessions: number
  conversions: number
  revenue: number
}

export interface LandingPageStat {
  path: string
  sessions: number
  conversions: number
}

export interface TrafficSnapshot {
  monthlyVisitors: number
  channels: ChannelStat[]
  topPages: LandingPageStat[]
  demo: boolean
}

export interface MqlSnapshot {
  mqls: MQL[]
  mqlsThisMonth: number
  demo: boolean
  sources: string[]
}
