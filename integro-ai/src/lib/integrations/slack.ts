import type { SlackChannel, TestResult } from './types'
import { MOCK_SLACK_CHANNELS } from './mock'

const BASE = 'https://slack.com/api'

function isDemoKey(token: string): boolean {
  return token.includes('demo') || token.includes('xxxx') || token.startsWith('xoxb-demo')
}

export async function fetchChannels(token: string): Promise<SlackChannel[]> {
  if (isDemoKey(token)) return MOCK_SLACK_CHANNELS
  const res = await fetch(
    `${BASE}/conversations.list?types=public_channel,private_channel&limit=50`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) throw new Error(`Slack API ${res.status}`)
  const data = await res.json() as { ok: boolean; error?: string; channels: SlackChannel[] }
  if (!data.ok) throw new Error(data.error ?? 'Slack API error')
  return data.channels
}

export async function testConnection(token: string): Promise<TestResult> {
  if (isDemoKey(token)) {
    await new Promise(r => setTimeout(r, 600))
    return { ok: true, data: { team: 'Integro Strategies' } }
  }
  try {
    const res = await fetch(`${BASE}/auth.test`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { ok: false, error: `Slack API error ${res.status}` }
    const data = await res.json() as { ok: boolean; error?: string; team?: string }
    if (!data.ok) {
      if (data.error === 'invalid_auth') return { ok: false, error: 'Invalid bot token — verify your Slack App Bot Token (xoxb-...)' }
      return { ok: false, error: data.error ?? 'Slack auth failed' }
    }
    return { ok: true, data: { team: data.team } }
  } catch {
    return { ok: false, error: 'Network error reaching Slack API' }
  }
}

export async function sendMessage(token: string, channel: string, text: string): Promise<{ ok: boolean }> {
  if (isDemoKey(token)) return { ok: true }
  try {
    const res = await fetch(`${BASE}/chat.postMessage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text }),
    })
    const data = await res.json() as { ok: boolean }
    return { ok: data.ok }
  } catch {
    return { ok: false }
  }
}
