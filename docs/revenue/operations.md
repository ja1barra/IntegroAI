# Operations

## Configure (in this order)
1. **Supabase**: apply migrations (migration-runbook.md). Set `SUPABASE_SERVICE_ROLE_KEY` (server env only), reuse the URL/anon key.
2. **Encryption key**: `openssl rand -base64 32` → `CREDENTIALS_ENCRYPTION_KEY` (+ `CREDENTIALS_ENCRYPTION_KEY_ID=1`). Losing it makes stored HubSpot tokens unreadable (customers must reconnect).
3. **HubSpot app** (developer account → public app): redirect URL = `HUBSPOT_REDIRECT_URI` (`https://<domain>/api/integrations/hubspot/callback`); enable exactly the scopes in `hubspot-capabilities.md`; set `HUBSPOT_CLIENT_ID/SECRET`. Do **not** reuse a developer's personal HubSpot connector/token.
4. **OpenAI**: `OPENAI_API_KEY` (one Integro project key; per-tenant attribution is in `revenue_ai_usage`) and `OPENAI_MODEL` — see below. Load `revenue_pricing_rates` (model, version, $/Mtok) from OpenAI's current price list; until then estimated cost stays `NULL` (never invented).
5. **Worker**: choose one:
   * **Vercel Cron (Pro):** add to `vercel.json` `"crons":[{"path":"/api/revenue/worker/tick","schedule":"*/5 * * * *"}]` and set `CRON_SECRET`=`REVENUE_WORKER_SECRET`. *Not committed:* on Hobby a sub-daily cron makes the deployment fail.
   * **External scheduler:** `curl -X POST -H "Authorization: Bearer $REVENUE_WORKER_SECRET" https://<domain>/api/revenue/worker/tick` every 1–5 min.
   * Without a scheduler, the UI still works: syncs/briefs/approvals call `POST /api/revenue/worker/kick` (own org, ≤25 s), but nothing runs while nobody has the app open.
   The tick also enqueues an incremental sync for every enabled organization whose setup an admin confirmed and whose last successful sync is older than `REVENUE_AUTO_SYNC_HOURS` (default 6; `0` disables), because rules depend on "today". Briefs are generated on demand only (no automatic daily/weekly generation yet).
   Keep `REVENUE_WORKER_BUDGET_MS` < `functions."api/revenue.js".maxDuration` (60 s in `vercel.json`; Hobby's maximum may be lower on your plan — check).
6. **Legacy kill switch needs the service key**: `legacy_outreach_enabled=false` is enforced by the legacy `/api/agent/*` endpoints through `SUPABASE_SERVICE_ROLE_KEY`. Without that key the gate cannot be evaluated and the endpoints keep working for everyone (fail-open, only so pre-migration installs do not break) — set it before migrating any tenant.
7. **Flags per tenant** (`revenue_org_flags`), defaults: everything off except `legacy_outreach_enabled=true`. Limits per tenant in `revenue_settings` (`ai_monthly_token_budget`, `ai_requests_per_hour`, `retention_days_after_disconnect`).

## Model selection
No model name is assumed. Pick `OPENAI_MODEL` by running the Ask/Brief scenarios on your candidates: (a) strict-schema compliance (no parse failures), (b) tool selection (metrics vs findings vs deal), (c) refusal to forecast / to invent numbers (the server verifier must almost never have to reject), (d) prompt-injection cases in `test/sql/ai.test.js`, (e) latency and cost/answer. Verify the model supports Responses API + strict JSON schema + function calling. Stateless mode (`store:false`) is used: reasoning items are not replayed between tool turns; if your chosen reasoning model requires them, adapt `ask.js` (⚠ unverified live). `store:false` is a request setting, **not** a zero-data-retention guarantee.

## Monitoring
Structured JSON logs (`http.request`, `http.error`, `job.finished`, `revenue.evaluated`, `action.*`, `ask.ai_unavailable`) carry `request_id`, `org_id`, `job_id`, duration, attempt. No bodies or tokens (`sanitizeError` redacts bearer/token-shaped strings). Users see the `request_id` on errors.
```sql
select id, kind, status, attempts, last_error from private.revenue_jobs where status in ('dead','failed') order by updated_at desc limit 50;   -- dead letters
select status, count(*) from public.revenue_action_executions group by 1;                                                                    -- needs_review = human follow-up
select organization_id, sum(coalesce(input_tokens,0)+coalesce(output_tokens,0)) tokens, sum(estimated_cost_usd) usd
  from public.revenue_ai_usage where period_month = date_trunc('month', now())::date group by 1 order by 2 desc;
```

## Runbooks
* **Reconnect required** (`crm_connections.status='reconnect_required'`): refresh token rejected → an admin clicks *Reconnect*. The last valid diagnosis stays visible; a failed sync never resolves findings.
* **Key rotation**: set new `CREDENTIALS_ENCRYPTION_KEY` + new `_KEY_ID`, move the old one to `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS="<oldId>:<oldBase64>"`, deploy, enqueue one `rotate_credentials` job (`select public.rv_enqueue_job(<org>,'rotate_credentials','{}',null,null,3,null)`), confirm `select key_version, count(*) from private.crm_credentials group by 1`, then remove `_PREVIOUS`.
* **needs_review action**: check the deal/task in HubSpot; a `reconcile` job also searches for the embedded marker `[integro:<id>]`. Absence in search is not proof of failure (index lag).
* **Disconnect**: revokes at HubSpot (best effort), deletes credentials, stops jobs, cancels pending proposals. **Data is retained**; the purge job implied by `retention_days_after_disconnect` is **not implemented** (limitation).

## Known limitations
No webhooks; no automatic retention purge; evaluation joins are in-memory (sized for portals up to roughly 10⁴ open deals / 10⁵ activities — beyond that, move the joins into SQL); per-org API rate limiting exists only for AI; email drafts are copy-only; Revenue nav is hidden for un-migrated tenants (by design); mobile uses a bottom nav for Revenue only (the pre-existing shell hides its sidebar below 900 px); locale: English is complete, Spanish is partial with English fallback; `lint` has no ESLint config in the repo; HubSpot endpoints unverified against live docs (see hubspot-capabilities.md).

## Commands
```bash
npm install && npm test                         # 97 tests: rules, SQL/RLS/migrations (PGlite), sync, actions, AI, API e2e, legacy gate
cd integro-ai && npm install && npm run build   # tsc + vite build
```
