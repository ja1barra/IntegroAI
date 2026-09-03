// ── Growth Playbooks — domain types ──────────────────────────

export type PlaybookStatus = 'draft' | 'active' | 'archived'
export type PlaybookSource = 'manual' | 'ai_crm' | 'ai_web'

export interface Play {
  id: string
  title: string
  description: string
}

// A citation surfaced when a playbook was generated from online research.
export interface SourceRef {
  title: string
  url: string
}

export interface Playbook {
  id: string
  title: string
  description: string
  category: string
  status: PlaybookStatus
  source: PlaybookSource
  plays: Play[]
  winRatePct: number | null
  avgDealCycleDays: number | null
  tags: string[]
  sourcesUsed: SourceRef[]      // web citations, when source === 'ai_web'
  crmSummary: string | null     // CRM stats snapshot the playbook was built from, when source === 'ai_crm'
  createdAt: string
  updatedAt: string
}

// A playbook before it has been persisted (create / full edit).
export interface PlaybookInput {
  title: string
  description: string
  category: string
  status: PlaybookStatus
  source: PlaybookSource
  plays: Play[]
  winRatePct?: number | null
  avgDealCycleDays?: number | null
  tags: string[]
  sourcesUsed?: SourceRef[]
  crmSummary?: string | null
}

export const PLAYBOOK_CATEGORIES = [
  'Outbound Prospecting',
  'Discovery & Qualification',
  'Deal Negotiation',
  'Competitive Displacement',
  'Onboarding & Activation',
  'Expansion & Upsell',
  'Renewal & Retention',
  'Win/Loss Response',
  'General',
] as const
