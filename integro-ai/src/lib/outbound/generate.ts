// ── AI email generation (client wrapper) ─────────────────────
// Calls the /api/agent/generate serverless function (Claude, server-side
// key). Falls back to deterministic mail-merge personalization when the
// endpoint isn't deployed or no ANTHROPIC_API_KEY is configured — so the
// product is always demoable.

import type { Prospect, SequenceStep } from './types'

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

export async function generateDrafts(
  prospects: Prospect[],
  step: SequenceStep,
  sender: Sender,
): Promise<{ drafts: Draft[]; usedAI: boolean }> {
  if (prospects.length === 0) return { drafts: [], usedAI: false }

  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
