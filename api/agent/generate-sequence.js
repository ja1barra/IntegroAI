/**
 * AI content-drafting endpoint for two related agents. Kept as one
 * Vercel Serverless Function (rather than a second file) because the
 * Hobby plan caps a deployment at 12 functions — see the "kind" dispatch
 * below.
 *
 * kind omitted / "sequence" — Outbound Sales Machine (Agent 01):
 *   drafts a full multi-step outbound sequence (subject + body per step,
 *   with {{placeholders}}) from a short brief, for the Sequence Builder.
 *   This is distinct from /api/agent/generate: that endpoint personalizes
 *   an existing template per prospect at send time. This one writes the
 *   reusable template itself, before any prospect is involved.
 *
 *   POST body:
 *     { sender: { name, company, valueProp? }, brief: string, stepCount: number }
 *   Returns: { steps: [ { type, delay, subject, body }, ... ] }
 *
 * kind: "playbook" — Growth Playbooks (Agent 04):
 *   drafts a tactical growth playbook either from a CRM win/loss summary
 *   the client already computed (mode: "crm"), or from live web research
 *   via the web_search tool (mode: "web"), returning the sources it found.
 *
 *   POST body:
 *     {
 *       sender: { name, company, valueProp? },
 *       kind: "playbook",
 *       mode: 'crm' | 'web',
 *       topic?: string,        // focus area — required for "web", optional for "crm"
 *       crmContext?: string,   // required for "crm" — plain-text CRM summary
 *     }
 *   Returns: { playbook: { title, description, category, plays, tags }, sources: [{title,url}], model }
 *
 * Both kinds require env var ANTHROPIC_API_KEY and a signed-in Supabase
 * user (same gate as /api/agent/generate — this also spends the shared key).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const MODEL = 'claude-sonnet-5'
const MIN_STEPS = 2
const MAX_STEPS = 6

const PLAYBOOK_CATEGORIES = [
  'Outbound Prospecting', 'Discovery & Qualification', 'Deal Negotiation',
  'Competitive Displacement', 'Onboarding & Activation', 'Expansion & Upsell',
  'Renewal & Retention', 'Win/Loss Response', 'General',
]

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

async function callAnthropic(apiKey, body) {
  const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!aiRes.ok) {
    const errText = await aiRes.text().catch(() => '')
    throw new Error(`Anthropic API ${aiRes.status}: ${errText.slice(0, 200)}`)
  }
  return aiRes.json()
}

// ── kind: "sequence" ──────────────────────────────────────────

function buildSequencePrompt(sender, brief, stepCount) {
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

// Sonnet 5 runs adaptive thinking by default — the response's `content`
// array leads with a `thinking` block (no `.text` field), not the text
// block, so it must be located by type rather than assumed to be index 0.
function extractText(data) {
  const block = Array.isArray(data.content) ? data.content.find(b => b && b.type === 'text') : null
  return block && typeof block.text === 'string' ? block.text : ''
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

async function handleSequence(req, res, apiKey) {
  const { sender = {}, brief, stepCount } = req.body ?? {}
  if (!brief || !brief.trim()) {
    return res.status(400).json({ error: 'brief is required — describe who you\'re targeting and the angle' })
  }
  const count = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Number.isFinite(stepCount) ? Math.round(stepCount) : 3))

  try {
    const data = await callAnthropic(apiKey, {
      model: MODEL,
      max_tokens: 4096,
      output_config: { effort: 'low' },
      system: 'You are an expert B2B SDR who designs high-converting cold outbound sequences. You always respond with valid JSON only.',
      messages: [{ role: 'user', content: buildSequencePrompt(sender, brief.trim(), count) }],
    })
    const steps = parseSteps(extractText(data), count)
    if (!steps || steps.length === 0) {
      return res.status(502).json({ error: 'Could not parse a sequence from the AI response — try again' })
    }
    return res.status(200).json({ steps, model: MODEL })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Generation failed' })
  }
}

// ── kind: "playbook" ──────────────────────────────────────────

const PLAYBOOK_RESPONSE_SHAPE =
  '{"title": "...", "description": "<1-2 sentence summary of the playbook>", "category": "<one of the categories above>", ' +
  '"plays": [{"title": "<punchy play name, under 60 chars>", "description": "<2-4 sentences, ending in a concrete action a rep can take this week>"}], ' +
  '"tags": ["<2-5 short lowercase tags>"]}'

function buildCrmPrompt(sender, crmContext, topic) {
  return `You are a B2B SaaS revenue strategist building a tactical growth playbook from a real sales team's CRM pipeline data.

From: ${sender.name || 'the sender'} at ${sender.company || 'our company'}.${sender.valueProp ? ` What we do: ${sender.valueProp}.` : ''}

CRM win/loss snapshot:
"""
${crmContext}
"""
${topic && topic.trim() ? `\nFocus this playbook on: "${topic.trim()}"\n` : ''}
Guidelines:
- Write 4-6 plays. Ground every play in something the pipeline data above actually implies (a stage deals stall in, a pattern in what's winning, deal size) — do not invent generic sales advice disconnected from this data.
- Each play: a punchy title and a 2-4 sentence description ending in a concrete action a rep or manager can take this week.
- Pick exactly one category from: ${PLAYBOOK_CATEGORIES.join(', ')}.
- 2-5 short tags, lowercase, no "#".

Respond with ONLY a JSON object, no markdown, no commentary, in exactly this shape:
${PLAYBOOK_RESPONSE_SHAPE}`
}

function buildWebPrompt(sender, topic) {
  return `You are a B2B SaaS revenue strategist. Use web search to research current, credible best practices for the topic below, then turn what you find into a tactical growth playbook.

From: ${sender.name || 'the sender'} at ${sender.company || 'our company'}.${sender.valueProp ? ` What we do: ${sender.valueProp}.` : ''}

Topic to research: "${topic.trim()}"

Guidelines:
- Search the web for credible, current sources (sales leadership blogs, SaaS benchmark reports, RevOps research, case studies) — don't rely on memory alone, and prefer recent material.
- Write 4-6 plays informed by what you found. Each play: a punchy title and a 2-4 sentence description ending in a concrete, actionable step.
- Pick exactly one category from: ${PLAYBOOK_CATEGORIES.join(', ')}.
- 2-5 short tags, lowercase, no "#".

After you finish researching, respond with ONLY a JSON object as your final message, no markdown, no commentary before or after it, in exactly this shape:
${PLAYBOOK_RESPONSE_SHAPE}`
}

// Server-tool turns interleave text/tool blocks — collect every text block
// in order rather than assuming the first (or only) block is the answer.
function extractTextBlocks(data) {
  if (!Array.isArray(data.content)) return []
  return data.content.filter(b => b && b.type === 'text' && typeof b.text === 'string').map(b => b.text)
}

function extractSources(data) {
  if (!Array.isArray(data.content)) return []
  const out = []
  const seen = new Set()
  for (const block of data.content) {
    if (!block || block.type !== 'web_search_tool_result') continue
    const results = Array.isArray(block.content) ? block.content : []
    for (const r of results) {
      if (!r || !r.url || seen.has(r.url)) continue
      seen.add(r.url)
      out.push({ title: typeof r.title === 'string' ? r.title : r.url, url: r.url })
    }
  }
  return out.slice(0, 6)
}

function parsePlaybook(textBlocks) {
  // Try from the last block backwards — the final JSON answer is usually
  // the last text block, especially after web-search commentary.
  for (let i = textBlocks.length - 1; i >= 0; i--) {
    const t = textBlocks[i].trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
    if (!t) continue
    try {
      const obj = JSON.parse(t)
      if (obj && typeof obj.title === 'string' && Array.isArray(obj.plays)) return obj
    } catch {
      /* try previous block */
    }
  }
  return null
}

function sanitizePlaybook(raw) {
  const category = PLAYBOOK_CATEGORIES.includes(raw.category) ? raw.category : 'General'
  const plays = (Array.isArray(raw.plays) ? raw.plays : [])
    .map(p => ({
      title: typeof p?.title === 'string' ? p.title.slice(0, 120) : '',
      description: typeof p?.description === 'string' ? p.description : '',
    }))
    .filter(p => p.title && p.description)
  const tags = (Array.isArray(raw.tags) ? raw.tags : [])
    .filter(t => typeof t === 'string' && t.trim())
    .map(t => t.trim().toLowerCase())
    .slice(0, 6)
  return {
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim().slice(0, 150) : 'Untitled Playbook',
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    category,
    plays,
    tags,
  }
}

async function handlePlaybook(req, res, apiKey) {
  const { sender = {}, mode, topic, crmContext } = req.body ?? {}
  if (mode !== 'crm' && mode !== 'web') {
    return res.status(400).json({ error: 'mode must be "crm" or "web"' })
  }
  if (mode === 'crm' && (!crmContext || !crmContext.trim())) {
    return res.status(400).json({ error: 'crmContext is required for mode "crm"' })
  }
  if (mode === 'web' && (!topic || !topic.trim())) {
    return res.status(400).json({ error: 'topic is required for mode "web"' })
  }

  const prompt = mode === 'crm'
    ? buildCrmPrompt(sender, crmContext, topic)
    : buildWebPrompt(sender, topic)

  const body = {
    model: MODEL,
    max_tokens: 4096,
    output_config: { effort: mode === 'web' ? 'medium' : 'low' },
    system: 'You are an expert B2B SaaS revenue strategist who writes tactical, evidence-grounded growth playbooks. You always respond with valid JSON only, as your final message.',
    messages: [{ role: 'user', content: prompt }],
  }
  if (mode === 'web') {
    body.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }]
  }

  try {
    const data = await callAnthropic(apiKey, body)
    const textBlocks = extractTextBlocks(data)
    const raw = parsePlaybook(textBlocks)
    if (!raw) {
      return res.status(502).json({ error: 'Could not parse a playbook from the AI response — try again' })
    }
    const playbook = sanitizePlaybook(raw)
    if (playbook.plays.length === 0) {
      return res.status(502).json({ error: 'AI returned no usable plays — try rephrasing and generate again' })
    }
    const sources = mode === 'web' ? extractSources(data) : []
    return res.status(200).json({ playbook, sources, model: MODEL })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Generation failed' })
  }
}

// ── dispatch ─────────────────────────────────────────────────

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

  if (req.body?.kind === 'playbook') return handlePlaybook(req, res, apiKey)
  return handleSequence(req, res, apiKey)
}
