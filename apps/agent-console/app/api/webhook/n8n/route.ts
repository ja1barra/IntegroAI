import { NextRequest, NextResponse } from 'next/server'
import { unauthorized } from '@/lib/authorize'

export async function POST(req: NextRequest) {
  const authError = unauthorized(req)
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // n8n may send an array directly, a {prospects:[...]} wrapper, or a single object
  const prospects = Array.isArray(body)
    ? body
    : (body as Record<string, unknown>).prospects
      ? (body as { prospects: unknown[] }).prospects
      : [body]

  const origin = req.nextUrl.origin
  const res = await fetch(`${origin}/api/agent/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.AGENT_CONSOLE_API_KEY}`,
    },
    body: JSON.stringify({ prospects }),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
