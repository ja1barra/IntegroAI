/**
 * AI sequence template generation — drafts a full multi-step outbound
 * sequence (subject + body per step, with {{placeholders}}) from a short
 * brief, for use as the starting point in the Sequence Builder.
 *
 * This is distinct from /api/agent/generate: that endpoint personalizes an
 * existing template per prospect at send time. This one writes the
 * reusable template itself, before any prospect is involved.
 *
 * POST body:
 *   {
 *     sender:    { name, company, valueProp? },
 *     brief:     string,               // audience / offer / angle, free text
 *     stepCount: number,                // 2-6
 *   }
 *
 * Returns: { steps: [ { type, delay, subject, body }, ... ] }
 *
 * Requires env var ANTHROPIC_API_KEY and a signed-in Supabase user (same
 * gate as /api/agent/generate — this also spends the shared API key).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const MODEL = 'claude-sonnet-5'
const MIN_STEPS = 2
const MAX_STEPS = 6

// Require a valid signed-in Supabase user so this endpoint can't be used by
// anyone who finds the URL to spend the shared ANTHROPIC_API_KEY for free.
async function requireUser(req) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return false
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) return false
  try {
    const r = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey },
    })
    return r.ok
  } catch {
    return false
  }
}

function buildPrompt(sender, brief, stepCount) {
  return `Write a ${stepCount}-step B2B cold outbound email sequence.

From: ${sender.name || 'the sender'} at ${sender.company || 'our company'}.${sender.valueProp ? ` What we do: ${sender.valueProp}.` : ''}

Who we're targeting and the angle to use:
"""
${brief}
"""

Guidelines:
- Step 1 sends on day 1. Each later step waits a sensible number of days after the one before it (delay), typically 3-5 for early steps and longer toward the end.
- Every step is an email ("type": "email").
- Each step must escalate: step 1 opens with a specific, relevant observation and one clear value point; middle steps add a new angle each time (a proof point, a different pain point, a resource) — never just repeat step 1 reworded; the final step is a short, low-pressure breakup/close.
- Every step: 3 short paragraphs max, under 130 words, single clear CTA (a brief intro call), warm and conversational, never corporate or generic.
- These are reusable templates sent to many different prospects, not a message to one person. Use exactly these placeholders where a prospect detail belongs — do not invent others: {{firstName}}, {{lastName}}, {{company}}, {{title}}, {{senderName}}, {{senderCompany}}.
- Subject lines under 60 characters, no placeholders in the subject.

Respond with ONLY a JSON array, no markdown, no commentary, in exactly this shape:
[{"delay": 1, "subject": "...", "body": "line one\\nline two"}, ...]
The array must have exactly ${stepCount} items, in send order.`
}

function parseSteps(text, stepCount) {
  if (!text) return null
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  let arr
  try {
    arr = JSON.parse(t)
  } catch {
    return null
  }
  if (!Array.isArray(arr) || arr.length === 0) return null
  return arr.slice(0, stepCount).map((s, i) => ({
    type: 'email',
    delay: Number.isFinite(s?.delay) && s.delay >= 1 ? Math.round(s.delay) : (i === 0 ? 1 : 3),
    subject: typeof s?.subject === 'string' ? s.subject.slice(0, 200) : '',
    body: typeof s?.body === 'string' ? s.body : '',
  })).filter(s => s.body.trim().length > 0)
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!(await requireUser(req))) {
    return res.status(401).json({ error: 'Sign in required' })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return res.status(400).json({ error: 'ANTHROPIC_API_KEY not configured on the server' })
  }

  const { sender = {}, brief, stepCount } = req.body ?? {}
  if (!brief || !brief.trim()) {
    return res.status(400).json({ error: 'brief is required — describe who you\'re targeting and the angle' })
  }
  const count = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Number.isFinite(stepCount) ? Math.round(stepCount) : 3))

  try {
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: 'You are an expert B2B SDR who designs high-converting cold outbound sequences. You always respond with valid JSON only.',
        messages: [{ role: 'user', content: buildPrompt(sender, brief.trim(), count) }],
      }),
    })
    if (!aiRes.ok) {
      const errText = await aiRes.text().catch(() => '')
      throw new Error(`Anthropic API ${aiRes.status}: ${errText.slice(0, 200)}`)
    }
    const data = await aiRes.json()
    const text = Array.isArray(data.content) && data.content[0] && data.content[0].text ? data.content[0].text : ''
    const steps = parseSteps(text, count)
    if (!steps || steps.length === 0) {
      return res.status(502).json({ error: 'Could not parse a sequence from the AI response — try again' })
    }
    return res.status(200).json({ steps, model: MODEL })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Generation failed' })
  }
}
