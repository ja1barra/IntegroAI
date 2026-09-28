import { randomUUID } from 'node:crypto'

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message ?? code)
    this.status = status
    this.code = code
    this.extra = extra
  }
}

export const unauthorized = (m = 'Invalid or missing session') => new HttpError(401, 'unauthenticated', m)
export const forbidden = (m = 'Not allowed') => new HttpError(403, 'forbidden', m)
export const notFound = (m = 'Not found') => new HttpError(404, 'not_found', m)
export const badRequest = (m, extra) => new HttpError(400, 'bad_request', m, extra)
export const unavailable = (m = 'A dependency is temporarily unavailable') => new HttpError(503, 'dependency_unavailable', m)

export function requestId(req) {
  const inbound = req?.headers?.['x-request-id']
  return typeof inbound === 'string' && /^[\w-]{8,64}$/.test(inbound) ? inbound : randomUUID()
}

// Only same-origin browser calls are expected (Bearer token, no cookies), so
// CORS is restricted to the app origin rather than '*'. Bearer-token auth is
// not ambient (a foreign site cannot make the browser attach it), which is why
// no CSRF token is needed; if cookie auth is ever added, add CSRF protection.
export function applyCors(req, res, appBaseUrl) {
  const origin = req.headers?.origin
  if (origin && appBaseUrl && origin === appBaseUrl) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-Id')
}

export function send(res, status, body, rid) {
  res.setHeader('Cache-Control', 'no-store')
  if (rid) res.setHeader('X-Request-Id', rid)
  res.status(status).json(body)
}

export function errorBody(err, rid) {
  if (err instanceof HttpError) return { status: err.status, body: { error: { code: err.code, message: err.message, request_id: rid, ...(err.extra ?? {}) } } }
  return { status: 500, body: { error: { code: 'internal_error', message: 'Unexpected error', request_id: rid } } }
}

// Structured log line: ids, timings and counts only — never bodies or tokens.
export function log(level, event, fields = {}) {
  const line = { t: new Date().toISOString(), level, event, ...fields }
  const out = JSON.stringify(line, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))
  ;(level === 'error' ? console.error : console.log)(out)
}

// Strip anything token-shaped from text that may end up in DB/logs/UI.
export function sanitizeError(e, max = 300) {
  const s = String(e?.message ?? e ?? 'error')
  return s
    .replace(/(bearer\s+)[\w.\-~+/=]+/gi, '$1[redacted]')
    .replace(/(access_token|refresh_token|client_secret|api[_-]?key|authorization)["'=:\s]+[\w.\-~+/=]{6,}/gi, '$1=[redacted]')
    .replace(/\b(pat|sk|xox[a-z])-[\w-]{8,}/gi, '[redacted]')
    .slice(0, max)
}

export async function readJson(req, maxBytes = 200_000) {
  if (req.body && typeof req.body === 'object') return req.body
  if (typeof req.body === 'string' && req.body) {
    if (req.body.length > maxBytes) throw badRequest('Body too large')
    try { return JSON.parse(req.body) } catch { throw badRequest('Invalid JSON body') }
  }
  return {}
}
