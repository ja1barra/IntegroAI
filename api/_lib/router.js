// Single-function router for all Revenue + HubSpot integration routes (Vercel
// Hobby caps a deployment at 12 functions; see docs/revenue/architecture.md).
// Centralizes request ids, auth/tenancy, error shape, validation and limits.

import { timingSafeEqual, randomUUID } from 'node:crypto'
import { cfg } from './env.js'
import { createPostgrestStore } from './store.js'
import { HttpError, sanitizeError, applyCors, badRequest, errorBody, forbidden, log as defaultLog, notFound, readJson, requestId, send, unauthorized } from './http.js'
import { resolveContext, requireCan, requireFlag, getFlags } from './auth.js'
import { createOpenAIProvider } from './ai/openai.js'
import { startConnect, handleCallback, connectionStatus, disconnect } from './revenue/connect.js'
import { getOnboarding, saveOnboarding, publishRuleset, getRules } from './revenue/onboarding.js'
import { overview, listFindings, listDeals, dealDetail, parseFilters, setFindingPreference } from './revenue/queries.js'
import { askIntegro } from './revenue/ask.js'
import { createProposal, editProposal, approveProposal, rejectProposal } from './revenue/actions.js'
import { enqueue, runWorkerTick } from './jobs.js'
import { requestSync } from './revenue/syncRequest.js'

const isUuid = v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v))
const needUuid = (v, name = 'id') => { if (!isUuid(v)) throw badRequest(`${name} must be a UUID`); return v }

function compilePattern(p) {
  const keys = []
  const re = new RegExp('^' + p.replace(/:(\w+)/g, (_m, k) => { keys.push(k); return '([^/]+)' }) + '$')
  return { re, keys }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b))
  return x.length === y.length && timingSafeEqual(x, y)
}

export function createHandler(overrides = {}) {
  const config = overrides.config ?? cfg()
  const store = overrides.store ?? createPostgrestStore(config, overrides.fetchImpl)
  const ai = overrides.ai ?? createOpenAIProvider(config)
  const fetchImpl = overrides.fetchImpl ?? fetch
  const log = overrides.log ?? defaultLog
  const now = overrides.now ?? (() => Date.now())

  const ROUTES = []
  const route = (method, pattern, opts, fn) => ROUTES.push({ method, ...compilePattern(pattern), pattern, opts: opts ?? {}, fn })

  // ── public / special auth ─────────────────────────────────────────────────
  route('GET', 'integrations/hubspot/callback', { auth: 'none' }, async ({ req, res, rid }) => {
    const r = await handleCallback({ store, config, query: req.query ?? {}, fetchImpl, log, requestId: rid })
    res.setHeader('Location', r.redirect); res.setHeader('Cache-Control', 'no-store')
    res.status(302).end()
    return null
  })
  route('POST', 'revenue/worker/tick', { auth: 'worker' }, async ({ rid }) => ({ status: 200, body: await runWorkerTick({ store, config, ai, fetchImpl, log: (l, e, f) => log(l, e, { ...f, request_id: rid }), now }) }))

  // ── context ───────────────────────────────────────────────────────────────
  route('GET', 'revenue/context', { auth: 'user' }, async ({ ctx }) => {
    const flags = await getFlags(store, ctx.orgId)
    const [org] = await store.select('organizations', { where: { id: ctx.orgId }, columns: 'id,name,timezone' })
    return { status: 200, body: { organization: org, role: ctx.role, flags, ai_configured: ai.available } }
  })

  // ── HubSpot connection ────────────────────────────────────────────────────
  route('POST', 'integrations/hubspot/connect', { auth: 'user', flag: 'revenue_mvp_enabled' }, async ({ ctx, body }) => {
    const flags = await getFlags(store, ctx.orgId)
    return { status: 200, body: await startConnect({ store, config, ctx, redirectTo: body.redirect_to, flags }) }
  })
  route('GET', 'integrations/hubspot/status', { auth: 'user' }, async ({ ctx }) => ({ status: 200, body: await connectionStatus({ store, config, ctx, flags: await getFlags(store, ctx.orgId) }) }))
  route('POST', 'integrations/hubspot/disconnect', { auth: 'user' }, async ({ ctx, body, rid }) => ({ status: 200, body: await disconnect({ store, config, ctx, body, requestId: rid, fetchImpl, log }) }))

  // ── onboarding / rules ────────────────────────────────────────────────────
  route('GET', 'revenue/onboarding', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'view' }, async ({ ctx }) => ({ status: 200, body: await getOnboarding({ store, orgId: ctx.orgId }) }))
  route('POST', 'revenue/onboarding', { auth: 'user', flag: 'revenue_mvp_enabled' }, async ({ ctx, body, rid }) => ({ status: 200, body: await saveOnboarding({ store, ctx, body, requestId: rid }) }))
  route('GET', 'revenue/rules', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'view' }, async ({ ctx }) => ({ status: 200, body: await getRules({ store, orgId: ctx.orgId }) }))
  route('POST', 'revenue/rules', { auth: 'user', flag: 'revenue_mvp_enabled' }, async ({ ctx, body, rid }) => ({ status: 201, body: await publishRuleset({ store, ctx, body, requestId: rid }) }))

  // ── sync & jobs ───────────────────────────────────────────────────────────
  route('POST', 'revenue/sync', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'sync' }, async ({ ctx, body }) => ({ status: 202, body: await requestSync({ store, enqueue, orgId: ctx.orgId, userId: ctx.userId, full: body.full === true }) }))
  route('GET', 'revenue/jobs/:id', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'view' }, async ({ ctx, params, query }) => {
    needUuid(params.id)
    const rows = await store.rpc('rv_get_job', { _org: ctx.orgId, _id: params.id })
    const job = Array.isArray(rows) ? rows[0] : rows
    if (!job) throw notFound('Job not found')
    let sync_run = null
    if (query.run) { needUuid(query.run, 'run'); const [r] = await store.select('revenue_sync_runs', { where: { id: query.run, organization_id: ctx.orgId }, columns: 'id,status,kind,warnings,error,started_at,finished_at,counters' }); if (r) sync_run = { id: r.id, status: r.status, kind: r.kind, step: r.counters?.state?.step ?? null, warnings: r.warnings, error: r.error, started_at: r.started_at, finished_at: r.finished_at, counters: Object.fromEntries(Object.entries(r.counters ?? {}).filter(([k]) => k !== 'state')) } }
    return { status: 200, body: { job, sync_run } }
  })
  // Runs a bounded worker slice for the caller's org (works without an external scheduler).
  route('POST', 'revenue/worker/kick', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'view' }, async ({ ctx, rid }) => ({ status: 200, body: await runWorkerTick({ store, config, ai, orgId: ctx.orgId, budgetMs: Math.min(config.workerBudgetMs, 25000), fetchImpl, log: (l, e, f) => log(l, e, { ...f, request_id: rid }), now }) }))

  // ── read models ───────────────────────────────────────────────────────────
  const R = { auth: 'user', flag: 'revenue_mvp_enabled', role: 'view' }
  route('GET', 'revenue/overview', R, async ({ ctx, query }) => ({ status: 200, body: await overview({ store, orgId: ctx.orgId, filters: parseFilters(query), now: new Date(now()).toISOString() }) }))
  route('GET', 'revenue/findings', R, async ({ ctx, query }) => ({ status: 200, body: await listFindings({ store, orgId: ctx.orgId, filters: parseFilters(query), limit: query.limit, offset: query.offset, now: new Date(now()).toISOString() }) }))
  route('POST', 'revenue/findings/:id/preference', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'triage' }, async ({ ctx, params, body, rid }) => ({ status: 200, body: await setFindingPreference({ store, ctx, findingId: needUuid(params.id), state: body.state, reason: body.reason, until: body.until, requestId: rid }) }))
  route('GET', 'revenue/deals', R, async ({ ctx, query }) => ({ status: 200, body: await listDeals({ store, orgId: ctx.orgId, filters: parseFilters(query), limit: query.limit, offset: query.offset, sort: query.sort, q: query.q }) }))
  route('GET', 'revenue/deals/:id', R, async ({ ctx, params }) => ({ status: 200, body: await dealDetail({ store, orgId: ctx.orgId, dealId: needUuid(params.id), now: new Date(now()).toISOString() }) }))

  // ── briefs ────────────────────────────────────────────────────────────────
  route('POST', 'revenue/briefs', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'generate_brief' }, async ({ ctx, body, rid }) => {
    const period = body.period ?? (await store.select('revenue_settings', { where: { organization_id: ctx.orgId } }))[0]?.brief_cadence ?? 'weekly'
    if (!['daily', 'weekly'].includes(period)) throw badRequest('period must be daily or weekly')
    const [snap] = await store.select('revenue_score_snapshots', { where: { organization_id: ctx.orgId }, order: 'created_at.desc', limit: 1, columns: 'id' })
    if (!snap) throw new HttpError(409, 'no_data', 'Run a sync first: there is no analyzed snapshot yet')
    const jobId = await enqueue(store, { orgId: ctx.orgId, kind: 'brief', payload: { period, request_id: rid }, dedupe: `brief:${ctx.orgId}:${period}:${snap.id}`, maxAttempts: 3, userId: ctx.userId })
    return { status: 202, body: { job_id: jobId, period, snapshot_id: snap.id } }
  })
  route('GET', 'revenue/briefs', R, async ({ ctx, query }) => ({ status: 200, body: { items: await store.select('revenue_briefs', { where: { organization_id: ctx.orgId }, order: 'created_at.desc', limit: Math.min(Number(query.limit) || 20, 50), columns: 'id,period,period_start,period_end,is_baseline,status,model,prompt_version,rules_version,created_at' }) } }))
  route('GET', 'revenue/briefs/:id', R, async ({ ctx, params }) => {
    const [b] = await store.select('revenue_briefs', { where: { id: needUuid(params.id), organization_id: ctx.orgId } })
    if (!b) throw notFound('Brief not found')
    return { status: 200, body: b }
  })

  // ── ask ───────────────────────────────────────────────────────────────────
  route('POST', 'revenue/ask', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'ask' }, async ({ ctx, body, rid }) => ({ status: 200, body: await askIntegro({ store, ai, ctx, question: body.question, sessionId: body.session_id ? needUuid(body.session_id, 'session_id') : null, requestId: rid, log }) }))
  route('GET', 'revenue/chat/sessions', R, async ({ ctx }) => ({ status: 200, body: { items: await store.select('revenue_chat_sessions', { where: { organization_id: ctx.orgId, created_by: ctx.userId }, order: 'created_at.desc', limit: 30 }) } }))
  route('GET', 'revenue/chat/sessions/:id', R, async ({ ctx, params }) => {
    const [s] = await store.select('revenue_chat_sessions', { where: { id: needUuid(params.id), organization_id: ctx.orgId, created_by: ctx.userId } })
    if (!s) throw notFound('Session not found')
    return { status: 200, body: { session: s, messages: await store.select('revenue_chat_messages', { where: { organization_id: ctx.orgId, session_id: s.id }, order: 'created_at.asc', limit: 100 }) } }
  })

  // ── actions ───────────────────────────────────────────────────────────────
  route('GET', 'revenue/actions', R, async ({ ctx, query }) => ({ status: 200, body: { items: await store.select('revenue_action_proposals', { where: { organization_id: ctx.orgId, ...(query.status ? { status: String(query.status) } : {}) }, order: 'created_at.desc', limit: Math.min(Number(query.limit) || 50, 100) }) } }))
  route('POST', 'revenue/actions', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'propose' }, async ({ ctx, body, rid }) => ({ status: 201, body: await createProposal({ store, ctx, dealId: needUuid(body.deal_id, 'deal_id'), kind: body.kind, payload: body.payload, rationale: body.rationale, source: 'user', requestId: rid }) }))
  route('POST', 'revenue/actions/:id/edit', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'propose' }, async ({ ctx, params, body, rid }) => ({ status: 200, body: await editProposal({ store, ctx, proposalId: needUuid(params.id), baseVersion: Number(body.version), payload: body.payload, requestId: rid }) }))
  route('POST', 'revenue/actions/:id/approve', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'approve' }, async ({ ctx, params, body, rid }) => ({ status: 202, body: await approveProposal({ store, ctx, proposalId: needUuid(params.id), version: Number(body.version), hash: String(body.payload_hash ?? ''), requestId: rid }) }))
  route('POST', 'revenue/actions/:id/reject', { auth: 'user', flag: 'revenue_mvp_enabled', role: 'reject' }, async ({ ctx, params, body, rid }) => ({ status: 200, body: await rejectProposal({ store, ctx, proposalId: needUuid(params.id), reason: body.reason, requestId: rid }) }))

  return async function handler(req, res) {
    const rid = requestId(req)
    const started = now()
    applyCors(req, res, config.appBaseUrl)
    let matched
    try {
      if (req.method === 'OPTIONS') { res.status(204).end(); return }
      const url = new URL(req.url ?? '/', 'http://localhost')
      const raw = (req.query?.__path ?? url.pathname.replace(/^\/api\//, '')).toString().replace(/^\/+|\/+$/g, '')
      const query = Object.fromEntries(Object.entries(req.query ?? {}).filter(([k]) => k !== '__path'))
      let params = {}
      for (const r of ROUTES) {
        const m = r.re.exec(raw)
        if (m && r.method === req.method) { matched = r; params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])); break }
      }
      if (!matched) {
        if (ROUTES.some(r => r.re.test(raw))) throw new HttpError(405, 'method_not_allowed', 'Method not allowed')
        throw notFound('Unknown route')
      }
      const o = matched.opts
      let ctx = null
      if (o.auth === 'worker') {
        const secret = config.workerSecret
        const got = (req.headers?.authorization ?? '').replace(/^Bearer\s+/i, '')
        if (!secret || !got || !safeEqual(got, secret)) throw unauthorized('Invalid worker credential')
      } else if (o.auth === 'user') {
        const headerOrg = req.headers?.['x-organization-id']
        ctx = await resolveContext(req, { config, store, requestedOrgId: headerOrg && isUuid(headerOrg) ? headerOrg : undefined, fetchImpl })
        if (o.flag) await requireFlag(store, ctx.orgId, o.flag)
        if (o.role) requireCan(ctx, o.role)
      }
      const body = req.method === 'POST' ? await readJson(req) : {}
      const out = await matched.fn({ req, res, rid, ctx, params, query, body })
      if (out) send(res, out.status, out.body, rid)
      log('info', 'http.request', { request_id: rid, route: matched.pattern, method: req.method, status: out?.status ?? 302, org_id: ctx?.orgId, duration_ms: now() - started })
    } catch (e) {
      const { status, body } = errorBody(e, rid)
      if (status >= 500) log('error', 'http.error', { request_id: rid, route: matched?.pattern, status, code: body.error.code, name: e?.name, error: sanitizeError(e, 200) })
      else log('info', 'http.request', { request_id: rid, route: matched?.pattern, status, code: body.error.code })
      send(res, status, body, rid)
    }
  }
}
