// Shared authentication / tenancy context.
//   1. verify the Bearer session against Supabase Auth  (401 vs 503 are distinct)
//   2. resolve organization + role from memberships read server-side
// A client-supplied organization id only *selects* among the caller's own
// memberships; it never grants access.

import { HttpError, unauthorized, forbidden, unavailable } from './http.js'

// Permission matrix. Roles never come from the client.
const ACTIONS = {
  view:            ['admin', 'manager', 'member', 'viewer'],
  propose:         ['admin', 'manager', 'member'],
  triage:          ['admin', 'manager', 'member'], // dismiss / snooze findings
  ask:             ['admin', 'manager', 'member', 'viewer'],
  sync:            ['admin', 'manager'],
  generate_brief:  ['admin', 'manager', 'member'],
  approve:         ['admin', 'manager'],
  reject:          ['admin', 'manager'],
  manage_connection: ['admin'],
  manage_rules:    ['admin'],
}
export const can = (role, action) => (ACTIONS[action] ?? []).includes(role)

export function extractBearer(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() || null : null
}

/**
 * Verifies the session with Supabase Auth's official /auth/v1/user endpoint.
 * -> { userId, email, token, supabaseUrl, anonKey }
 * Throws 401 for a missing/invalid token and 503 when Supabase itself is down.
 */
export async function verifySession(req, config, fetchImpl = fetch) {
  const token = extractBearer(req)
  if (!token) throw unauthorized()
  if (!config.supabaseUrl || !config.anonKey) throw unavailable('Authentication service is not configured')
  let r
  try {
    r = await fetchImpl(`${config.supabaseUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: config.anonKey }, signal: AbortSignal.timeout(8000) })
  } catch { throw unavailable('Authentication service unreachable') }
  if (r.status === 401 || r.status === 403) throw unauthorized()
  if (!r.ok) throw unavailable('Authentication service error')
  const u = await r.json().catch(() => null)
  if (!u?.id) throw unauthorized()
  return { userId: u.id, email: u.email ?? null, token, supabaseUrl: config.supabaseUrl, anonKey: config.anonKey, meta: u.user_metadata ?? {} }
}

/**
 * -> { userId, orgId, role, session }
 * `requestedOrgId` (header/body/query) is only honoured if the caller is an
 * active member of it.
 */
export async function resolveContext(req, { config, store, requestedOrgId, fetchImpl }) {
  const session = await verifySession(req, config, fetchImpl)
  let memberships = await store.select('organization_members', { where: { user_id: session.userId, status: 'active' }, columns: 'organization_id,role', order: 'created_at.asc' })
  if (!memberships.length) {
    // First contact for a user created after the migration: give them their own org (idempotent).
    const name = session.meta?.org
    const orgId = await store.rpc('rv_ensure_user_org', { _user: session.userId, _name: typeof name === 'string' ? name : null })
    memberships = await store.select('organization_members', { where: { user_id: session.userId, status: 'active' }, columns: 'organization_id,role', order: 'created_at.asc' })
    if (!memberships.some(m => m.organization_id === orgId)) throw forbidden('No organization membership')
  }
  let m = memberships[0]
  if (requestedOrgId) {
    m = memberships.find(x => x.organization_id === requestedOrgId)
    if (!m) throw forbidden('You are not a member of that organization')
  }
  return { userId: session.userId, orgId: m.organization_id, role: m.role, session }
}

export function requireCan(ctx, action) {
  if (!can(ctx.role, action)) throw forbidden(`Role "${ctx.role}" cannot ${action.replace('_', ' ')}`)
}

export async function getFlags(store, orgId) {
  const rows = await store.select('revenue_org_flags', { where: { organization_id: orgId } })
  const f = rows[0] ?? {}
  return {
    revenue_mvp_enabled: f.revenue_mvp_enabled === true,
    managed_ai_enabled: f.managed_ai_enabled === true,
    hubspot_write_actions_enabled: f.hubspot_write_actions_enabled === true,
    legacy_outreach_enabled: f.legacy_outreach_enabled !== false,
  }
}

export async function requireFlag(store, orgId, flag) {
  const flags = await getFlags(store, orgId)
  if (!flags[flag]) throw new HttpError(403, 'feature_disabled', `Feature "${flag}" is not enabled for this organization`)
  return flags
}

// ── legacy compatibility ────────────────────────────────────────────────────
// Historic contract of _provider.js: returns { token, supabaseUrl, anonKey } or null.
export async function getAuthedUser(req, config, fetchImpl) {
  try {
    const s = await verifySession(req, config, fetchImpl)
    return { token: s.token, supabaseUrl: s.supabaseUrl, anonKey: s.anonKey, userId: s.userId }
  } catch { return null }
}

// Server-side kill switch for the legacy SDR/outreach endpoints, per tenant.
// Fails CLOSED for migrated tenants; fails OPEN only when the gate itself
// cannot be evaluated *and* the deployment has no service key (pre-migration installs).
export async function legacyOutreachAllowed(userId, store) {
  if (!store?.configured) return true
  try {
    const v = await store.rpc('rv_legacy_outreach_allowed', { _user: userId })
    return v !== false
  } catch (e) {
    if (e instanceof HttpError && e.status === 400 && /does not exist|Could not find the function/i.test(e.message)) return true // migration not applied yet
    throw e
  }
}
