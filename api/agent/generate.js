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
 * Runs on the signed-in user's own connected AI provider (Anthropic,
 * OpenAI, Google, or a custom OpenAI-compatible endpoint — see the "AI
 * Provider" panel in Integrations) if they have one, otherwise falls back
 * to the server's shared ANTHROPIC_API_KEY. If neither is available the
 * function returns 400 so the client falls back to deterministic
 * mail-merge personalization.
 */

import { getAuthedUser, resolveAIProvider, chatComplete } from './_provider.js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

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

async function generateOne(config, sender, step, p) {
  const { text } = await chatComplete(config, {
    system: 'You are an expert B2B SDR who writes concise, highly personalized cold emails that get replies. You always respond with valid JSON only.',
    prompt: buildPrompt(sender, step, p),
    maxTokens: 1200,
    effort: 'low',
  })
  const parsed = parseResult(text, p.company)
  return { id: p.id, subject: parsed.subject, body: parsed.body }
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const auth = await getAuthedUser(req)
  if (!auth) return res.status(401).json({ error: 'Sign in required' })

  const resolved = await resolveAIProvider(auth)
  if (!resolved) {
    return res.status(400).json({ error: 'No AI provider configured — connect your own AI provider in Integrations.' })
  }

  const { sender = {}, step = {}, prospects } = req.body ?? {}
  if (!Array.isArray(prospects) || prospects.length === 0) {
    return res.status(400).json({ error: 'prospects array is required' })
  }

  const batch = prospects.slice(0, MAX_PROSPECTS)

  try {
    const results = await Promise.all(batch.map(p => generateOne(resolved.config, sender, step, p)))
    return res.status(200).json({ results, model: resolved.config.model || resolved.config.provider })
  } catch (err) {
    return res.status(500).json({ error: err?.message ?? 'Generation failed' })
  }
}
