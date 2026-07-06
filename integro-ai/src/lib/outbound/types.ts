// ── Outbound Sales Machine — domain types ────────────────────

export type ProspectStatus =
  | 'new' | 'enrolled' | 'contacted' | 'replied' | 'meeting' | 'bounced' | 'unsubscribed'

export type ProspectSource = 'hubspot' | 'apollo' | 'manual' | 'csv'

export interface Prospect {
  id: string
  firstName: string
  lastName: string
  email: string
  title: string
  company: string
  website: string | null
  source: string
  status: ProspectStatus
  createdAt: string
}

// A prospect record before it has been persisted (used for sync / manual add).
export interface ProspectInput {
  firstName: string
  lastName: string
  email: string
  title?: string
  company?: string
  website?: string | null
  source?: ProspectSource
  externalId?: string | null
}

export type MessageStatus =
  | 'draft' | 'approved' | 'sending' | 'sent' | 'failed' | 'replied'

export interface Message {
  id: string
  prospectId: string | null
  sequenceId: string | null
  enrollmentId: string | null
  stepId: string | null
  channel: 'email' | 'linkedin' | 'call'
  subject: string
  body: string
  status: MessageStatus
  generatedBy: 'ai' | 'manual'
  mailbox: string | null
  sentAt: string | null
  error: string | null
  createdAt: string
  prospect?: Prospect        // joined for the review queue
}

// ── Sequences ────────────────────────────────────────────────

export type StepType = 'email' | 'linkedin' | 'call'

export interface SequenceStep {
  id: string
  type: StepType
  delay: number   // step 0: days from enrollment; step 1+: days after previous
  subject: string
  body: string
}

export interface Sequence {
  id: string
  name: string
  steps: SequenceStep[]
  status: 'draft' | 'active' | 'paused'
  createdAt: string
}

export interface Enrollment {
  id: string
  sequenceId: string
  prospectId: string
  currentStep: number
  status: 'active' | 'paused' | 'completed' | 'replied' | 'bounced'
  enrolledAt: string
}

// Aggregate stats for the Outbound view.
export interface OutboundStats {
  inSequence: number
  sent: number
  replied: number
  meetings: number
  drafts: number
  replyRate: number   // 0–100
}
