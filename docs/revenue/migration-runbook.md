# Migration runbook (AI SDR / BYOM → Revenue Manager)

Principles: additive only; no `DROP`, `TRUNCATE`, `reset`; Supabase project, URLs, keys and `auth.users` IDs never change; legacy columns and
tables are kept; one tenant at a time; **nothing in this document has been run against production.**

## What was actually tested (and what was not)
* Tested (PGlite = real PostgreSQL 17 in-process): baseline `supabase/{schema,outbound-schema,playbooks-schema,ai-provider-schema}.sql` **with seeded legacy data (users, profiles, integrations, BYOM row)** → the 3 migrations → counts/IDs unchanged, one org per user, backfill re-runnable, RLS/grants/RPC lock-down, constraints. `npm run test:sql`.
* **Not tested:** a copy of the real production database (schema drift, real row counts, `storage.*` policies from `white-label-schema.sql` / `avatars-storage.sql`, Supabase-managed roles/extensions), Supabase Auth flows (login/refresh/reset/invite were **not modified**; they must be re-verified in staging), a real HubSpot sandbox, real OpenAI. Do not read "tested" as "compatible with production" until step 3 below is done.

## 0. Prerequisites
`psql` or Supabase CLI, a **staging** Supabase project (branch or restored backup), the service-role key (never committed).

## 1. Baseline (production, read-only)
```sql
select 'auth.users' t, count(*) from auth.users
union all select 'user_profiles', count(*) from public.user_profiles
union all select 'integrations', count(*) from public.integrations
union all select 'ai_provider_settings', count(*) from public.ai_provider_settings
union all select 'prospects', count(*) from public.prospects;
select schemaname, tablename, policyname from pg_policies where schemaname = 'public' order by 1,2,3;
select tgname, tgrelid::regclass from pg_trigger where not tgisinternal and tgrelid::regclass::text in ('auth.users','public.user_profiles');
```
Save the output. Inventory consumers: `grep -rn "getAuthedUser\|ai_provider_settings" api integro-ai/src` (done in `repo-audit.md`). Confirm whether `apps/agent-console` is deployed.

## 2. Backup / restore rehearsal
Use the project's own capability (Dashboard → Database → Backups, PITR if enabled). Restore into a **new** staging project and run steps 3–5 there. Do not copy production secrets (tokens in `integrations.key_encrypted`, `ai_provider_settings.api_key`) into fixtures.

## 3. Apply the schema to staging
```bash
supabase link --project-ref <STAGING_REF>
supabase db push            # applies supabase/migrations/2026092810000{0,1,2}_*.sql in order
psql "$STAGING_DB_URL" -f supabase/verify/revenue_verify.sql   # every "expect 0 rows" section must be empty
```
Order is deliberate: (1) structures + RLS + grants in one migration, (2) tenancy backfill in batches of 500 (idempotent, restartable; it `RAISE NOTICE`s the count), (3) indexes + a validation block that **raises** if any auth user has no organization.
Verify in staging: login, token refresh, logout, password reset, invitation e-mails (existing mechanisms; not touched).

## 4. Tenancy resolution
Each existing user gets **their own organization** (name from `user_profiles.org`, admin membership, row in `revenue_legacy_user_org_map`). Users are **never merged by e-mail, domain or org-name text**. To place several users in one organization after review, insert `organization_members` rows by hand (an admin decision), then move data ownership deliberately. Ambiguous ownership: leave isolated; nothing is deleted.

## 5. Shadow run on staging
Deploy the branch to a Vercel preview with staging env vars (see `.env.example`), keep all flags default (all off). Connect a **HubSpot developer test portal**, run the flow: connect → sync → onboarding → diagnosis → brief → ask → propose → approve → one real task. Confirm the ⚠ items in `hubspot-capabilities.md`. Load real `revenue_pricing_rates` rows if you want cost estimates.

## 6. Pilot tenant (production) — last step, needs explicit approval
Present for approval: the diff, test output, and these exact commands:
```bash
supabase link --project-ref pjptveelaqivsmarzbii
supabase db push
psql "$PROD_DB_URL" -f supabase/verify/revenue_verify.sql
```
Then, for **one** organization `:org`:
```sql
-- 1) freeze legacy for this tenant (server-side kill switch, irreversible by rollback unless someone chooses it)
update public.revenue_org_flags set legacy_outreach_enabled = false where organization_id = :'org';
-- 2) review in-flight legacy work: nothing in the repo schedules legacy jobs, but check messages queued for sending
select status, count(*) from public.messages where user_id in
  (select user_id from public.organization_members where organization_id = :'org') group by 1;
-- 3) enable read-only Revenue first
update public.revenue_org_flags set revenue_mvp_enabled = true where organization_id = :'org';
-- 4) later, in this order, after each stage is validated:
update public.revenue_org_flags set managed_ai_enabled = true where organization_id = :'org';
update public.revenue_org_flags set hubspot_write_actions_enabled = true where organization_id = :'org';
```
Schedule the worker (operations.md). Do not deploy to all tenants until the pilot is stable.

## 7. Legacy data
Legacy tables and columns stay. `ai_provider_settings` and `integrations.key_encrypted` hold plaintext third-party secrets: after the pilot proves stable, propose (separately, with a retention decision) revoking/deleting them. **No destructive change is part of this MVP.**

## 8. Rollback
See `rollback.md`.
