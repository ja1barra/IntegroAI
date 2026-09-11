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
  avatarUrl?: string | null
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

export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentColor = 'orange' | 'teal' | 'violet' | 'blue' | 'rose'
export type DensityMode = 'compact' | 'default' | 'comfortable'
export type FontFamily = 'sans' | 'inter' | 'serif' | 'mono' | 'system'

export interface NotificationPrefs {
  email: boolean
  sound: boolean
  desktop: boolean
}

export interface Tweaks {
  theme: ThemeMode
  accentColor: AccentColor
  density: DensityMode
  glassOpacity: number // 10–95, percent
  fontFamily: FontFamily
  notifications: NotificationPrefs
}

// White-label branding — see supabase/white-label-schema.sql. Scoped
// per-user for now (no separate workspace/organization table yet), and
// applied globally by AppShell once loaded (accent color, ink tone,
// header logo, favicon, custom font, "Powered by" badge).
export interface WhiteLabel {
  light_logo_url: string | null
  dark_logo_url: string | null
  favicon_url: string | null
  primary_color: string
  ink_color: string
  font_choice: 'sans' | 'inter' | 'custom'
  custom_font_name: string | null
  custom_domain: string | null
  domain_status: 'unset' | 'pending' | 'verified'
  powered_by_badge: boolean
}

export interface SharedViewProps {
  active: boolean
  agentStates: AgentStates
  toggleAgent: (id: AgentId) => void
  addToast: (msg: string, type?: 'success' | 'error') => void
}

// ── Task management ───────────────────────────────────────────

export type TaskStatus   = 'todo' | 'in-progress' | 'review' | 'done' | 'blocked'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  dueDate: string        // 'YYYY-MM-DD' or ''
  agent: AgentId | ''
  tags: string[]
  createdAt: string
  updatedAt: string
}
