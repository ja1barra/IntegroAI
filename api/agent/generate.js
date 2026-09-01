/**
 * AI outbound email generation — Agent 01 (Outbound Sales Machine).
 *
 * POST body:
 *   {
 *     sender:   { name, company, valueProp? },
 *     step:     { subject?, body?, type? },   // sequence step template / guidance
 *     prospects:[ { id, firstName, lastName, title, company, website? } ]
 *   }
 *
 * Returns: { results: [ { id, subject, body } ] }
 *
 * Requires env var ANTHROPIC_API_KEY. If it is missing the function returns
 * 400 so the client falls back to deterministic mail-merge personalization.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MODEL = 'claude-sonnet-5'
const MAX_PROSPECTS = 25

function buildPrompt(sender, step, p) {
  const template = (step && step.body && step.body.trim())
    ? `\n\nUse this as the template / talking points (personalize it, keep the intent, replace any {{placeholders}}):\n"""\n${step.body}\n"""`
    : ''
  const subjectHint = (step && step.subject && step.subject.trim())
    ? `\nSuggested subject direction: "${step.subject}"`
    : ''
  return `Write a short, personalized cold outbound email.

Recipient: ${p.firstName || ''} ${p.lastName || ''}, ${p.title || 'a leader'} at ${p.company || 'their company'}${p.website ? ` (${p.website})` : ''}.

From: ${sender.name || 'the sender'} at ${sender.company || 'our company'}.${sender.valueProp ? ` What we do: ${sender.valueProp}.` : ''}

Guidelines:
- 3 short paragraphs, under 130 words total.
- Open with a specific, relevant observation about their role or company.
- Connect to a concrete pain point, then one clear value statement.
- Single CTA: a 15-minute intro call.
- Warm, human, conversational — never corporate or generic.${subjectHint}${template}

Respond with ONLY a JSON object, no markdown, in exactly this shape:
{"subject": "<compelling subject line, under 60 chars>", "body": "<the email body with \\n line breaks>"}`
}

function parseResult(text, fallbackCompany) {
  if (!text) return null
  // Strip code fences if present
  let t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const obj = JSON.parse(t)
    if (obj && typeof obj.body === 'string') {
      return { subject: String(obj.subject || `Quick idea for ${fallbackCompany || 'your team'}`), body: obj.body }
    }
  } catch {
    // Not JSON — try to salvage: first line as subject-ish, rest as body
  }
  return { subject: `Quick idea for ${fallbackCompany || 'your team'}`, body: text.trim() }
}

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

// Sonnet 5 runs adaptive thinking by default — the response's `content`
// array leads with a `thinking` block (no `.text` field), not the text
// block, so it must be located by type rather than assumed to be index 0.
function extractText(data) {
  const block = Array.isArray(data.content) ? data.content.find(b => b && b.type === 'text') : null
  return block && typeof block.text === 'string' ? block.text : ''
}

async function generateOne(apiKey, sender, step, p) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1200,
      output_config: { effort: 'low' },
      system: 'You are an expert B2B SDR who writes concise, highly personalized cold emails that get replies. You always respond with valid JSON only.',
      messages: [{ role: 'user', content: buildPrompt(sender, step, p) }],
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = extractText(data)
  const parsed = parseResult(text, p.company)
  return { id: p.id, subject: parsed.subject, body: parsed.body }
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

  const { sender = {}, step = {}, prospects } = req.body ?? {}
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return res.status(400).json({ error: 'prospects array is required' })
  }

  const batch = prospects.slice(0, MAX_PROSPECTS)

  try {
    const results = await Promise.all(batch.map(p => generateOne(apiKey, sender, step, p)))
    return res.status(200).json({ results, model: MODEL })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Generation failed' })
  }
}
