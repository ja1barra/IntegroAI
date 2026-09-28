-- Read-only post-migration verification. Run in the SQL editor / psql; every
-- query must return 0 rows in the "problems" sections.

-- 1. users without a membership (expect 0)
select u.id from auth.users u
 where not exists (select 1 from public.organization_members m where m.user_id = u.id);

-- 2. RLS enabled on every new table (expect 0 rows)
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname in ('public','private') and c.relkind = 'r'
   and (c.relname like 'crm\_%' or c.relname like 'revenue\_%' or c.relname in ('organizations','organization_members','crm_credentials','oauth_attempts'))
   and not c.relrowsecurity;

-- 3. browser roles must hold no write privilege on new tables (expect 0 rows)
select grantee, table_schema, table_name, privilege_type from information_schema.role_table_grants
 where grantee in ('anon','authenticated') and table_schema in ('public','private')
   and (table_name like 'crm\_%' or table_name like 'revenue\_%' or table_name in ('organizations','organization_members'))
   and privilege_type <> 'SELECT';

-- 4. anon must hold nothing (expect 0 rows)
select table_name, privilege_type from information_schema.role_table_grants
 where grantee = 'anon' and (table_name like 'crm\_%' or table_name like 'revenue\_%' or table_name in ('organizations','organization_members'));

-- 5. rv_* functions callable by browser roles (expect 0 rows)
select p.proname, r.rolname from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
       (select rolname from pg_roles where rolname in ('anon','authenticated')) r
 where n.nspname = 'public' and p.proname in (
   'rv_ensure_user_org','rv_legacy_outreach_allowed','rv_audit','rv_create_oauth_attempt','rv_consume_oauth_attempt',
   'rv_activate_hubspot_connection','rv_get_credentials','rv_acquire_refresh_lease','rv_store_refreshed_credentials',
   'rv_release_refresh_lease','rv_mark_connection','rv_disconnect_connection','rv_enqueue_job','rv_claim_job',
   'rv_heartbeat_job','rv_finish_job','rv_get_job','rv_reserve_ai_usage','rv_settle_ai_usage',
   'rv_approve_proposal','rv_begin_execution','rv_finish_execution')
   and has_function_privilege(r.rolname, p.oid, 'execute');

-- 6. legacy data untouched: compare with the pre-migration baseline you captured
select 'user_profiles' t, count(*) from public.user_profiles
union all select 'integrations', count(*) from public.integrations
union all select 'ai_provider_settings', count(*) from public.ai_provider_settings;

-- 7. flags after migrating a tenant: legacy outreach must be off
select organization_id, revenue_mvp_enabled, managed_ai_enabled, hubspot_write_actions_enabled, legacy_outreach_enabled
  from public.revenue_org_flags order by updated_at desc limit 50;
