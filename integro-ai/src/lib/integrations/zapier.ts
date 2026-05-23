import type { TestResult } from './types'

export function isDemoKey(key: string): boolean {
  return !key || key.includes('demo') || key.includes('xxxx') || !key.startsWith('https://')
}

// Zapier uses incoming Webhooks — the "credential" is the webhook URL itself
export async function testConnection(webhookUrl: string): Promise<TestResult> {
  if (isDemoKey(webhookUrl)) {
    await new Promise(r => setTimeout(r, 600))
    return { ok: true, data: { total: 0 } }
  }
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'integro_test',
        source: 'IntegroAI',
        timestamp: new Date().toISOString(),
        data: { message: 'Connection test from IntegroAI — if you see this, the webhook is working!' },
      }),
    })
    if (!res.ok) return { ok: false, error: `Webhook returned ${res.status} — verify the URL in your Zap` }
    return { ok: true, data: { total: 0 } }
  } catch (err) {
    return { ok: false, error: `Webhook unreachable: ${err instanceof Error ? err.message : 'Unknown error'}` }
  }
}

export async function triggerWebhook(
  webhookUrl: string,
  event: string,
  data: Record<string, unknown>
): Promise<boolean> {
  if (isDemoKey(webhookUrl)) return true
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, source: 'IntegroAI', timestamp: new Date().toISOString(), data }),
    })
    return res.ok
  } catch {
    return false
  }
}
