// ── Outbound data-access layer (Supabase) ────────────────────
// The shared supabase client is untyped, so we map snake_case rows
// to camelCase domain objects here and keep the rest of the app clean.

import { supabase } from '../supabase'
import type {
  Prospect, ProspectInput, Message, MessageStatus,
  Sequence, SequenceStep, Enrollment,
} from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function userId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

// ── Prospects ────────────────────────────────────────────────

function mapProspect(r: any): Prospect {
  return {
    id: r.id,
    firstName: r.first_name ?? '',
    lastName: r.last_name ?? '',
    email: r.email,
    title: r.title ?? '',
    company: r.company ?? '',
    website: r.website ?? null,
    source: r.source ?? 'manual',
    status: r.status ?? 'new',
    createdAt: r.created_at,
  }
}

export async function listProspects(): Promise<Prospect[]> {
  const { data, error } = await supabase
    .from('prospects')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapProspect)
}

// Upsert a batch (CRM sync or CSV). De-dupes on (user_id, email).
// Returns the number of rows written.
export async function upsertProspects(rows: ProspectInput[]): Promise<number> {
  if (rows.length === 0) return 0
  const uid = await userId()
  const payload = rows
    .filter(r => r.email && r.email.includes('@'))
    .map(r => ({
      user_id: uid,
      first_name: r.firstName ?? '',
      last_name: r.lastName ?? '',
      email: r.email.toLowerCase().trim(),
      title: r.title ?? '',
      company: r.company ?? '',
      website: r.website ?? null,
      source: r.source ?? 'manual',
      external_id: r.externalId ?? null,
    }))
  if (payload.length === 0) return 0
  const { error } = await supabase
    .from('prospects')
    .upsert(payload, { onConflict: 'user_id,email', ignoreDuplicates: false })
  if (error) throw error
  return payload.length
}

export async function deleteProspect(id: string): Promise<void> {
  const { error } = await supabase.from('prospects').delete().eq('id', id)
  if (error) throw error
}

export async function setProspectStatus(id: string, status: string): Promise<void> {
  const { error } = await supabase.from('prospects').update({ status }).eq('id', id)
  if (error) throw error
}

// ── Sequences (+ steps) ──────────────────────────────────────

export async function listSequences(): Promise<Sequence[]> {
  const { data: seqs, error } = await supabase
    .from('sequences')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  const ids = (seqs ?? []).map((s: any) => s.id)
  let stepsBySeq: Record<string, SequenceStep[]> = {}
  if (ids.length) {
    const { data: steps, error: se } = await supabase
      .from('sequence_steps')
      .select('*')
      .in('sequence_id', ids)
      .order('step_order', { ascending: true })
    if (se) throw se
    stepsBySeq = (steps ?? []).reduce((acc: Record<string, SequenceStep[]>, r: any) => {
      (acc[r.sequence_id] ??= []).push({
        id: r.id, type: r.type, delay: r.delay_days, subject: r.subject ?? '', body: r.body ?? '',
      })
      return acc
    }, {})
  }
  return (seqs ?? []).map((s: any) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    createdAt: s.created_at,
    steps: stepsBySeq[s.id] ?? [],
  }))
}

// Insert or update a sequence and fully replace its steps.
export async function saveSequence(seq: Sequence): Promise<Sequence> {
  const uid = await userId()
  const existing = await supabase.from('sequences').select('id').eq('id', seq.id).maybeSingle()

  let seqId = seq.id
  if (existing.data) {
    const { error } = await supabase
      .from('sequences')
      .update({ name: seq.name, status: seq.status })
      .eq('id', seq.id)
    if (error) throw error
  } else {
    const { data, error } = await supabase
      .from('sequences')
      .insert({ user_id: uid, name: seq.name, status: seq.status })
      .select('id')
      .single()
    if (error) throw error
    seqId = (data as any).id
  }

  // Replace steps
  await supabase.from('sequence_steps').delete().eq('sequence_id', seqId)
  if (seq.steps.length) {
    const rows = seq.steps.map((st, i) => ({
      user_id: uid,
      sequence_id: seqId,
      step_order: i,
      type: st.type,
      delay_days: st.delay,
      subject: st.subject,
      body: st.body,
    }))
    const { error } = await supabase.from('sequence_steps').insert(rows)
    if (error) throw error
  }

  const all = await listSequences()
  return all.find(s => s.id === seqId) ?? { ...seq, id: seqId }
}

export async function deleteSequence(id: string): Promise<void> {
  const { error } = await supabase.from('sequences').delete().eq('id', id)
  if (error) throw error
}

export async function setSequenceStatus(id: string, status: Sequence['status']): Promise<void> {
  const { error } = await supabase.from('sequences').update({ status }).eq('id', id)
  if (error) throw error
}

// ── Enrollments ──────────────────────────────────────────────

function mapEnrollment(r: any): Enrollment {
  return {
    id: r.id,
    sequenceId: r.sequence_id,
    prospectId: r.prospect_id,
    currentStep: r.current_step ?? 0,
    status: r.status ?? 'active',
    enrolledAt: r.enrolled_at,
  }
}

export async function listEnrollments(): Promise<Enrollment[]> {
  const { data, error } = await supabase.from('enrollments').select('*')
  if (error) throw error
  return (data ?? []).map(mapEnrollment)
}

// Enroll prospects into a sequence (idempotent on sequence+prospect).
export async function enrollProspects(sequenceId: string, prospectIds: string[]): Promise<Enrollment[]> {
  if (prospectIds.length === 0) return []
  const uid = await userId()
  const rows = prospectIds.map(pid => ({
    user_id: uid, sequence_id: sequenceId, prospect_id: pid,
  }))
  const { data, error } = await supabase
    .from('enrollments')
    .upsert(rows, { onConflict: 'sequence_id,prospect_id', ignoreDuplicates: true })
    .select('*')
  if (error) throw error
  await supabase.from('prospects').update({ status: 'enrolled' }).in('id', prospectIds)
  return (data ?? []).map(mapEnrollment)
}

// ── Messages ─────────────────────────────────────────────────

function mapMessage(r: any): Message {
  return {
    id: r.id,
    prospectId: r.prospect_id,
    sequenceId: r.sequence_id,
    enrollmentId: r.enrollment_id,
    stepId: r.step_id,
    channel: r.channel ?? 'email',
    subject: r.subject ?? '',
    body: r.body ?? '',
    status: r.status ?? 'draft',
    generatedBy: r.generated_by ?? 'ai',
    mailbox: r.mailbox ?? null,
    sentAt: r.sent_at ?? null,
    error: r.error ?? null,
    createdAt: r.created_at,
    prospect: r.prospects ? mapProspect(r.prospects) : undefined,
  }
}

export async function listMessages(statuses?: MessageStatus[]): Promise<Message[]> {
  let q = supabase
    .from('messages')
    .select('*, prospects(*)')
    .order('created_at', { ascending: false })
  if (statuses && statuses.length) q = q.in('status', statuses)
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(mapMessage)
}

export interface NewMessage {
  prospectId: string
  sequenceId?: string | null
  enrollmentId?: string | null
  stepId?: string | null
  channel?: 'email' | 'linkedin' | 'call'
  subject: string
  body: string
  status?: MessageStatus
  generatedBy?: 'ai' | 'manual'
}

export async function insertMessages(msgs: NewMessage[]): Promise<Message[]> {
  if (msgs.length === 0) return []
  const uid = await userId()
  const rows = msgs.map(m => ({
    user_id: uid,
    prospect_id: m.prospectId,
    sequence_id: m.sequenceId ?? null,
    enrollment_id: m.enrollmentId ?? null,
    step_id: m.stepId ?? null,
    channel: m.channel ?? 'email',
    subject: m.subject,
    body: m.body,
    status: m.status ?? 'draft',
    generated_by: m.generatedBy ?? 'ai',
  }))
  const { data, error } = await supabase.from('messages').insert(rows).select('*, prospects(*)')
  if (error) throw error
  return (data ?? []).map(mapMessage)
}

export async function updateMessage(
  id: string,
  patch: Partial<{ subject: string; body: string; status: MessageStatus; mailbox: string; providerMsgId: string; error: string | null; sentAt: string | null }>,
): Promise<void> {
  const row: any = {}
  if (patch.subject !== undefined) row.subject = patch.subject
  if (patch.body !== undefined) row.body = patch.body
  if (patch.status !== undefined) row.status = patch.status
  if (patch.mailbox !== undefined) row.mailbox = patch.mailbox
  if (patch.providerMsgId !== undefined) row.provider_msg_id = patch.providerMsgId
  if (patch.error !== undefined) row.error = patch.error
  if (patch.sentAt !== undefined) row.sent_at = patch.sentAt
  const { error } = await supabase.from('messages').update(row).eq('id', id)
  if (error) throw error
}

export async function deleteMessage(id: string): Promise<void> {
  const { error } = await supabase.from('messages').delete().eq('id', id)
  if (error) throw error
}

// ── Agent runs (audit log) ───────────────────────────────────

export async function startRun(kind: 'generate' | 'send' | 'sync', meta: Record<string, unknown> = {}): Promise<string | null> {
  try {
    const uid = await userId()
    const { data, error } = await supabase
      .from('agent_runs')
      .insert({ user_id: uid, kind, status: 'running', meta })
      .select('id')
      .single()
    if (error) return null
    return (data as any).id
  } catch {
    return null
  }
}

export async function finishRun(id: string | null, status: 'completed' | 'failed', itemCount = 0, error?: string): Promise<void> {
  if (!id) return
  await supabase.from('agent_runs')
    .update({ status, item_count: itemCount, error: error ?? null, completed_at: new Date().toISOString() })
    .eq('id', id)
}

// ── Dashboard summary ────────────────────────────────────────

export interface RunLog {
  id: string
  kind: string
  status: string
  itemCount: number
  createdAt: string
}

export interface DashboardSummary {
  prospects: number
  activeSequences: number
  inSequence: number
  sent: number
  drafts: number
  meetings: number
  replyRate: number
  recentRuns: RunLog[]
}

async function count(table: string, filters: Record<string, string> = {}): Promise<number> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true })
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v)
  const { count: c } = await q
  return c ?? 0
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const [prospects, activeSequences, inSequence, sent, drafts, meetings, replied, runsRes] = await Promise.all([
    count('prospects'),
    count('sequences', { status: 'active' }),
    count('enrollments', { status: 'active' }),
    count('messages', { status: 'sent' }),
    count('messages', { status: 'draft' }),
    count('prospects', { status: 'meeting' }),
    count('messages', { status: 'replied' }),
    supabase.from('agent_runs').select('id, kind, status, item_count, created_at').order('created_at', { ascending: false }).limit(6),
  ])
  const recentRuns: RunLog[] = ((runsRes.data as any[]) ?? []).map(r => ({
    id: r.id, kind: r.kind, status: r.status, itemCount: r.item_count ?? 0, createdAt: r.created_at,
  }))
  return {
    prospects, activeSequences, inSequence, sent, drafts, meetings,
    replyRate: sent ? Math.round((replied / sent) * 100) : 0,
    recentRuns,
  }
}
