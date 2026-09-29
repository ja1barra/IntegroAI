export type Role = 'admin' | 'manager' | 'member' | 'viewer'

export interface RevenueContext {
  organization: { id: string; name: string; timezone: string }
  role: Role
  flags: { revenue_mvp_enabled: boolean; managed_ai_enabled: boolean; hubspot_write_actions_enabled: boolean; legacy_outreach_enabled: boolean }
  ai_configured: boolean
}

export interface CurrencyKpi {
  currency: string | null
  open_count: number
  unknown_amount_count: number
  open_pipeline: string | null
  at_risk_amount: string | null
  at_risk_deal_count: number
  provisional_at_risk_amount: string | null
  provisional_at_risk_deal_count: number
}

export interface Priority { finding_id: string; deal_id: string; deal_name: string | null; rule_key: string; severity: string; recommendation: string | null; amount: string | null; currency: string | null }

export interface Overview {
  connection: { status: string; portal_id: string } | null
  onboarding_state: string
  last_sync: { id: string; status: string; finished_at: string | null; warnings: string[]; error: string | null } | null
  snapshot: { id: string; as_of: string; rules_version: number; status: 'complete' | 'partial'; timezone: string | null } | null
  filters: Record<string, string>
  kpis: null | {
    revenue_score: number | null
    eligible_deals: number
    open_deals: number
    average_coverage: number | null
    exclusions: { provisional: number; not_evaluable: number; unknown_open_state?: number }
    by_currency: CurrencyKpi[]
    findings_open: number
    deals_with_findings: number
    coverage_summary: Record<string, string> | null
  }
  priorities?: Priority[]
  filter_options?: { pipelines: { id: string; label: string }[]; stages: { id: string; label: string }[]; owners: { id: string; label: string }[] }
}

export interface Finding {
  id: string; deal_id: string; deal_name: string | null; amount: string | null; currency: string | null; owner: string | null; stage: string | null
  rule_key: string; category: string; severity: 'high' | 'medium' | 'low' | 'info'; status: string
  evidence: { observed_value?: unknown; threshold?: unknown; reason?: string; issues?: string[]; as_of?: string }
  recommendation: string | null; first_seen_at: string; age_days: number
  preference: { state: 'dismissed' | 'snoozed'; reason: string; until: string | null } | null
  hubspot_url: string | null
}
export interface FindingGroup { category: string; findings: number; unique_deals: number; severity: Record<string, number>; unique_amount_by_currency: { currency: string | null; amount: string | null; unknown_amount_deals: number }[] }
export interface FindingsResponse { items: Finding[]; total: number; groups: FindingGroup[]; snapshot: { id: string; as_of: string } | null; next_offset: number | null }

export interface DealRow {
  id: string; name: string | null; company: string | null; owner: string | null; amount: string | null; currency: string | null; stage: string | null; close_at: string | null
  days_since_activity: number | null; health: number | null; band: string; coverage: number | null; provisional: boolean; hubspot_url: string | null
}
export interface DealsResponse { items: DealRow[]; total: number; snapshot: { id: string; as_of: string } | null; next_offset: number | null }

export interface RuleFactor { rule_key: string; status: 'triggered' | 'clear' | 'unknown' | 'not_applicable'; severity: string | null; penalty: number; observed_value: unknown; threshold: unknown; reason: string }
export interface DealDetail {
  deal: { id: string; external_id: string; name: string | null; amount: string | null; currency: string | null; close_at: string | null; stage: string | null; stage_category: string | null; pipeline: string | null; owner: string | null; company: string | null; stage_entered_at: string | null; stage_entered_source: string | null; hubspot_url: string | null; synced_at: string }
  evaluation: null | { health: number | null; coverage: number | null; band: string; provisional: boolean; as_of: string; rules_version: number; factors: RuleFactor[] }
  unknown_data: { rule_key: string; reason: string }[]
  findings: (Finding & { suppressed: boolean })[]
  associations: { contacts: { name: string; title: string | null }[]; company: string | null }
  timeline: { id: string; type: string; occurred_at: string | null; due_at: string | null; status: string | null; direction: string | null; subject: string | null }[]
  stage_history: { value: string; effective_at: string; source: string }[]
  proposals: { id: string; kind: string; status: string; version: number; created_at: string }[]
}

export interface Source { id: string; type: string; label: string; deal_id?: string; hubspot_url?: string | null; as_of?: string | null }
export interface BriefContent {
  period: string; as_of: string; snapshot_status: string
  comparison: { available: boolean; reason?: string }
  metrics: { revenue_score: number | null; eligible_deals: number; open_deals: number; average_coverage: number | null; by_currency: CurrencyKpi[]; open_findings: number }
  changes: null | { score_delta: number | null; open_findings_delta: number; previous_as_of: string }
  top_risks: { evidence_id: string; deal_id: string; deal_name: string | null; amount: string | null; currency: string | null; rule: string; severity: string; recommendation: string | null }[]
  actions: { deal_id: string; deal_name: string | null; text: string; evidence_id: string }[]
  sources: Source[]
  narrative?: { headline: string; summary: string; priorities: { text: string; evidence_ids: string[] }[] }
  ai: { status: string; reason?: string; message?: string; model?: string }
}
export interface BriefRow { id: string; period: string; period_start: string; period_end: string; is_baseline: boolean; status: string; created_at: string }
export interface Brief extends BriefRow { content: BriefContent }

export interface AskResponse { session_id: string; message_id: string; answer: string; verified: boolean; insufficient_data: boolean; sources: Source[]; limitations: string[]; data_as_of: string | null }
export interface ChatMessage { id: string; role: 'user' | 'assistant'; content: string; evidence_refs: Source[]; data_as_of: string | null; created_at: string }

export type ActionStatus = 'proposed' | 'approved' | 'executing' | 'succeeded' | 'rejected' | 'cancelled' | 'expired' | 'conflict' | 'failed' | 'needs_review'
export interface Proposal {
  id: string; deal_id: string; kind: 'create_task' | 'update_deal_fields' | 'email_draft'; payload: Record<string, unknown>; payload_hash: string; version: number
  base_state: Record<string, unknown>; rationale: string | null; source: 'user' | 'ai'; portal_id: string; status: ActionStatus
  created_by: string | null; approved_by: string | null; approved_at: string | null; expires_at: string; result: { external_result_id?: string | null; error?: string; reason?: string } | null; created_at: string
}

export interface ConnectionStatus {
  oauth_configured: boolean; connected: boolean; reconnect_required: boolean; write_actions_enabled: boolean
  connection: null | { status: string; portal_id: string; connected_at: string; last_success_at: string | null; last_error: string | null; scopes: string[]; capabilities: { read: boolean; write_tasks: boolean; write_deals: boolean }; coverage: Record<string, string> | null }
  last_sync: null | { id: string; status: string; started_at: string | null; finished_at: string | null; warnings: string[]; error: string | null; step: string | null; counters: Record<string, number> }
}

export interface OnboardingStage { external_id: string; label: string; display_order: number | null; is_closed: boolean | null; category: string; category_source: string; suggested_category: string | null }
export interface Onboarding {
  state: 'not_started' | 'connected' | 'pipeline_selected' | 'stages_mapped' | 'confirmed' | 'synced'
  settings: { selected_pipeline_ids: string[]; timezone: string; currency: string | null; brief_cadence: 'daily' | 'weekly' }
  pipelines: { external_id: string; label: string; stages: OnboardingStage[] }[]
}

export interface JobResponse {
  job: { id: string; kind: string; status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead'; attempts: number; last_error: string | null }
  sync_run: null | { id: string; status: string; step: string | null; warnings: string[]; error: string | null; counters: Record<string, number> }
}
