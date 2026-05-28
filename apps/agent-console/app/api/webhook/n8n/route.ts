import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prospects }),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
