/**
 * AI content-drafting endpoint for three related, low-traffic jobs. Kept as
 * one Vercel Serverless Function (rather than separate files) because the
 * Hobby plan caps a deployment at 12 functions — see the "kind" dispatch
 * below.
 *
 * All kinds run on the signed-in user's own connected AI provider
 * (Anthropic, OpenAI, Google, or a custom OpenAI-compatible endpoint — see
 * the "AI Provider" panel in Integrations) when they have one, otherwise
 * fall back to the server's shared ANTHROPIC_API_KEY. See api/agent/_provider.js.
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
 *   (mode: "web"), returning the sources it found. Web research currently
 *   requires the effective provider to be Anthropic (the only provider
 *   wired up with a web-search tool here) — other providers get a clear
 *   400 telling them to switch modes or connect Anthropic.
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
 * kind: "test-provider" — verifies a not-yet-saved AI provider's
 *   credentials work, for the "Test Connection" button in the AI Provider
 *   panel. Does not touch the user's saved provider or the shared key.
 *
 *   POST body: { kind: "test-provider", provider, apiKey, baseUrl?, model? }
 *   Returns: { ok: boolean, error?: string, sample?: string }
 *
 * All kinds require a signed-in Supabase user.
 */

import { getAuthedUser, resolveAIProvider, chatComplete, SUPPORTED_PROVIDERS } from './_provider.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const MIN_STEPS = 2
const MAX_STEPS = 6

const PLAYBOOK_CATEGORIES = [
  'Outbound Prospecting', 'Discovery & Qualification', 'Deal Negotiation',
  'Competitive Displacement', 'Onboarding & Activation', 'Expansion & Upsell',
  'Renewal & Retention', 'Win/Loss Response', 'General',
]

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

async function handleSequence(req, res, config) {
  const { sender = {}, brief, stepCount } = req.body ?? {}
  if (!brief || !brief.trim()) {
    return res.status(400).json({ error: 'brief is required — describe who you\'re targeting and the angle' })
  }
  const count = Math.min(MAX_STEPS, Math.max(MIN_STEPS, Number.isFinite(stepCount) ? Math.round(stepCount) : 3))

  try {
    const { text } = await chatComplete(config, {
      system: 'You are an expert B2B SDR who designs high-converting cold outbound sequences. You always respond with valid JSON only.',
      prompt: buildSequencePrompt(sender, brief.trim(), count),
      maxTokens: 4096,
      effort: 'low',
    })
    const steps = parseSteps(text, count)
    if (!steps || steps.length === 0) {
      return res.status(502).json({ error: 'Could not parse a sequence from the AI response — try again' })
    }
    return res.status(200).json({ steps, model: config.model || config.provider })
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

function parsePlaybook(text) {
  if (!text) return null
  const t = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  try {
    const obj = JSON.parse(t)
    if (obj && typeof obj.title === 'string' && Array.isArray(obj.plays)) return obj
  } catch {
    // fall through
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

async function handlePlaybook(req, res, config) {
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
  if (mode === 'web' && config.provider !== 'anthropic') {
    return res.status(400).json({
      error: 'Web-research playbooks currently require an Anthropic (Claude) AI provider. Use "CRM data" mode instead, or set your AI provider to Anthropic in Integrations.',
    })
  }

  const prompt = mode === 'crm'
    ? buildCrmPrompt(sender, crmContext, topic)
    : buildWebPrompt(sender, topic)

  try {
    const { text, sources } = await chatComplete(config, {
      system: 'You are an expert B2B SaaS revenue strategist who writes tactical, evidence-grounded growth playbooks. You always respond with valid JSON only, as your final message.',
      prompt,
      maxTokens: 4096,
      effort: mode === 'web' ? 'medium' : 'low',
      webSearch: mode === 'web',
    })
    const raw = parsePlaybook(text)
    if (!raw) {
      return res.status(502).json({ error: 'Could not parse a playbook from the AI response — try again' })
    }
    const playbook = sanitizePlaybook(raw)
    if (playbook.plays.length === 0) {
      return res.status(502).json({ error: 'AI returned no usable plays — try rephrasing and generate again' })
    }
    return res.status(200).json({ playbook, sources: mode === 'web' ? sources : [], model: config.model || config.provider })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Generation failed' })
  }
}

// ── kind: "test-provider" ────────────────────────────────────

async function handleTestProvider(req, res) {
  const { provider, apiKey, baseUrl, model } = req.body ?? {}
  if (!provider || !apiKey) {
    return res.status(400).json({ error: 'provider and apiKey are required' })
  }
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: `Unsupported provider: ${provider}` })
  }
  if (provider === 'custom' && !baseUrl) {
    return res.status(400).json({ error: 'A base URL is required for a custom provider' })
  }

  const config = { provider, apiKey, baseUrl: baseUrl || undefined, model: model || undefined }

  try {
    const { text } = await chatComplete(config, {
      system: 'Reply with exactly one word and nothing else.',
      prompt: 'Reply with only the word: OK',
      maxTokens: 20,
      effort: 'low',
    })
    const ok = typeof text === 'string' && text.trim().length > 0
    return res.status(200).json({ ok, sample: ok ? text.trim().slice(0, 40) : undefined, error: ok ? undefined : 'AI provider returned an empty response' })
  } catch (err) {
    return res.status(200).json({ ok: false, error: err?.message ?? 'Connection test failed' })
  }
}

// ── dispatch ─────────────────────────────────────────────────

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await getAuthedUser(req)
  if (!auth) return res.status(401).json({ error: 'Sign in required' })

  if (req.body?.kind === 'test-provider') return handleTestProvider(req, res)

  const resolved = await resolveAIProvider(auth)
  if (!resolved) {
    return res.status(400).json({ error: 'No AI provider configured — connect your own AI provider in Integrations.' })
  }

  if (req.body?.kind === 'playbook') return handlePlaybook(req, res, resolved.config)
  return handleSequence(req, res, resolved.config)
}
