// ── Growth Playbooks data-access layer (Supabase) ────────────
// The shared supabase client is untyped, so we map snake_case rows to
// camelCase domain objects here and keep the rest of the app clean.

import { supabase } from '../supabase'
import type { Playbook, PlaybookInput, PlaybookStatus, Play, SourceRef } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */

async function userId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return user.id
}

function mapPlaybook(r: any): Playbook {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? '',
    category: r.category ?? 'General',
    status: (r.status ?? 'draft') as PlaybookStatus,
    source: r.source ?? 'manual',
    plays: Array.isArray(r.plays) ? r.plays as Play[] : [],
    winRatePct: r.win_rate_pct ?? null,
    avgDealCycleDays: r.avg_deal_cycle_days ?? null,
    tags: r.tags ?? [],
    sourcesUsed: Array.isArray(r.sources_used) ? r.sources_used as SourceRef[] : [],
    crmSummary: r.crm_summary ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listPlaybooks(): Promise<Playbook[]> {
  const { data, error } = await supabase
    .from('playbooks')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapPlaybook)
}

function toRow(p: PlaybookInput) {
  return {
    title: p.title,
    description: p.description,
    category: p.category,
    status: p.status,
    source: p.source,
    plays: p.plays,
    win_rate_pct: p.winRatePct ?? null,
    avg_deal_cycle_days: p.avgDealCycleDays ?? null,
    tags: p.tags,
    sources_used: p.sourcesUsed ?? [],
    crm_summary: p.crmSummary ?? null,
  }
}

export async function createPlaybook(input: PlaybookInput): Promise<Playbook> {
  const uid = await userId()
  const { data, error } = await supabase
    .from('playbooks')
    .insert({ user_id: uid, ...toRow(input) })
    .select('*')
    .single()
  if (error) throw error
  return mapPlaybook(data)
}

export async function updatePlaybook(id: string, input: PlaybookInput): Promise<Playbook> {
  const { data, error } = await supabase
    .from('playbooks')
    .update(toRow(input))
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return mapPlaybook(data)
}

export async function deletePlaybook(id: string): Promise<void> {
  const { error } = await supabase.from('playbooks').delete().eq('id', id)
  if (error) throw error
}

export async function setPlaybookStatus(id: string, status: PlaybookStatus): Promise<void> {
  const { error } = await supabase.from('playbooks').update({ status }).eq('id', id)
  if (error) throw error
}
