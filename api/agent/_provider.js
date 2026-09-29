/**
 * Shared AI-provider resolution and chat-completion helper for the agent
 * endpoints. Underscore-prefixed — Vercel ignores underscore-prefixed files
 * under /api for routing, so this doesn't count against the 12-function
 * cap noted in generate-sequence.js, but can still be imported.
 *
 * Each signed-in user can connect their own AI provider (Anthropic, OpenAI,
 * Google, or any OpenAI-compatible endpoint) from the "AI Provider" panel
 * in Integrations — see supabase/ai-provider-schema.sql. When a user has
 * one connected, generation runs on their key/account instead of Integro's
 * shared ANTHROPIC_API_KEY, so Integro is never billed for their usage.
 * The shared key (if configured) is kept only as a fallback for users who
 * haven't connected their own provider yet.
 */

import { cfg } from '../_lib/env.js'
import { getAuthedUser as sharedGetAuthedUser } from '../_lib/auth.js'

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const GOOGLE_MODELS_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'google', 'custom']

// ── auth ─────────────────────────────────────────────────────

// Session verification now lives in the shared module (_lib/auth.js) so the
// legacy agent endpoints and the Revenue API use one implementation. This
// wrapper keeps the historic contract: { token, supabaseUrl, anonKey } | null
// (userId is added for the per-tenant legacy gate below).
export async function getAuthedUser(req) {
  return sharedGetAuthedUser(req, cfg())
}

// Server-side kill switch: tenants migrated to Revenue Manager
// (revenue_org_flags.legacy_outreach_enabled = false) cannot use the SDR /
// outreach / send endpoints, regardless of what the client UI shows.
// It calls rv_my_legacy_outreach_allowed() with the CALLER's own JWT + anon key, so it works without a
// service-role key and only ever reveals the caller's own flag.
// Returns true (allowed), false (blocked) or null when the gate could not be evaluated (callers answer 503:
// fail closed). "Function not found" means the Revenue migration has not been applied yet => allowed.
export async function legacyOutreachEnabledFor(auth, fetchImpl = fetch) {
  try {
    const r = await fetchImpl(`${auth.supabaseUrl}/rest/v1/rpc/rv_my_legacy_outreach_allowed`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, apikey: auth.anonKey, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 404) return true
    if (!r.ok) return null
    const v = await r.json()
    return v !== false
  } catch { return null }
}

export const LEGACY_UNAVAILABLE = { status: 503, body: { error: 'Service temporarily unavailable. Please try again.', code: 'dependency_unavailable' } }

export const LEGACY_DISABLED = {
  status: 403,
  body: { error: 'This workspace has moved to Integro Revenue Manager. Outbound sequences and AI Provider (BYOM) are disabled.', code: 'legacy_outreach_disabled' },
}

// ── provider resolution ──────────────────────────────────────

async function loadUserProviderRow(auth) {
  try {
    const r = await fetch(
      `${auth.supabaseUrl}/rest/v1/ai_provider_settings?select=provider,api_key,base_url,model`,
      { headers: { Authorization: `Bearer ${auth.token}`, apikey: auth.anonKey } }
    )
    if (!r.ok) return null
    const rows = await r.json()
    const row = Array.isArray(rows) ? rows[0] : null
    if (!row || !row.api_key || !row.provider) return null
    return { provider: row.provider, apiKey: row.api_key, baseUrl: row.base_url || undefined, model: row.model || undefined }
  } catch {
    return null
  }
}

// Resolve the AI provider config to use for this request. Returns
// { config, byok } or null if neither the user nor the server has one.
export async function resolveAIProvider(auth) {
  const own = await loadUserProviderRow(auth)
  if (own) return { config: own, byok: true }
  const sharedKey = process.env.ANTHROPIC_API_KEY
  if (!sharedKey) return null
  return { config: { provider: 'anthropic', apiKey: sharedKey, model: DEFAULT_ANTHROPIC_MODEL }, byok: false }
}

// ── chat completion (provider-agnostic) ──────────────────────

// Sonnet 5 runs adaptive thinking by default — the response's `content`
// array leads with a `thinking` block (no `.text` field), not the text
// block, so it must be located by type rather than assumed to be index 0.
// With web search on, server-tool turns interleave text/tool blocks, so
// the *last* text block (the final answer after any research commentary)
// is the one callers want.
function extractAnthropicText(data, preferLast) {
  const blocks = Array.isArray(data.content)
    ? data.content.filter(b => b && b.type === 'text' && typeof b.text === 'string')
    : []
  if (blocks.length === 0) return ''
  return preferLast ? blocks[blocks.length - 1].text : blocks[0].text
}

function extractAnthropicSources(data) {
  const out = []
  const seen = new Set()
  const content = Array.isArray(data.content) ? data.content : []
  for (const block of content) {
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

async function callAnthropic(config, { system, prompt, maxTokens, effort, webSearch }) {
  const body = {
    model: config.model || DEFAULT_ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    output_config: { effort: effort || 'low' },
    system,
    messages: [{ role: 'user', content: prompt }],
  }
  if (webSearch) body.tools = [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }]

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Anthropic API ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  return { text: extractAnthropicText(data, webSearch), sources: webSearch ? extractAnthropicSources(data) : [] }
}

// OpenAI's /chat/completions shape is the de facto standard most
// "OpenAI-compatible" providers (Ollama, LM Studio, OpenRouter, Groq,
// Together, Azure OpenAI, etc.) implement, so this one function covers
// OpenAI itself and any custom base URL. Note: some newer reasoning-only
// models require `max_completion_tokens` instead of `max_tokens` and will
// reject this request — not supported yet.
async function callOpenAICompatible(config, { system, prompt, maxTokens }, baseUrl) {
  if (!config.model) throw new Error('A model name is required for this AI provider')
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`AI provider error ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = data?.choices?.[0]?.message?.content
  return { text: typeof text === 'string' ? text : '', sources: [] }
}

async function callGoogle(config, { system, prompt, maxTokens }) {
  if (!config.model) throw new Error('A model name is required for Google AI (e.g. gemini-2.5-flash)')
  const url = `${GOOGLE_MODELS_BASE}/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${system}\n\n${prompt}` }] }],
      generationConfig: { maxOutputTokens: maxTokens },
    }),
  })
  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Google AI error ${res.status}: ${errText.slice(0, 200)}`)
  }
  const data = await res.json()
  const text = Array.isArray(data?.candidates?.[0]?.content?.parts)
    ? data.candidates[0].content.parts.map(p => (typeof p?.text === 'string' ? p.text : '')).join('')
    : ''
  return { text, sources: [] }
}

// Provider-agnostic chat completion. Returns { text, sources } — `sources`
// is only ever populated for Anthropic with webSearch: true (the only
// provider wired up for web-research playbooks right now; see the
// mode === 'web' gate in generate-sequence.js).
export async function chatComplete(config, opts) {
  switch (config.provider) {
    case 'anthropic':
      return callAnthropic(config, opts)
    case 'openai':
      return callOpenAICompatible(config, opts, DEFAULT_OPENAI_BASE_URL)
    case 'custom':
      if (!config.baseUrl) throw new Error('A base URL is required for a custom AI provider')
      return callOpenAICompatible(config, opts, config.baseUrl)
    case 'google':
      return callGoogle(config, opts)
    default:
      throw new Error(`Unsupported AI provider: ${config.provider}`)
  }
}
