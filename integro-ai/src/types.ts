// ── Shared domain types ──────────────────────────────────────

export type AgentStatus = 'running' | 'paused' | 'idle'
export type AgentId = 'outbound' | 'demand' | 'success' | 'playbook-agent'
export type DeltaType = 'delta-up' | 'delta-down' | 'delta-flat'
export type StageKey = 'prospect' | 'contacted' | 'replied' | 'meeting' | 'churning' | 'healthy' | 'risk' | 'pending'

export interface User {
  name: string
  initials: string
  role: string
  org: string
}

export interface AgentStates {
  outbound: AgentStatus
  demand: AgentStatus
  success: AgentStatus
  'playbook-agent': AgentStatus
}

export interface Toast {
  id: number
  msg: string
  type: 'success' | 'error'
}

export interface Approval {
  id: string
  title: string
  desc: string
}

export interface ActivityItem {
  id: number
  color: string
  agent: string
  text: string
  time: string
}

export interface Tweaks {
  darkMode: boolean
  accentColor: 'orange' | 'teal' | 'violet'
  density: 'default' | 'compact'
}

export interface SharedViewProps {
  active: boolean
  agentStates: AgentStates
  toggleAgent: (id: AgentId) => void
  addToast: (msg: string, type?: 'success' | 'error') => void
}
