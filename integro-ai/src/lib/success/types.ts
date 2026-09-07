// ── Customer Success — domain types ───────────────────────────

export type AccountStatus = 'healthy' | 'watch' | 'at_risk'

export interface Account {
  id: string
  name: string
  email: string
  company: string
  plan: string
  healthScore: number        // 0–100, see lib/success/accounts.ts
  status: AccountStatus
  lastSeenDaysAgo: number | null
  openConversations: number
}

export interface AccountsSnapshot {
  accounts: Account[]
  activeCount: number
  avgHealthScore: number
  atRiskCount: number
  demo: boolean
}

export interface ExpansionDeal {
  id: string
  name: string
  amount: number
  stage: string
}

export interface ExpansionSnapshot {
  pipelineAmount: number
  deals: ExpansionDeal[]
  demo: boolean
}
