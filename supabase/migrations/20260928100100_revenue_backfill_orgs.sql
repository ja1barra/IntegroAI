-- ============================================================================
-- Migration 2/3: tenancy backfill (idempotent, batched, restartable)
--
-- Existing data is scoped by user_id only (no organization table existed).
-- Rule: each existing auth user gets ONE explicit organization of their own and
-- an admin membership. We never group users by e-mail/domain/org-name text.
-- Users that already have a mapping/membership are skipped, so re-running (or
-- resuming after an interruption) is safe. Nothing is deleted or rewritten.
-- Legacy columns (user_id on prospects, integrations, ...) are left untouched.
-- ============================================================================

do $$
declare
  _batch_size constant int := 500;
  _n int;
  _u record;
  _org uuid;
  _total int := 0;
begin
  loop
    _n := 0;
    for _u in
      select u.id as user_id,
             coalesce(nullif(btrim(p.org), ''), 'My Company') as org_name
        from auth.users u
        left join public.user_profiles p on p.id = u.id
       where not exists (select 1 from public.revenue_legacy_user_org_map m where m.user_id = u.id)
         and not exists (select 1 from public.organization_members om where om.user_id = u.id)
       order by u.created_at, u.id
       limit _batch_size
    loop
      insert into public.organizations (name, created_by) values (_u.org_name, _u.user_id) returning id into _org;
      insert into public.organization_members (organization_id, user_id, role) values (_org, _u.user_id, 'admin');
      insert into public.revenue_legacy_user_org_map (user_id, organization_id) values (_u.user_id, _org);
      insert into public.revenue_org_flags (organization_id) values (_org) on conflict do nothing;
      insert into public.revenue_settings (organization_id) values (_org) on conflict do nothing;
      _n := _n + 1;
    end loop;
    _total := _total + _n;
    exit when _n < _batch_size;
  end loop;
  raise notice 'revenue backfill: created % organizations', _total;
end $$;

-- Users that already had a membership (e.g. created between migration 1 and 2
-- through rv_ensure_user_org) still get a mapping row for traceability.
insert into public.revenue_legacy_user_org_map (user_id, organization_id)
select om.user_id, om.organization_id
  from public.organization_members om
 where om.role = 'admin'
   and not exists (select 1 from public.revenue_legacy_user_org_map m where m.user_id = om.user_id)
on conflict (user_id) do nothing;
