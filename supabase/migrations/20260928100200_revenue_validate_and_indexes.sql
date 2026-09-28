-- ============================================================================
-- Migration 3/3: validation + indexes
-- Indexes follow the real access paths of the API (org + status / deal / recency).
-- The validation block RAISES if the backfill left any auth user without an
-- organization, so a partially-applied backfill cannot go unnoticed.
-- ============================================================================

create index if not exists crm_deals_org_open_idx        on public.crm_deals (organization_id, archived, pipeline_id, stage_id);
create index if not exists crm_deals_org_owner_idx       on public.crm_deals (organization_id, owner_id);
create index if not exists crm_deals_org_updated_idx     on public.crm_deals (organization_id, source_updated_at desc);
create index if not exists crm_deals_stage_idx           on public.crm_deals (organization_id, stage_id);
create index if not exists crm_activities_org_time_idx   on public.crm_activities (organization_id, occurred_at desc);
create index if not exists crm_associations_from_idx     on public.crm_associations (organization_id, connection_id, from_type, from_external_id);
create index if not exists crm_associations_to_idx       on public.crm_associations (organization_id, connection_id, to_type, to_external_id);
create index if not exists crm_property_history_deal_idx on public.crm_property_history (organization_id, deal_id, property, effective_at desc);
create index if not exists revenue_findings_org_status_idx on public.revenue_findings (organization_id, status, severity);
create index if not exists revenue_findings_deal_idx     on public.revenue_findings (organization_id, deal_id);
create index if not exists revenue_evaluations_deal_idx  on public.revenue_evaluations (organization_id, deal_id, as_of desc);
create index if not exists revenue_snapshots_org_idx     on public.revenue_score_snapshots (organization_id, filters_hash, created_at desc);
create index if not exists revenue_sync_runs_org_idx     on public.revenue_sync_runs (organization_id, created_at desc);
create index if not exists revenue_briefs_org_idx        on public.revenue_briefs (organization_id, created_at desc);
create index if not exists revenue_chat_messages_idx     on public.revenue_chat_messages (organization_id, session_id, created_at);
create index if not exists revenue_proposals_org_idx     on public.revenue_action_proposals (organization_id, status, created_at desc);
create index if not exists revenue_proposals_deal_idx    on public.revenue_action_proposals (organization_id, deal_id);
create index if not exists revenue_audit_org_idx         on public.revenue_audit_events (organization_id, created_at desc);
create index if not exists revenue_ai_usage_org_idx      on public.revenue_ai_usage (organization_id, period_month, created_at);
create index if not exists org_members_user_idx          on public.organization_members (user_id) where status = 'active';
create index if not exists revenue_jobs_claim_idx        on private.revenue_jobs (status, run_after) where status in ('queued','running');
create index if not exists oauth_attempts_expiry_idx     on private.oauth_attempts (expires_at);

do $$
declare _orphans int; _dupes int;
begin
  select count(*) into _orphans from auth.users u
   where not exists (select 1 from public.organization_members m where m.user_id = u.id);
  if _orphans > 0 then
    raise exception 'revenue backfill incomplete: % auth users have no organization membership (re-run migration 2)', _orphans;
  end if;
  select count(*) into _dupes from (
    select user_id from public.revenue_legacy_user_org_map group by user_id having count(*) > 1) d;
  if _dupes > 0 then raise exception 'revenue backfill: duplicate mappings'; end if;
end $$;
