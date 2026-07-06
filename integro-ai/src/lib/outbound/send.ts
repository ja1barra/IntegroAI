// ── Mailbox send (client wrapper) ────────────────────────────
// Sends an approved email through the user's connected mailbox via the
// /api/agent/send serverless function. When no real mailbox is connected
// (demo mode), the send is simulated so the full pipeline is demoable.

import { supabase } from '../supabase'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface Mailbox {
  provider: string
  email: string
  token: string | null
}

export interface SendResult {
  ok: boolean
  id?: string
  error?: string
  simulated?: boolean
}

const ENDPOINT = '/api/agent/send'
const MAILBOX_PROVIDERS = ['gmail', 'google', 'outreach']

// OAuth credentials are stored as a JSON token bundle in key_encrypted.
// Extract the usable bearer token (or fall back to a raw string).
function extractToken(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.access_token === 'string') return parsed.access_token
  } catch { /* not JSON — treat as a raw token */ }
  return raw
}

// Find a connected sending mailbox for the current user, if any.
export async function getMailbox(): Promise<Mailbox | null> {
  const { data } = await supabase
    .from('integrations')
    .select('provider, workspace_name, key_encrypted, connected')
    .in('provider', MAILBOX_PROVIDERS)
    .eq('connected', true)
    .limit(1)
  const row = (data as any[])?.[0]
  if (!row) return null
  return { provider: row.provider, email: row.workspace_name ?? '', token: extractToken(row.key_encrypted) }
}

// Connect a Gmail sending mailbox via OAuth and persist the token.
export async function connectGmail(): Promise<{ ok: boolean; error?: string }> {
  const { startOAuthFlow, tokensToKey } = await import('../integrations/oauth')
  const { saveCredential } = await import('../integrations/credentialStore')
  const res = await startOAuthFlow('gmail')
  if (!res.ok || !res.tokens) return { ok: false, error: res.error ?? 'Connection cancelled' }
  await saveCredential('gmail', tokensToKey(res.tokens), { workspaceName: 'Gmail' })
  return { ok: true }
}

function isDemoToken(t: string | null): boolean {
  return !t || t.includes('demo') || t.includes('xxxx')
}

export async function sendEmail(
  mailbox: Mailbox | null,
  to: string,
  subject: string,
  body: string,
): Promise<SendResult> {
  // No real mailbox / demo token → simulate so the pipeline still completes.
  if (!mailbox || isDemoToken(mailbox.token)) {
    await new Promise(r => setTimeout(r, 300))
    return { ok: true, id: 'demo-' + Math.random().toString(36).slice(2), simulated: true }
  }
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: mailbox.provider,
        accessToken: mailbox.token,
        from: mailbox.email,
        to,
        subject,
        body,
      }),
    })
    if (r.status === 404) {
      // Endpoint not deployed yet — simulate rather than hard-fail.
      return { ok: true, id: 'sim-' + Math.random().toString(36).slice(2), simulated: true }
    }
    const data = await r.json().catch(() => ({} as any))
    if (!r.ok) return { ok: false, error: data?.error ?? `Send failed (${r.status})` }
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }
}
