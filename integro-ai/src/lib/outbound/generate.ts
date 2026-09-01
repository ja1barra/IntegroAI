// ── AI email generation (client wrapper) ─────────────────────
// Calls the /api/agent/generate serverless function (Claude, server-side
// key). Falls back to deterministic mail-merge personalization when the
// endpoint isn't deployed or no ANTHROPIC_API_KEY is configured — so the
// product is always demoable.

import type { Prospect, SequenceStep } from './types'
import { supabase } from '../supabase'

export interface Draft {
  prospectId: string
  subject: string
  body: string
}

export interface Sender {
  name: string
  company: string
  valueProp?: string
}

const ENDPOINT = '/api/agent/generate'

const DEFAULT_BODY =
  `Hi {{firstName}},\n\n` +
  `I came across {{company}} and wanted to reach out — teams in your space are ` +
  `under real pressure to hit pipeline targets with leaner resources.\n\n` +
  `At {{senderCompany}} we help revenue teams build systems that book more meetings ` +
  `without adding headcount. Worth a quick 15-minute call to see if it's a fit?\n\n` +
  `Best,\n{{senderName}}`

function fill(tpl: string, p: Prospect, s: Sender): string {
  return (tpl || '')
    .replace(/\{\{\s*firstName\s*\}\}/g, p.firstName || 'there')
    .replace(/\{\{\s*lastName\s*\}\}/g, p.lastName || '')
    .replace(/\{\{\s*company\s*\}\}/g, p.company || 'your team')
    .replace(/\{\{\s*title\s*\}\}/g, p.title || '')
    .replace(/\{\{\s*senderName\s*\}\}/g, s.name || '')
    .replace(/\{\{\s*senderCompany\s*\}\}/g, s.company || '')
}

export interface GeneratedStep {
  type: 'email'
  delay: number
  subject: string
  body: string
}

const SEQUENCE_ENDPOINT = '/api/agent/generate-sequence'

// Draft a whole multi-step sequence template from a short brief (audience +
// angle). Unlike generateDrafts, there's no sensible deterministic fallback
// for "write me a sequence" — this surfaces a clear error instead so the
// Sequence Builder can show it rather than silently doing nothing.
export async function generateSequenceTemplate(
  brief: string,
  stepCount: number,
  sender: Sender,
): Promise<{ ok: boolean; steps?: GeneratedStep[]; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(SEQUENCE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ sender, brief, stepCount }),
    })
    const data = await r.json().catch(() => ({} as { steps?: GeneratedStep[]; error?: string }))
    if (!r.ok) {
      const hint = r.status === 401 ? 'Sign in required.' : r.status === 400 && !data.error ? 'AI is not configured on the server yet.' : ''
      return { ok: false, error: [data.error, hint].filter(Boolean).join(' ') || `Generation failed (${r.status})` }
    }
    if (!Array.isArray(data.steps) || data.steps.length === 0) {
      return { ok: false, error: 'AI returned no steps — try rephrasing your brief' }
    }
    return { ok: true, steps: data.steps }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}

export async function generateDrafts(
  prospects: Prospect[],
  step: SequenceStep,
  sender: Sender,
): Promise<{ drafts: Draft[]; usedAI: boolean }> {
  if (prospects.length === 0) return { drafts: [], usedAI: false }

  try {
    const { data: { session } } = await supabase.auth.getSession()
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({
        sender,
        step: { subject: step.subject, body: step.body, type: step.type },
        prospects: prospects.map(p => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          title: p.title,
          company: p.company,
          website: p.website,
        })),
      }),
    })
    // 404 = endpoint not deployed; non-200 = misconfig — fall through to demo.
    if (r.ok) {
      const data = (await r.json()) as { results?: { id: string; subject: string; body: string }[] }
      if (Array.isArray(data.results) && data.results.length) {
        const byId = new Map(data.results.map(x => [x.id, x]))
        return {
          usedAI: true,
          drafts: prospects.map(p => {
            const hit = byId.get(p.id)
            return hit
              ? { prospectId: p.id, subject: hit.subject, body: hit.body }
              : { prospectId: p.id, subject: fill(step.subject, p, sender), body: fill(step.body || DEFAULT_BODY, p, sender) }
          }),
        }
      }
    }
  } catch {
    /* network / offline — fall through to demo */
  }

  // Deterministic fallback
  return {
    usedAI: false,
    drafts: prospects.map(p => ({
      prospectId: p.id,
      subject: fill(step.subject || `Quick idea for {{company}}`, p, sender),
      body: fill(step.body || DEFAULT_BODY, p, sender),
    })),
  }
}
