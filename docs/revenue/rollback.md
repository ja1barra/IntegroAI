# Rollback (non-destructive)

## Application rollback
1. Turn the flags off for the affected organization(s) — this is enough to stop all new Revenue behaviour:
   `psql -v org=<ORG_UUID> -f supabase/rollback/revenue_rollback_flags.sql` (sets `revenue_mvp_enabled`, `managed_ai_enabled`, `hubspot_write_actions_enabled` = false; marks queued jobs dead; cancels `proposed`/`approved` proposals).
2. Redeploy the previous Vercel build if needed. The schema is additive and the previous app ignores the new tables, so **no schema rollback is required** and no data is dropped.
3. Auth and all pre-existing data are unaffected (users, profiles, integrations, prospects, playbooks…).
4. **Legacy outreach is NOT re-enabled implicitly.** Re-enabling is an explicit decision: `update public.revenue_org_flags set legacy_outreach_enabled = true where organization_id = :'org';` (commented out in the script on purpose).

## What rollback cannot do
* A HubSpot task or field change that already succeeded is **not undone**. Find it via `revenue_action_executions.external_result_id` (`status='succeeded'`), review it, and create a **compensating** action (delete the task in HubSpot manually or via a reviewed change). Executions in `needs_review` need a human check in HubSpot first.
* Jobs already `running` finish their current step; `execute_action` re-checks the flags before writing and refuses when they are off.

## Data safety
Nothing here uses `DROP`, `TRUNCATE`, `DELETE` of business data or `auth` changes. Audit events are append-only (a trigger blocks update/delete/truncate). Credentials are only deleted by an explicit **Disconnect**.

## Eventual cleanup (separate future change, not part of this MVP)
Drop Revenue tables only after a retention decision; remove legacy plaintext secrets tables/columns only after every tenant is migrated and stable.
