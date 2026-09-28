-- Non-destructive rollback of the Revenue rollout for ONE organization.
-- Replace :org with the organization uuid. Drops nothing; deletes nothing.
-- It does NOT re-enable legacy outreach (that must be an explicit decision).
--
-- 1. stop new Revenue work
update public.revenue_org_flags
   set revenue_mvp_enabled = false, managed_ai_enabled = false,
       hubspot_write_actions_enabled = false, updated_at = now()
 where organization_id = :'org';

-- 2. pause queued/in-flight write jobs (running ones drain: the executor re-checks flags)
update private.revenue_jobs set status = 'dead', last_error = 'paused by rollback', finished_at = now(), locked_by = null, lease_until = null
 where organization_id = :'org' and status = 'queued' and kind in ('execute_action','brief','sync','reconcile','evaluate');

-- 3. proposals not yet executed cannot be approved afterwards
update public.revenue_action_proposals set status = 'cancelled'
 where organization_id = :'org' and status in ('proposed','approved');

-- Executions already 'succeeded' in HubSpot are NOT undone: a reviewed compensating
-- action is required (see docs/revenue/rollback.md).
--
-- Explicit, separate decision (leave commented):
-- update public.revenue_org_flags set legacy_outreach_enabled = true where organization_id = :'org';
