/**
 * AI growth playbook generation — Agent 04 (Growth Playbooks).
 *
 * Two modes:
 *  - "crm": drafts a playbook from a CRM win/loss summary the client
 *    already computed from connected HubSpot/Salesforce data (see
 *    src/lib/playbooks/crmSummary.ts). No web access needed.
 *  - "web": researches the given topic live with the web_search tool and
 *    drafts a playbook from current best practices, returning the sources
 *    it actually found.
 *
 * POST body:
 *   {
 *     sender: { name, company, valueProp? },
 *     mode:   'crm' | 'web',
 *     topic?: string,        // focus area — required for "web", optional for "crm"
 *     crmContext?: string,   // required for "crm" — plain-text CRM summary
 *   }
 *
 * Returns: { playbook: { title, description, category, plays, tags }, sources: [{title,url}], model }
 *
 * Requires env var ANTHROPIC_API_KEY and a signed-in Supabase user (same
 * gate as /api/agent/generate-sequence — this also spends the shared key).
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const MODEL = 'claude-sonnet-5'

const CATEGORIES = [
  'Outbound Prospecting', 'Discovery & Qualification', 'Deal Negotiation',
  'Competitive Displacement', 'Onboarding & Activation', 'Expansion & Upsell',
  'Renewal & Retention', 'Win/Loss Response', 'General',
]

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

const RESPONSE_SHAPE =
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
- Pick exactly one category from: ${CATEGORIES.join(', ')}.
- 2-5 short tags, lowercase, no "#".

Respond with ONLY a JSON object, no markdown, no commentary, in exactly this shape:
${RESPONSE_SHAPE}`
}

function buildWebPrompt(sender, topic) {
  return `You are a B2B SaaS revenue strategist. Use web search to research current, credible best practices for the topic below, then turn what you find into a tactical growth playbook.

From: ${sender.name || 'the sender'} at ${sender.company || 'our company'}.${sender.valueProp ? ` What we do: ${sender.valueProp}.` : ''}

Topic to research: "${topic.trim()}"

Guidelines:
- Search the web for credible, current sources (sales leadership blogs, SaaS benchmark reports, RevOps research, case studies) — don't rely on memory alone, and prefer recent material.
- Write 4-6 plays informed by what you found. Each play: a punchy title and a 2-4 sentence description ending in a concrete, actionable step.
- Pick exactly one category from: ${CATEGORIES.join(', ')}.
- 2-5 short tags, lowercase, no "#".

After you finish researching, respond with ONLY a JSON object as your final message, no markdown, no commentary before or after it, in exactly this shape:
${RESPONSE_SHAPE}`
}

// Sonnet 5 runs adaptive thinking by default, and server-tool turns
// interleave text/tool blocks — collect every text block in order rather
// than assuming the first (or only) block is the answer.
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
  const category = CATEGORIES.includes(raw.category) ? raw.category : 'General'
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
    const data = await aiRes.json()
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
