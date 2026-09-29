# Repo audit (verified against the checked-out repository)

Method: read the files below in the working tree at the start of this work (`git` HEAD `e10a7dd`). Line numbers are from the
**pre-change** files unless marked *(now)*. No secret values are reproduced; env var **names** only.
`AGENTS.md` does **not** exist in the repo (checked at the root). There is no `.github/` (no CI), no `supabase/migrations/`, and
`integro-ai/package.json` has no `test` script — before this work the repo had **no automated tests**.

## 1. Stack, scripts, hosting

| Fact | Evidence |
|---|---|
| Web app: Vite 5 + React 18 + TypeScript (strict), no router (view state in `AppShell`) | `integro-ai/package.json:7-19`, `integro-ai/tsconfig.json`, `integro-ai/src/AppShell.tsx:120` *(now)* |
| Scripts: `dev`, `build` (`tsc && vite build`), `preview`, `lint` (no ESLint config is committed, so `lint` cannot run) | `integro-ai/package.json:8-11` |
| Hosting: Vercel static build of `integro-ai/` + serverless functions from `/api` (plain ESM JS, not TS) | `vercel.json`, `api/**` |
| **Vercel Hobby 12-function cap** already reached: `api/agent/{generate,generate-sequence,send}` + 9 in `api/integrations` = 12 | `api/agent/generate-sequence.js:4` |
| Supabase project ref is checked in (public identifier, not a secret) | `.mcp.json`, `run-schema.mjs:4`, `setup.mjs:8` |
| Second, unrelated app: `apps/agent-console` (Next.js, Supabase **service role**, n8n webhook, Anthropic). Not deployed by `vercel.json`; uses table `outbound_emails` that is defined nowhere in `supabase/`. **Not touched** — see "Open items". | `apps/agent-console/**` |

## 2. Auth / session

* Browser: `supabase-js` session; `App.tsx:26` `getSession()`, `App.tsx:28` `onAuthStateChange`. Client is created from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`integro-ai/src/lib/supabase.ts:3-4`).
* Server: `api/agent/_provider.js` `getAuthedUser` verified the Bearer token against `/auth/v1/user` and returned `{token,supabaseUrl,anonKey}` only (no `user.id`, no org, no role). Used by `generate.js`, `generate-sequence.js`.
* **`api/agent/send.js` performed no authentication at all** (took a client-supplied Gmail token and sent mail for any caller). Fixed, see §9.
* Users are created by the `on_auth_user_created` trigger → `handle_new_user()` (`supabase/schema.sql:29-47`). **Left untouched.**
* Tenancy was **per-user** (`user_id = auth.uid()` on every table). There was **no organization/membership table**; `user_profiles.org` is free text (`schema.sql:9-16`) and `white-label-schema.sql` says "per-user for now".

## 3. Router / components

* No URL router: `AppShell.tsx` holds `view` state and mounts every view (`.view`/`.active` CSS pattern). Sidebar nav = `NAV_GROUPS` (`components/layout/Sidebar.tsx:26`).
* Design system: CSS custom properties in `integro-ai/src/index.css` (`--orange`, `--ink`, `--glass*`), flat theme; reusable `StatCard`, `EmptyState`, `data-table`, `.modal*`, `btn-sm*`.
* Legacy views: Dashboard, Tasks, Outbound, Demand, Success, PlaybookAgent, Playbooks, Reports, Integrations (+`AIProviderPanel`), Team, Settings, Academy.

## 4. Database (before)

`supabase/*.sql` are hand-run scripts (`run-schema.mjs`, `setup.mjs`), not migrations.

| File | Tables | RLS |
|---|---|---|
| `schema.sql` | `user_profiles`, `user_settings`, `integrations` (has `key_encrypted` — **plaintext token column**, comment says "raw here for dev"), `sync_events`, `integrations_data` | enabled, `auth.uid()` per user (`:18,:59,:94,:112,:140`) |
| `outbound-schema.sql` | `prospects`, `sequences`, `sequence_steps`, `enrollments`, `messages`, `agent_runs` (`:19,51,74,96,124,165`) | enabled, per user |
| `playbooks-schema.sql` | `playbooks` (`:23`) | per user |
| `ai-provider-schema.sql` | `ai_provider_settings` (BYOM: **customer API key stored in plaintext** `api_key text`) | per user |
| `white-label-schema.sql`, `avatars-storage.sql` | `white_label_settings` + storage buckets/policies | per user |

## 5. APIs, OAuth, credentials

* 12 functions listed in §1; every `api/integrations/*` proxy and `api/agent/*` sets `Access-Control-Allow-Origin: *`.
* `api/integrations/hubspot.js` (legacy): **generic relay** — caller supplies `endpoint` + `apiKey` (private-app token), relayed to `api.hubapi.com`. No auth. Behaviour is preserved (legacy Demand/Success views use it) and it now lives in `api/_lib/legacyHubspotProxy.js`, routed by `vercel.json` (see architecture.md).
* `api/integrations/oauth-callback.js` (generic for Salesforce/Outreach/LinkedIn/Intercom/GA4/Gmail/Slack): exchanges the code **and posts the raw tokens back to the browser** via `postMessage` (`:62-90`); OAuth `state` is only `provider:uuid`, kept in `sessionStorage` on the client (`lib/integrations/oauth.ts:64`) and never validated server-side. Tokens are then written to `integrations.key_encrypted` by the browser (`lib/integrations/credentialStore.ts:15`). HubSpot is **not** in this flow (private-app token pasted by the user).
* AI: `_provider.js` `resolveAIProvider` = user's BYOM row (Anthropic/OpenAI/Google/custom URL) else shared `ANTHROPIC_API_KEY`.
* Jobs/campaigns: no scheduler, no cron, no queue. "Agents" are client-side flows (`lib/outbound/*`) writing `prospects/sequences/messages/agent_runs`; sending = `api/agent/send.js` (Gmail API).
* Tests: none.

## 6. Reuse / refactor / disable

| Item | Decision |
|---|---|
| Supabase Auth, `handle_new_user`, `user_profiles`, user IDs | **Reuse unchanged** |
| Vite/React app shell, CSS tokens, `EmptyState`, `.data-table`, `.modal*`, white-label theming | **Reuse** |
| `_provider.js` `getAuthedUser` | **Refactor** → `api/_lib/auth.js` (wrapper kept, contract unchanged) |
| Legacy views/APIs (SDR, sequences, BYOM, playbooks, Gmail send) | **Kept for un-migrated tenants; disabled server-side per tenant** (`legacy_outreach_enabled=false`) and hidden from the new nav |
| `integrations.key_encrypted`, `ai_provider_settings.api_key` (plaintext) | **Not migrated, not read by Revenue.** Retention/removal plan in migration-runbook.md |
| `api/agent/send.js` | **Fix**: now authenticated + tenant-gated |
| `apps/agent-console` | **Out of scope, flagged** |
| Everything under `supabase/migrations/`, `api/_lib/**`, `api/revenue.js`, `integro-ai/src/{lib,components,views}/revenue` | **New** |

## 7. Files changed (real paths)

New: `supabase/migrations/2026092810000{0,1,2}_*.sql`, `supabase/verify/revenue_verify.sql`, `supabase/rollback/revenue_rollback_flags.sql`,
`api/revenue.js`, `api/_lib/**`, `test/**`, `package.json`, `docs/revenue/*`, `integro-ai/src/lib/revenue/*`, `integro-ai/src/components/revenue/common.tsx`, `integro-ai/src/views/revenue/*`.
Modified: `api/agent/{_provider,generate,generate-sequence,send}.js`, `api/integrations/hubspot.js` → `api/_lib/legacyHubspotProxy.js` (moved), `vercel.json`, `.env.example`, `.gitignore`, `integro-ai/src/{AppShell.tsx,components/layout/Sidebar.tsx,index.css,lib/outbound/send.ts}`.

## 8. Routes (logical → real)

All served by the single function `api/revenue.js` through `vercel.json` rewrites; see architecture.md for the table.

## 9. Security findings fixed along the way

1. `send.js` unauthenticated → now 401 without a valid session; a per-tenant kill switch (`rv_my_legacy_outreach_allowed()`, evaluated with the caller's own JWT, fail-closed) now protects `generate`, `generate-sequence` and `send` (test: `test/legacy.test.js`).
2. Session verification duplicated/limited → one shared implementation that separates 401 from 503.

## 10. Open items (not done here)

* Legacy plaintext secrets (`integrations.key_encrypted`, `ai_provider_settings.api_key`) still exist for legacy features.
* `apps/agent-console` and its `outbound_emails` table: decide whether it is deployed; if so it needs the same per-tenant kill switch.
* Other `api/integrations/*` proxies keep `Access-Control-Allow-Origin: *` and no auth (unchanged).
* No CI exists; `npm test` was added but nothing runs it automatically.
