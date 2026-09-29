import { supabase } from '../supabase'

export class ApiError extends Error {
  status: number
  code: string
  requestId?: string
  reason?: string
  constructor(status: number, code: string, message: string, requestId?: string, reason?: string) {
    super(message)
    this.status = status
    this.code = code
    this.requestId = requestId
    this.reason = reason
  }
}

type Query = Record<string, string | number | undefined | null>

// Calls the Revenue API with the signed-in user's session. A 503 or a network
// failure is reported as such (ApiError) and never treated as a logout.
export async function api<T>(path: string, opts: { method?: 'GET' | 'POST'; body?: unknown; query?: Query } = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
  let res: Response
  try {
    res = await fetch(`/api/${path}${qs.toString() ? `?${qs}` : ''}`, {
      method: opts.method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    })
  } catch {
    throw new ApiError(0, 'network', 'Cannot reach the server')
  }
  const text = await res.text()
  let json: unknown = null
  try { json = text ? JSON.parse(text) : null } catch { /* non-JSON (e.g. platform error page) */ }
  if (!res.ok) {
    const e = (json as { error?: { code?: string; message?: string; request_id?: string; reason?: string } } | null)?.error
    throw new ApiError(res.status, e?.code ?? (res.status === 404 ? 'not_found' : 'error'), e?.message ?? `Request failed (${res.status})`, e?.request_id, e?.reason)
  }
  return json as T
}
