/**
 * Mailbox send — delivers an approved outbound email through the user's
 * connected mailbox.
 *
 * POST body: { provider, accessToken, from, to, subject, body }
 *   provider: 'gmail' | 'google'  (Gmail API)
 *
 * Returns: { id } on success, { error } otherwise.
 *
 * The access token is supplied by the client from the stored integration
 * credential (same pattern as the other /api proxies). No secrets here.
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function base64Url(str) {
  return Buffer.from(str, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// Encode a header value that may contain non-ASCII chars (RFC 2047).
function encodeHeader(value) {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  return `=?UTF-8?B?${Buffer.from(value, 'utf-8').toString('base64')}?=`
}

function buildMime({ from, to, subject, body }) {
  const html = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')
  const lines = [
    from ? `From: ${from}` : null,
    `To: ${to}`,
    `Subject: ${encodeHeader(subject || '')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    `<div>${html}</div>`,
  ].filter(Boolean)
  return lines.join('\r\n')
}

async function sendGmail({ accessToken, from, to, subject, body }) {
  const raw = base64Url(buildMime({ from, to, subject, body }))
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || `Gmail API error ${res.status}`
    throw new Error(msg)
  }
  return data.id
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v))
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { provider, accessToken, from, to, subject, body } = req.body ?? {}

  if (!to || !to.includes('@')) return res.status(400).json({ error: 'Valid recipient (to) is required' })
  if (!accessToken) return res.status(400).json({ error: 'Missing mailbox access token' })

  try {
    if (provider === 'gmail' || provider === 'google') {
      const id = await sendGmail({ accessToken, from, to, subject, body })
      return res.status(200).json({ id, provider: 'gmail' })
    }
    return res.status(400).json({ error: `Sending via "${provider}" is not supported yet. Connect a Gmail mailbox.` })
  } catch (err) {
    return res.status(502).json({ error: err?.message ?? 'Send failed' })
  }
}
