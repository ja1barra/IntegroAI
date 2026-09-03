// ── AI playbook generation (client wrapper) ──────────────────
// Calls the /api/agent/generate-sequence serverless function with
// kind: "playbook" (Claude, server-side key). It shares that endpoint
// with sequence generation rather than getting its own file because
// Vercel's Hobby plan caps a deployment at 12 Serverless Functions — see
// the dispatch at the bottom of api/agent/generate-sequence.js. Unlike
// outbound email generation, there's no sensible deterministic fallback
// for "write me a playbook" — this surfaces a clear error instead so the
// caller can show it.

import { supabase } from '../supabase'
import type { SourceRef } from './types'

export interface Sender {
  name: string
  company: string
  valueProp?: string
}

export interface GeneratedPlaybook {
  title: string
  description: string
  category: string
  plays: { title: string; description: string }[]
  tags: string[]
}

export interface GenerateResult {
  ok: boolean
  playbook?: GeneratedPlaybook
  sources?: SourceRef[]
  error?: string
}

const ENDPOINT = '/api/agent/generate-sequence'

async function callGenerate(body: Record<string, unknown>): Promise<GenerateResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
    })
    const data = await r.json().catch(() => ({} as { playbook?: GeneratedPlaybook; sources?: SourceRef[]; error?: string }))
    if (!r.ok) {
      const hint = r.status === 401 ? 'Sign in required.' : r.status === 400 && !data.error ? 'AI is not configured on the server yet.' : ''
      return { ok: false, error: [data.error, hint].filter(Boolean).join(' ') || `Generation failed (${r.status})` }
    }
    if (!data.playbook) {
      return { ok: false, error: 'AI returned no playbook — try again' }
    }
    return { ok: true, playbook: data.playbook, sources: data.sources ?? [] }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

// Draft a playbook grounded in a CRM win/loss summary (see crmSummary.ts).
export function generatePlaybookFromCrm(sender: Sender, crmContext: string, topic?: string): Promise<GenerateResult> {
  return callGenerate({ sender, kind: 'playbook', mode: 'crm', crmContext, topic })
}

// Draft a playbook from live web research on the given topic.
export function generatePlaybookFromWeb(sender: Sender, topic: string): Promise<GenerateResult> {
  return callGenerate({ sender, kind: 'playbook', mode: 'web', topic })
}
