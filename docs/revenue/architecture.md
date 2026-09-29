# Architecture

## Responsibilities (kept separate on purpose)

| Layer | Where | Rule |
|---|---|---|
| Normalized commercial data | `crm_*` tables (mirror of HubSpot) | HubSpot is the source of truth; Supabase is a mirror + product state |
| Deterministic rules | `api/_lib/rules/*` (pure functions) | No I/O, no clock (`as_of` explicit), no LLM. Same input+ruleset ⇒ same output |
| AI explanations | `api/_lib/ai/*`, `revenue/{brief,ask}.js` | Only narrates/answers; figures and citations are verified against authorized data |
| Authorized execution | `revenue/actions.js` + SQL RPCs | Propose → human approves exact `(version, hash)` → durable job → executor re-checks everything |

## Runtime

```
Browser (Supabase session, Bearer)
   │  /api/revenue/*  /api/integrations/hubspot/*        (vercel.json rewrites → one function)
   ▼
api/revenue.js ── _lib/router.js ── auth.js (verify session, resolve org+role from memberships)
   │                                   store.js (PostgREST, service role, ALWAYS with a verified org id)
   ├─ read models: revenue/queries.js       (overview / findings / deals / detail)
   ├─ connect.js / onboarding.js            (OAuth, stage mapping, rules versions)
   ├─ ask.js + tools.js / brief.js          (OpenAI Responses API, strict JSON schema)
   └─ actions.js                            (proposals, approvals, executor)
Worker: POST /api/revenue/worker/tick (scheduler secret) or /worker/kick (user, own org only)
   jobs.js → rv_claim_job (SKIP LOCKED + lease) → sync | evaluate | brief | execute_action | reconcile | rotate_credentials
Supabase Postgres: public.* (RLS, select-only for browsers) + private.* (credentials, OAuth attempts, job queue; not exposed by the Data API)
```

### Why one function
The deployment is already at Vercel Hobby's 12-function cap. The legacy HubSpot proxy (`api/integrations/hubspot.js`) was moved into
`api/_lib/legacyHubspotProxy.js` and is dispatched from `api/revenue.js`; net function count stays **12**. **Unverified until a preview
deploy**: that the `vercel.json` rewrites (incl. the regex param `:action(connect|callback|status|disconnect)`) behave as intended.
`req.query.__path` is set by the rewrite; the router falls back to parsing `req.url`.

## Auth & tenancy
* `verifySession` → Supabase `/auth/v1/user`. 401 = invalid/missing token; 503 = Supabase unreachable/erroring (the UI never logs out on 503).
* `resolveContext` reads `organization_members` (service role) for `user.id`; `x-organization-id` only **selects** among the caller's memberships (foreign id ⇒ 403). First contact of a user created after the migration calls `rv_ensure_user_org` (idempotent).
* Roles: `admin` (connection, rules, onboarding, members), `manager` (sync, approve/reject), `member` (propose, triage, generate brief), `viewer` (read, ask). Role is never taken from the client. Approvals re-check the role **again** at execution time.
* CSRF: authentication is a Bearer header (not ambient like a cookie), CORS is restricted to `APP_BASE_URL`. If cookie auth is ever introduced, add CSRF tokens.

## Data model
See `supabase/migrations/20260928100000_revenue_core_schema.sql` (every table, constraint and policy is there). Highlights:
* `organizations` + `organization_members` (new; backfilled one org per legacy user — never by e-mail/domain/org-name text).
* Composite FKs `(organization_id, id)` everywhere ⇒ a deal cannot point at another org's pipeline/stage/owner (tested).
* `revenue_evaluations` are immutable facts keyed `(org, deal, input_hash, rules_version)` where `input_hash` covers the inputs (no clock) **plus a day-granularity signature of the results**, so a threshold crossed later the same day can never reuse a stale row; `revenue_snapshot_items` link them to a snapshot (deviation from the proposal: evaluation rows are shared across snapshots when inputs are identical).
* Money = `numeric(20,4)`, summed as exact decimals (BigInt) per currency; timestamps `timestamptz`.
* Browser roles: `SELECT` only via RLS on active membership. Sensitive writes only through server-side `SECURITY DEFINER` RPCs (`EXECUTE` for `service_role` only, `search_path=''`).
* `private.crm_credentials`: AES-256-GCM (app-level key, key id in the ciphertext, rotation supported).

## Jobs
`private.revenue_jobs`: dedupe key (`(org, dedupe_key)` unique while live), lease, attempts, `run_after` (backoff / Retry-After), dead-letter (`status='dead'`, visible via job API).
Cooperative time budget: a job returns `continue` (re-queued **without** consuming an attempt) when its budget is used; sync state is checkpointed in `revenue_sync_runs.counters.state`.
Executions of approved actions are `max_attempts=1`; a crashed `running` execution becomes `needs_review`, never re-run.

## Deviations from the brief (deliberate)
* Legacy stale “provider” tables untouched; no dual-write.
* `propose_action` (AI tool) supports `create_task` and `email_draft` only. `update_deal_fields` exists in the API/executor (allow-list `hs_next_step`, `closedate`, before-image compare) but is not exposed in the UI or to the AI, because the mirror does not store `hs_next_step`.
* No webhooks (optional in MVP); reconciliation via re-reading associations and open tasks/meetings every run + periodic `full` runs.

## Routes (real, as implemented in `api/_lib/router.js`)

Rewrites (`vercel.json`): `/api/revenue/*`, `/api/integrations/hubspot/{connect,callback,status,disconnect}`, `/api/integrations/hubspot` (legacy relay) → `/api/revenue?__path=…`.
Every route is deny-by-default (401) unless marked. Errors: `{ error: { code, message, request_id } }`.

| Method & path | Auth / role | Notes |
|---|---|---|
| `POST /api/integrations/hubspot/connect` | admin | Creates OAuth attempt (state random, stored as SHA-256, TTL 10 min, single use, bound to user+org+target conn) → `authorize_url` |
| `GET /api/integrations/hubspot/callback` | none (state) | Consumes state atomically, exchanges code server-side, verifies portal via token introspection, activates connection, 302 back to the app with `?hubspot=…&reason=…` |
| `GET /api/integrations/hubspot/status` | any member | No secrets. Scopes, capabilities, coverage, last sync |
| `POST /api/integrations/hubspot/disconnect` | admin, `{confirm:true}` | Revokes refresh token at HubSpot (best effort), deletes credentials, stops jobs, cancels pending proposals; data retained |
| `POST /api/integrations/hubspot` | legacy | Unchanged private-token relay for un-migrated tenants |
| `GET /api/revenue/context` | member | org, role, flags, `ai_configured` |
| `GET/POST /api/revenue/onboarding` | view / admin | pipelines+stages (+suggestions), selection, stage categories, tz, currency, confirm |
| `GET /api/revenue/rules` | member | Active rule-set version + thresholds (the settings form is prefilled from it) |
| `POST /api/revenue/rules` | admin | New immutable rule-set version + re-evaluation |
| `POST /api/revenue/sync` | manager+ | 202 `{job_id, sync_run_id}`; dedupes an active run |
| `GET /api/revenue/jobs/:id[?run=]` | member | Tenant-scoped job + sync-run progress |
| `GET|POST /api/revenue/worker/tick` | scheduler secret | (GET for Vercel Cron) Processes jobs for all orgs (time-boxed) |
| `POST /api/revenue/worker/kick` | member | Time-boxed worker slice for the caller's org only (works without an external scheduler) |
| `GET /api/revenue/overview` | member | KPIs from the latest snapshot; filters recompute from snapshot items |
| `GET /api/revenue/findings` | member | Paginated, grouped (unique deals / unique amount per currency) |
| `POST /api/revenue/findings/:id/preference` | member | dismiss/snooze (reason required); never changes evidence or score |
| `GET /api/revenue/deals`, `GET /api/revenue/deals/:id` | member | List + detail (factors, unknowns, timeline, links) |
| `POST/GET /api/revenue/briefs`, `GET /api/revenue/briefs/:id` | member | POST enqueues (idempotent per snapshot/period/prompt/model) |
| `POST /api/revenue/ask`, `GET /api/revenue/chat/sessions[/:id]` | member | Sessions private to the creator |
| `GET/POST /api/revenue/actions`, `POST …/:id/{edit,approve,reject}` | member / propose / manager+ | Approve binds exact `(version, payload_hash)` |
