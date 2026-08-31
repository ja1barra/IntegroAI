import { NextRequest, NextResponse } from 'next/server'

// Minimal shared-secret gate for the internal agent-console API routes.
// These routes use the Supabase *service role* client (bypasses RLS), so
// without this check anyone who finds the deployed URL could read or
// mutate every user's outbound emails. Set AGENT_CONSOLE_API_KEY and send
// it as `Authorization: Bearer <key>` (or `x-api-key: <key>`) from any
// caller (including n8n's webhook config).
export function unauthorized(req: NextRequest): NextResponse | null {
  const expected = process.env.AGENT_CONSOLE_API_KEY
  if (!expected) {
    // Fail closed rather than silently running with no protection.
    return NextResponse.json(
      { error: 'Server misconfigured: AGENT_CONSOLE_API_KEY is not set' },
      { status: 500 },
    )
  }
  const header = req.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null
  const provided = bearer ?? req.headers.get('x-api-key')
  if (provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
