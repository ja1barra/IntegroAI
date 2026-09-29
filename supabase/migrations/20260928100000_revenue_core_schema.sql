-- ============================================================================
-- IntegroAI Revenue Manager — migration 1/3: additive structures + RLS + grants
--
-- Purely additive: creates new tables/functions only. It does not alter or drop
-- any pre-existing table (user_profiles, integrations, prospects, ...), does not
-- touch auth.users, and does not modify the on_auth_user_created trigger.
--
-- Access model
--   * Tenant = public.organizations. Every commercial row carries organization_id.
--   * The browser (role `authenticated`) gets SELECT only, filtered by RLS on
--     active membership. It can never INSERT/UPDATE/DELETE these tables.
--   * All writes (sync, scoring, approvals, jobs, audit, credentials) go through
--     the server using the service role or the SECURITY DEFINER rv_* functions
--     below (EXECUTE granted to service_role only).
--   * Secrets and job queue live in schema `private`, which is not exposed by
--     the Data API. The server reaches them only through rv_* functions.
-- ============================================================================

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ── generic helpers ─────────────────────────────────────────────────────────
create or replace function public.rv_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create or replace function public.rv_block_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% on %.% is not allowed (append-only / immutable)', tg_op, tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end $$;

-- ── organizations & membership ──────────────────────────────────────────────
create table if not exists public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(name) between 1 and 200),
  timezone         text not null default 'UTC',
  default_currency text check (default_currency is null or default_currency ~ '^[A-Z]{3}$'),
  status           text not null default 'active' check (status in ('active','suspended')),
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger organizations_touch before update on public.organizations
  for each row execute function public.rv_touch_updated_at();

create table if not exists public.organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null check (role in ('admin','manager','member','viewer')),
  status          text not null default 'active' check (status in ('active','invited','disabled')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create trigger organization_members_touch before update on public.organization_members
  for each row execute function public.rv_touch_updated_at();

-- SECURITY DEFINER so the RLS policies below can consult membership without
-- recursing into organization_members' own policy. Identity comes from
-- auth.uid(); the org id is only a *question* ("am I a member of it?").
create or replace function public.rv_is_member(_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = (select auth.uid()) and m.status = 'active'
  )
$$;

create or replace function public.rv_has_role(_org uuid, _roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = _org and m.user_id = (select auth.uid())
      and m.status = 'active' and m.role = any (_roles)
  )
$$;

revoke execute on function public.rv_is_member(uuid) from public, anon;
revoke execute on function public.rv_has_role(uuid, text[]) from public, anon;
grant  execute on function public.rv_is_member(uuid) to authenticated, service_role;
grant  execute on function public.rv_has_role(uuid, text[]) to authenticated, service_role;

-- Per-org rollout flags (checked server-side). Writes: server only.
create table if not exists public.revenue_org_flags (
  organization_id              uuid primary key references public.organizations(id),
  revenue_mvp_enabled          boolean not null default false,
  managed_ai_enabled           boolean not null default false,
  hubspot_write_actions_enabled boolean not null default false,
  legacy_outreach_enabled      boolean not null default true,
  updated_at                   timestamptz not null default now()
);

-- Org-level Revenue settings (onboarding + limits).
create table if not exists public.revenue_settings (
  organization_id        uuid primary key references public.organizations(id),
  selected_pipeline_ids  text[] not null default '{}',
  timezone               text,
  currency               text check (currency is null or currency ~ '^[A-Z]{3}$'),
  brief_cadence          text not null default 'weekly' check (brief_cadence in ('daily','weekly')),
  onboarding_state       text not null default 'not_started'
                         check (onboarding_state in ('not_started','connected','pipeline_selected','stages_mapped','confirmed','synced')),
  ai_monthly_token_budget bigint not null default 2000000 check (ai_monthly_token_budget >= 0),
  ai_requests_per_hour    integer not null default 60 check (ai_requests_per_hour >= 0),
  retention_days_after_disconnect integer not null default 30 check (retention_days_after_disconnect >= 0),
  updated_at             timestamptz not null default now()
);

-- Legacy user → organization mapping (written by the backfill; idempotent).
create table if not exists public.revenue_legacy_user_org_map (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  created_at      timestamptz not null default now()
);

-- ── CRM connection (no secrets here) ────────────────────────────────────────
create table if not exists public.crm_connections (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  provider        text not null check (provider in ('hubspot')),
  portal_id       text not null,
  status          text not null check (status in ('active','reconnect_required','disconnected','error')),
  granted_scopes  text[] not null default '{}',
  capabilities    jsonb not null default '{}'::jsonb,
  connected_by    uuid references auth.users(id) on delete set null,
  connected_at    timestamptz not null default now(),
  last_success_at timestamptz,
  disconnected_at timestamptz,
  last_error      text,
  updated_at      timestamptz not null default now(),
  unique (organization_id, id)
);
create trigger crm_connections_touch before update on public.crm_connections
  for each row execute function public.rv_touch_updated_at();
-- One live connection per org, and one org per live portal (no silent transfer).
create unique index if not exists crm_connections_one_live_per_org
  on public.crm_connections (organization_id) where status <> 'disconnected';
create unique index if not exists crm_connections_one_org_per_portal
  on public.crm_connections (provider, portal_id) where status <> 'disconnected';

-- ── private: credentials, OAuth attempts, job queue ────────────────────────
create table if not exists private.crm_credentials (
  connection_id      uuid primary key,
  organization_id    uuid not null,
  access_token_enc   text not null,
  refresh_token_enc  text not null,
  expires_at         timestamptz not null,
  key_version        text not null,
  refresh_lease_until timestamptz,
  refresh_locked_by  text,
  updated_at         timestamptz not null default now(),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id)
);
alter table private.crm_credentials enable row level security;

create table if not exists private.oauth_attempts (
  id                   uuid primary key default gen_random_uuid(),
  state_hash           text not null unique,
  user_id              uuid not null,
  organization_id      uuid not null references public.organizations(id),
  target_connection_id uuid,
  redirect_to          text not null,
  requested_scopes     text[] not null default '{}',
  created_at           timestamptz not null default now(),
  expires_at           timestamptz not null,
  consumed_at          timestamptz
);
alter table private.oauth_attempts enable row level security;

create table if not exists private.revenue_jobs (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  kind            text not null check (kind in ('sync','evaluate','brief','execute_action','reconcile','rotate_credentials')),
  payload         jsonb not null default '{}'::jsonb,
  dedupe_key      text,
  status          text not null default 'queued' check (status in ('queued','running','succeeded','failed','dead')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 5,
  run_after       timestamptz not null default now(),
  lease_until     timestamptz,
  locked_by       text,
  progress        jsonb not null default '{}'::jsonb,
  last_error      text,
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  finished_at     timestamptz
);
alter table private.revenue_jobs enable row level security;
create unique index if not exists revenue_jobs_dedupe_live
  on private.revenue_jobs (organization_id, dedupe_key) where dedupe_key is not null and status in ('queued','running');

-- ── normalized CRM mirror ───────────────────────────────────────────────────
create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  external_id text not null,
  label text not null,
  display_order integer,
  archived boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, connection_id, external_id),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id)
);

create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  pipeline_id uuid not null,
  external_id text not null,
  label text not null,
  display_order integer,
  -- metadata from the CRM (never inferred from the label)
  is_closed boolean,
  is_won boolean,
  probability numeric(5,4),
  -- normalized category chosen/confirmed by an admin in onboarding
  category text not null default 'unmapped' check (category in ('early','mid','late','closed','unmapped')),
  category_source text not null default 'none' check (category_source in ('none','metadata','admin')),
  archived boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, connection_id, external_id),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id),
  foreign key (organization_id, pipeline_id) references public.crm_pipelines (organization_id, id)
);

create table if not exists public.crm_owners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  external_id text not null,
  name text,
  email text,
  archived boolean not null default false,
  synced_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, connection_id, external_id),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id)
);

create table if not exists public.crm_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  external_id text not null,
  name text,
  domain text,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  archived boolean not null default false,
  unique (organization_id, id),
  unique (organization_id, connection_id, external_id),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id)
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  external_id text not null,
  first_name text,
  last_name text,
  job_title text,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  archived boolean not null default false,
  unique (organization_id, id),
  unique (organization_id, connection_id, external_id),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id)
);

create table if not exists public.crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  external_id text not null,
  name text,
  pipeline_id uuid,
  stage_id uuid,
  owner_id uuid,
  company_id uuid,
  stage_external_id text,
  owner_external_id text,
  owner_state text not null default 'unknown' check (owner_state in ('value','empty','unknown')),
  -- per-field knowledge: value | empty | denied | unknown (see docs/revenue/scoring.md)
  field_states jsonb not null default '{}'::jsonb,
  amount numeric(20,4),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  close_at timestamptz,
  stage_entered_at timestamptz,
  stage_entered_source text check (stage_entered_source in ('history','observed')),
  created_at_source timestamptz,
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  archived boolean not null default false,
  unique (organization_id, id),
  unique (organization_id, connection_id, external_id),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id),
  foreign key (organization_id, pipeline_id) references public.crm_pipelines (organization_id, id),
  foreign key (organization_id, stage_id)    references public.crm_stages (organization_id, id),
  foreign key (organization_id, owner_id)    references public.crm_owners (organization_id, id),
  foreign key (organization_id, company_id)  references public.crm_companies (organization_id, id)
);

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  external_id text not null,
  type text not null check (type in ('call','email','meeting','task','note')),
  occurred_at timestamptz,
  due_at timestamptz,
  status text,
  direction text,
  subject text,
  body_excerpt text,
  is_system boolean not null default false,
  provenance text not null default 'hubspot',
  source_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  archived boolean not null default false,
  unique (organization_id, id),
  unique (organization_id, connection_id, type, external_id),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id)
);

create table if not exists public.crm_associations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  from_type text not null,
  from_external_id text not null,
  to_type text not null,
  to_external_id text not null,
  association_type text not null default '',
  synced_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, connection_id, from_type, from_external_id, to_type, to_external_id, association_type),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id)
);

create table if not exists public.crm_property_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  deal_id uuid not null,
  property text not null,
  value text,
  effective_at timestamptz not null,
  source text not null default 'hubspot_history' check (source in ('hubspot_history','observed')),
  unique (organization_id, deal_id, property, effective_at),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id),
  foreign key (organization_id, deal_id) references public.crm_deals (organization_id, id)
);

-- ── sync bookkeeping ────────────────────────────────────────────────────────
create table if not exists public.revenue_sync_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  kind text not null default 'incremental' check (kind in ('full','incremental')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','partial','failed','cancelled')),
  requested_by uuid,
  job_id uuid,
  started_at timestamptz,
  finished_at timestamptz,
  counters jsonb not null default '{}'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id)
);

create table if not exists public.revenue_sync_cursors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  connection_id uuid not null,
  object_type text not null,
  cursor_after text,
  high_watermark timestamptz,
  status text not null default 'idle' check (status in ('idle','running','error')),
  updated_at timestamptz not null default now(),
  unique (organization_id, connection_id, object_type),
  foreign key (organization_id, connection_id) references public.crm_connections (organization_id, id)
);

-- ── rules, evaluations, findings, snapshots ─────────────────────────────────
create table if not exists public.revenue_rule_sets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  version integer not null check (version > 0),
  engine_version text not null,
  config jsonb not null,
  effective_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, version)
);
create trigger revenue_rule_sets_immutable before update or delete on public.revenue_rule_sets
  for each row execute function public.rv_block_mutation();

create table if not exists public.revenue_score_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  sync_run_id uuid,
  filters jsonb not null default '{}'::jsonb,
  filters_hash text not null,
  as_of timestamptz not null,
  rules_version integer not null,
  score numeric(5,2),
  eligible_count integer not null default 0,
  total_open_count integer not null default 0,
  avg_coverage numeric(5,4),
  status text not null default 'complete' check (status in ('complete','partial')),
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, filters_hash, sync_run_id, rules_version, as_of),
  foreign key (organization_id, sync_run_id) references public.revenue_sync_runs (organization_id, id)
);

create table if not exists public.revenue_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  deal_id uuid not null,
  rules_version integer not null,
  as_of timestamptz not null,
  input_hash text not null,
  health integer check (health between 0 and 100),
  coverage numeric(5,4),
  eligible boolean not null default false,
  provisional boolean not null default false,
  band text not null check (band in ('healthy','attention','high_risk','provisional','not_evaluable','not_applicable')),
  results jsonb not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, deal_id, input_hash, rules_version),
  foreign key (organization_id, deal_id) references public.crm_deals (organization_id, id)
);

create table if not exists public.revenue_snapshot_items (
  organization_id uuid not null,
  snapshot_id uuid not null,
  deal_id uuid not null,
  evaluation_id uuid not null,
  primary key (snapshot_id, deal_id),
  foreign key (organization_id, snapshot_id)   references public.revenue_score_snapshots (organization_id, id),
  foreign key (organization_id, deal_id)       references public.crm_deals (organization_id, id),
  foreign key (organization_id, evaluation_id) references public.revenue_evaluations (organization_id, id)
);

create table if not exists public.revenue_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  deal_id uuid not null,
  rule_key text not null,
  dedupe_key text not null,
  category text not null,
  severity text not null check (severity in ('high','medium','low','info')),
  status text not null default 'open' check (status in ('open','resolved')),
  rules_version integer not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  recommendation text,
  unique (organization_id, id),
  unique (organization_id, deal_id, rule_key),
  foreign key (organization_id, deal_id) references public.crm_deals (organization_id, id)
);

-- User preference layer, deliberately separate from computed truth.
create table if not exists public.revenue_finding_preferences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  finding_id uuid not null,
  state text not null check (state in ('dismissed','snoozed')),
  reason text not null check (length(reason) between 1 and 500),
  until timestamptz,
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (state <> 'snoozed' or until is not null),
  unique (organization_id, finding_id),
  foreign key (organization_id, finding_id) references public.revenue_findings (organization_id, id)
);

-- ── briefs & chat ───────────────────────────────────────────────────────────
create table if not exists public.revenue_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  period text not null check (period in ('daily','weekly')),
  period_start date not null,
  period_end date not null,
  snapshot_id uuid,
  previous_snapshot_id uuid,
  is_baseline boolean not null default false,
  status text not null default 'queued' check (status in ('queued','generating','ready','failed')),
  rules_version integer,
  prompt_version text,
  model text,
  content jsonb,
  evidence_refs jsonb not null default '[]'::jsonb,
  idempotency_key text not null,
  error text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, snapshot_id) references public.revenue_score_snapshots (organization_id, id),
  foreign key (organization_id, previous_snapshot_id) references public.revenue_score_snapshots (organization_id, id)
);
create trigger revenue_briefs_touch before update on public.revenue_briefs
  for each row execute function public.rv_touch_updated_at();

create table if not exists public.revenue_chat_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table if not exists public.revenue_ai_usage (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid,
  feature text not null check (feature in ('brief','ask','recommendation')),
  model text,
  status text not null default 'reserved' check (status in ('reserved','ok','error','refused','incomplete')),
  reserved_tokens integer not null default 0,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  estimated_cost_usd numeric(14,6),
  pricing_version text,
  request_id text,
  job_id uuid,
  period_month date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (organization_id, id)
);

create table if not exists public.revenue_chat_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  session_id uuid not null,
  role text not null check (role in ('user','assistant')),
  content text not null,
  evidence_refs jsonb not null default '[]'::jsonb,
  usage_id uuid,
  data_as_of timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, session_id) references public.revenue_chat_sessions (organization_id, id),
  foreign key (organization_id, usage_id) references public.revenue_ai_usage (organization_id, id)
);

-- Versioned price table; empty until ops loads real, current rates. Cost stays
-- NULL (never invented) when no rate exists for the model.
create table if not exists public.revenue_pricing_rates (
  id uuid primary key default gen_random_uuid(),
  model text not null,
  version text not null,
  input_usd_per_mtok numeric(12,6) not null,
  output_usd_per_mtok numeric(12,6) not null,
  cached_input_usd_per_mtok numeric(12,6),
  effective_at timestamptz not null default now(),
  unique (model, version)
);

-- ── approvals & execution ───────────────────────────────────────────────────
create table if not exists public.revenue_action_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  deal_id uuid not null,
  kind text not null check (kind in ('create_task','update_deal_fields','email_draft')),
  payload jsonb not null,
  payload_hash text not null,
  version integer not null default 1 check (version > 0),
  base_state jsonb not null default '{}'::jsonb,
  rationale text,
  source text not null default 'user' check (source in ('user','ai')),
  portal_id text not null,
  status text not null default 'proposed' check (status in
    ('proposed','approved','executing','succeeded','rejected','cancelled','expired','conflict','failed','needs_review')),
  created_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  approved_version integer,
  approved_hash text,
  rejected_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, deal_id) references public.crm_deals (organization_id, id)
);
create trigger revenue_action_proposals_touch before update on public.revenue_action_proposals
  for each row execute function public.rv_touch_updated_at();

create table if not exists public.revenue_action_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  proposal_id uuid not null,
  proposal_version integer not null,
  idempotency_key text not null,
  attempt integer not null default 1,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','needs_review','conflict')),
  external_result_id text,
  uncertain boolean not null default false,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, proposal_id) references public.revenue_action_proposals (organization_id, id)
);

create table if not exists public.revenue_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_type text not null check (actor_type in ('user','system','ai')),
  actor_user_id uuid,
  event text not null,
  entity_type text,
  entity_id text,
  before_state jsonb,
  after_state jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create trigger revenue_audit_no_update before update or delete on public.revenue_audit_events
  for each row execute function public.rv_block_mutation();
create trigger revenue_audit_no_truncate before truncate on public.revenue_audit_events
  for each statement execute function public.rv_block_mutation();

-- ── RLS + grants (same migration, as required) ─────────────────────────────
do $$
declare
  t text;
  member_read text[] := array[
    'crm_connections','crm_pipelines','crm_stages','crm_owners','crm_companies','crm_contacts',
    'crm_deals','crm_activities','crm_associations','crm_property_history',
    'revenue_sync_runs','revenue_sync_cursors','revenue_rule_sets','revenue_evaluations',
    'revenue_snapshot_items','revenue_score_snapshots','revenue_findings','revenue_finding_preferences',
    'revenue_briefs','revenue_action_proposals','revenue_action_executions',
    'revenue_settings','revenue_org_flags'
  ];
  locked text[] := array['revenue_pricing_rates','revenue_legacy_user_org_map'];
  all_t text[] := member_read || array['organizations','organization_members','revenue_chat_sessions',
    'revenue_chat_messages','revenue_audit_events','revenue_ai_usage'] || locked;
begin
  foreach t in array all_t loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;

  foreach t in array member_read loop
    execute format('grant select on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select public.rv_is_member(organization_id)))',
      t || '_member_select', t);
  end loop;
end $$;

grant select on public.organizations, public.organization_members,
  public.revenue_chat_sessions, public.revenue_chat_messages,
  public.revenue_audit_events, public.revenue_ai_usage to authenticated;

create policy organizations_member_select on public.organizations for select to authenticated
  using ((select public.rv_is_member(id)));
create policy organization_members_select on public.organization_members for select to authenticated
  using (user_id = (select auth.uid()) or (select public.rv_is_member(organization_id)));
-- Chat sessions are private to their creator (within their org) by default.
create policy revenue_chat_sessions_owner_select on public.revenue_chat_sessions for select to authenticated
  using (created_by = (select auth.uid()) and (select public.rv_is_member(organization_id)));
create policy revenue_chat_messages_owner_select on public.revenue_chat_messages for select to authenticated
  using (
    (select public.rv_is_member(organization_id)) and exists (
      select 1 from public.revenue_chat_sessions s
      where s.id = session_id and s.organization_id = organization_id and s.created_by = (select auth.uid())
    )
  );
create policy revenue_audit_events_reviewer_select on public.revenue_audit_events for select to authenticated
  using ((select public.rv_has_role(organization_id, array['admin','manager'])));
create policy revenue_ai_usage_admin_select on public.revenue_ai_usage for select to authenticated
  using ((select public.rv_has_role(organization_id, array['admin'])));

-- Private tables: no policies at all (deny by default) and no grants.
revoke all on all tables in schema private from public, anon, authenticated;

-- ── server-only RPCs (SECURITY DEFINER, EXECUTE only for service_role) ──────
-- Each one validates its inputs explicitly; none trusts an org id supplied by a
-- browser (the browser cannot call them).

create or replace function public.rv_ensure_user_org(_user uuid, _name text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _org uuid;
begin
  select m.organization_id into _org from public.organization_members m
   where m.user_id = _user and m.status = 'active' order by m.created_at limit 1;
  if _org is not null then return _org; end if;
  perform pg_advisory_xact_lock(hashtextextended('rv_ensure_user_org:' || _user::text, 0));
  select m.organization_id into _org from public.organization_members m
   where m.user_id = _user and m.status = 'active' order by m.created_at limit 1;
  if _org is not null then return _org; end if;
  insert into public.organizations (name, created_by)
    values (left(coalesce(nullif(btrim(_name), ''), 'My Company'), 200), _user) returning id into _org;
  insert into public.organization_members (organization_id, user_id, role) values (_org, _user, 'admin');
  insert into public.revenue_org_flags (organization_id) values (_org) on conflict do nothing;
  insert into public.revenue_settings (organization_id) values (_org) on conflict do nothing;
  return _org;
end $$;

create or replace function public.rv_legacy_outreach_allowed(_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (
    select 1 from public.organization_members m
    join public.revenue_org_flags f on f.organization_id = m.organization_id
    where m.user_id = _user and m.status = 'active' and f.legacy_outreach_enabled = false
  )
$$;

create or replace function public.rv_audit(
  _org uuid, _actor_type text, _actor uuid, _event text, _entity_type text, _entity_id text,
  _before jsonb, _after jsonb, _request_id text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _id uuid;
begin
  insert into public.revenue_audit_events (organization_id, actor_type, actor_user_id, event, entity_type, entity_id, before_state, after_state, request_id)
  values (_org, _actor_type, _actor, _event, _entity_type, _entity_id, _before, _after, _request_id)
  returning id into _id;
  return _id;
end $$;

-- OAuth attempts -------------------------------------------------------------
create or replace function public.rv_create_oauth_attempt(
  _state_hash text, _user uuid, _org uuid, _target uuid, _redirect text, _scopes text[], _ttl_seconds int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _id uuid;
begin
  if not exists (select 1 from public.organization_members m
                 where m.organization_id = _org and m.user_id = _user and m.status = 'active' and m.role = 'admin') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into private.oauth_attempts (state_hash, user_id, organization_id, target_connection_id, redirect_to, requested_scopes, expires_at)
  values (_state_hash, _user, _org, _target, _redirect, _scopes, now() + make_interval(secs => _ttl_seconds))
  returning id into _id;
  return _id;
end $$;

-- Single-use: the UPDATE ... WHERE consumed_at IS NULL is the replay guard.
create or replace function public.rv_consume_oauth_attempt(_state_hash text)
returns table (user_id uuid, organization_id uuid, target_connection_id uuid, redirect_to text, requested_scopes text[])
language sql security definer set search_path = '' as $$
  update private.oauth_attempts a set consumed_at = now()
   where a.state_hash = _state_hash and a.consumed_at is null and a.expires_at > now()
  returning a.user_id, a.organization_id, a.target_connection_id, a.redirect_to, a.requested_scopes
$$;

-- Connection activation (one transaction: portal uniqueness + credentials) ---
create or replace function public.rv_activate_hubspot_connection(
  _org uuid, _user uuid, _portal text, _scopes text[], _capabilities jsonb,
  _access_enc text, _refresh_enc text, _expires_at timestamptz, _key_version text, _target uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _conn uuid; _existing public.crm_connections%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('rv_portal:' || _portal, 0));
  if exists (select 1 from public.crm_connections c
              where c.provider = 'hubspot' and c.portal_id = _portal and c.status <> 'disconnected'
                and c.organization_id <> _org) then
    raise exception 'portal_in_use' using errcode = 'P0001';
  end if;
  select * into _existing from public.crm_connections c
   where c.organization_id = _org and c.status <> 'disconnected' for update;
  if found then
    if _existing.portal_id <> _portal then
      -- Reconnecting a *different* portal is a deliberate transfer: refuse here.
      raise exception 'portal_mismatch' using errcode = 'P0001';
    end if;
    if _target is not null and _target <> _existing.id then
      raise exception 'target_mismatch' using errcode = 'P0001';
    end if;
    _conn := _existing.id;
    update public.crm_connections set status = 'active', granted_scopes = _scopes, capabilities = _capabilities,
           last_error = null, connected_by = _user where id = _conn;
  else
    -- Reconnecting the same portal after a disconnect revives the previous connection row, so the mirror
    -- (unique per org+connection+external_id) keeps its history instead of duplicating every pipeline/stage.
    select * into _existing from public.crm_connections c
     where c.organization_id = _org and c.provider = 'hubspot' and c.portal_id = _portal and c.status = 'disconnected'
     order by c.disconnected_at desc nulls last limit 1 for update;
    if found then
      _conn := _existing.id;
      update public.crm_connections set status = 'active', granted_scopes = _scopes, capabilities = _capabilities,
             last_error = null, connected_by = _user, disconnected_at = null where id = _conn;
    else
      insert into public.crm_connections (organization_id, provider, portal_id, status, granted_scopes, capabilities, connected_by)
      values (_org, 'hubspot', _portal, 'active', _scopes, _capabilities, _user) returning id into _conn;
    end if;
  end if;
  insert into private.crm_credentials (connection_id, organization_id, access_token_enc, refresh_token_enc, expires_at, key_version)
  values (_conn, _org, _access_enc, _refresh_enc, _expires_at, _key_version)
  on conflict (connection_id) do update set access_token_enc = excluded.access_token_enc,
    refresh_token_enc = excluded.refresh_token_enc, expires_at = excluded.expires_at,
    key_version = excluded.key_version, refresh_lease_until = null, refresh_locked_by = null, updated_at = now();
  update public.revenue_settings set onboarding_state = case when onboarding_state = 'not_started' then 'connected' else onboarding_state end
   where organization_id = _org;
  return _conn;
end $$;

-- Credential access (server only) -------------------------------------------
create or replace function public.rv_get_credentials(_conn uuid)
returns table (connection_id uuid, organization_id uuid, access_token_enc text, refresh_token_enc text,
               expires_at timestamptz, key_version text)
language sql security definer set search_path = '' as $$
  select c.connection_id, c.organization_id, c.access_token_enc, c.refresh_token_enc, c.expires_at, c.key_version
    from private.crm_credentials c
    join public.crm_connections k on k.id = c.connection_id and k.organization_id = c.organization_id
   where c.connection_id = _conn and k.status in ('active','reconnect_required')
$$;

create or replace function public.rv_acquire_refresh_lease(_conn uuid, _worker text, _seconds int)
returns boolean language plpgsql security definer set search_path = '' as $$
declare _n int;
begin
  update private.crm_credentials set refresh_lease_until = now() + make_interval(secs => _seconds), refresh_locked_by = _worker
   where connection_id = _conn and (refresh_lease_until is null or refresh_lease_until < now());
  get diagnostics _n = row_count;
  return _n = 1;
end $$;

-- Stores the (possibly rotated) tokens atomically; only the lease holder may write.
create or replace function public.rv_store_refreshed_credentials(
  _conn uuid, _worker text, _access_enc text, _refresh_enc text, _expires_at timestamptz, _key_version text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare _n int;
begin
  update private.crm_credentials set access_token_enc = _access_enc, refresh_token_enc = _refresh_enc,
         expires_at = _expires_at, key_version = _key_version, refresh_lease_until = null,
         refresh_locked_by = null, updated_at = now()
   where connection_id = _conn and refresh_locked_by = _worker and refresh_lease_until >= now();
  get diagnostics _n = row_count;
  return _n = 1;
end $$;

create or replace function public.rv_release_refresh_lease(_conn uuid, _worker text)
returns void language sql security definer set search_path = '' as $$
  update private.crm_credentials set refresh_lease_until = null, refresh_locked_by = null
   where connection_id = _conn and refresh_locked_by = _worker
$$;

create or replace function public.rv_mark_connection(_conn uuid, _status text, _error text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if _status not in ('active','reconnect_required','error') then raise exception 'bad status'; end if;
  update public.crm_connections set status = _status, last_error = left(_error, 500),
         last_success_at = case when _status = 'active' and _error is null then now() else last_success_at end
   where id = _conn and status <> 'disconnected';
end $$;

-- Disconnect: mark, drop credentials, cancel queued work. Data is retained per
-- revenue_settings.retention_days_after_disconnect (purge is a separate, reviewed job).
create or replace function public.rv_disconnect_connection(_org uuid, _conn uuid, _actor uuid, _request_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.crm_connections set status = 'disconnected', disconnected_at = now(), last_error = null
   where id = _conn and organization_id = _org and status <> 'disconnected';
  if not found then return false; end if;
  delete from private.crm_credentials where connection_id = _conn;
  update private.revenue_jobs set status = 'dead', last_error = 'connection disconnected', finished_at = now(),
         locked_by = null, lease_until = null
   where organization_id = _org and status in ('queued','running') and kind in ('sync','reconcile','execute_action','evaluate');
  update public.revenue_action_proposals set status = 'cancelled'
   where organization_id = _org and status in ('proposed','approved');
  update public.revenue_sync_runs set status = 'cancelled', error = 'connection disconnected', finished_at = now()
   where organization_id = _org and status in ('queued','running');
  perform public.rv_audit(_org, 'user', _actor, 'hubspot.disconnected', 'crm_connection', _conn::text, null, null, _request_id);
  return true;
end $$;

-- Job queue ------------------------------------------------------------------
create or replace function public.rv_enqueue_job(
  _org uuid, _kind text, _payload jsonb, _dedupe text, _run_after timestamptz, _max_attempts int, _created_by uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare _id uuid;
begin
  begin
    insert into private.revenue_jobs (organization_id, kind, payload, dedupe_key, run_after, max_attempts, created_by)
    values (_org, _kind, coalesce(_payload, '{}'::jsonb), _dedupe, coalesce(_run_after, now()), coalesce(_max_attempts, 5), _created_by)
    returning id into _id;
  exception when unique_violation then
    select j.id into _id from private.revenue_jobs j
     where j.organization_id = _org and j.dedupe_key = _dedupe and j.status in ('queued','running');
  end;
  return _id;
end $$;

create or replace function public.rv_claim_job(_worker text, _lease_seconds int, _kinds text[], _org uuid default null)
returns table (id uuid, organization_id uuid, kind text, payload jsonb, attempts int, max_attempts int, reclaimed boolean, created_by uuid)
language plpgsql security definer set search_path = '' as $$
declare _job private.revenue_jobs%rowtype;
begin
  update private.revenue_jobs j set status = 'dead', finished_at = now(), locked_by = null, lease_until = null,
         last_error = coalesce(j.last_error, 'lease expired after max attempts')
   where j.status = 'running' and j.lease_until < now() and j.attempts >= j.max_attempts;

  select * into _job from private.revenue_jobs j
   where ((j.status = 'queued' and j.run_after <= now()) or (j.status = 'running' and j.lease_until < now()))
     and (_kinds is null or j.kind = any (_kinds))
     and (_org is null or j.organization_id = _org)
   order by j.run_after, j.created_at
   for update skip locked limit 1;
  if not found then return; end if;

  update private.revenue_jobs j set status = 'running', locked_by = _worker,
         lease_until = now() + make_interval(secs => _lease_seconds), attempts = j.attempts + 1, updated_at = now()
   where j.id = _job.id;
  return query select _job.id, _job.organization_id, _job.kind, _job.payload, _job.attempts + 1, _job.max_attempts,
                      (_job.status = 'running'), _job.created_by;
end $$;

create or replace function public.rv_heartbeat_job(_id uuid, _worker text, _lease_seconds int, _progress jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare _n int;
begin
  update private.revenue_jobs set lease_until = now() + make_interval(secs => _lease_seconds),
         progress = coalesce(_progress, progress), updated_at = now()
   where id = _id and locked_by = _worker and status = 'running';
  get diagnostics _n = row_count;
  return _n = 1;
end $$;

create or replace function public.rv_finish_job(_id uuid, _worker text, _outcome text, _error text, _retry_at timestamptz)
returns text language plpgsql security definer set search_path = '' as $$
declare _job private.revenue_jobs%rowtype; _next text;
begin
  select * into _job from private.revenue_jobs where id = _id and locked_by = _worker and status = 'running' for update;
  if not found then return 'lost_lease'; end if;
  if _outcome = 'succeeded' then
    _next := 'succeeded';
  elsif _outcome = 'continue' then
    -- cooperative yield (time budget): back to the queue WITHOUT consuming an attempt
    update private.revenue_jobs set status = 'queued', locked_by = null, lease_until = null,
           attempts = greatest(_job.attempts - 1, 0), run_after = coalesce(_retry_at, now()), updated_at = now()
     where id = _id;
    return 'queued';
  elsif _outcome = 'retry' and _job.attempts < _job.max_attempts then
    _next := 'queued';
  elsif _outcome = 'retry' then
    _next := 'dead';
  else
    _next := 'failed';
  end if;
  update private.revenue_jobs set status = _next, locked_by = null, lease_until = null,
         run_after = case when _next = 'queued' then coalesce(_retry_at, now()) else run_after end,
         last_error = left(_error, 1000),
         finished_at = case when _next = 'queued' then null else now() end, updated_at = now()
   where id = _id;
  return _next;
end $$;

create or replace function public.rv_get_job(_org uuid, _id uuid)
returns table (id uuid, kind text, status text, attempts int, max_attempts int, progress jsonb, last_error text,
               created_at timestamptz, updated_at timestamptz, finished_at timestamptz)
language sql security definer set search_path = '' as $$
  select j.id, j.kind, j.status, j.attempts, j.max_attempts, j.progress, j.last_error, j.created_at, j.updated_at, j.finished_at
    from private.revenue_jobs j where j.id = _id and j.organization_id = _org
$$;

-- AI quota: reserve atomically before calling the model, settle afterwards ----
create or replace function public.rv_reserve_ai_usage(
  _org uuid, _user uuid, _feature text, _reserve_tokens int, _request_id text, _job uuid)
returns table (usage_id uuid, denied_reason text) language plpgsql security definer set search_path = '' as $$
declare _s public.revenue_settings%rowtype; _used bigint; _reqs int; _id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('rv_ai:' || _org::text, 0));
  -- a reservation that was never settled (function killed by the platform timeout) must not count forever
  update public.revenue_ai_usage set status = 'error', settled_at = now()
   where organization_id = _org and status = 'reserved' and created_at < now() - interval '10 minutes';
  select * into _s from public.revenue_settings where organization_id = _org;
  if not found then return query select null::uuid, 'not_configured'::text; return; end if;
  select coalesce(sum(case when u.status = 'reserved' then u.reserved_tokens
                           else coalesce(u.input_tokens, 0) + coalesce(u.output_tokens, 0) end), 0)
    into _used from public.revenue_ai_usage u
   where u.organization_id = _org and u.period_month = date_trunc('month', now())::date;
  if _used + _reserve_tokens > _s.ai_monthly_token_budget then
    return query select null::uuid, 'budget_exhausted'::text; return;
  end if;
  select count(*) into _reqs from public.revenue_ai_usage u
   where u.organization_id = _org and u.created_at > now() - interval '1 hour';
  if _reqs >= _s.ai_requests_per_hour then
    return query select null::uuid, 'rate_limited'::text; return;
  end if;
  insert into public.revenue_ai_usage (organization_id, user_id, feature, reserved_tokens, request_id, job_id)
  values (_org, _user, _feature, _reserve_tokens, _request_id, _job) returning id into _id;
  return query select _id, null::text;
end $$;

create or replace function public.rv_settle_ai_usage(
  _org uuid, _id uuid, _status text, _model text, _in int, _out int, _cached int)
returns numeric language plpgsql security definer set search_path = '' as $$
declare _rate public.revenue_pricing_rates%rowtype; _cost numeric;
begin
  select * into _rate from public.revenue_pricing_rates r where r.model = _model and r.effective_at <= now()
   order by r.effective_at desc limit 1;
  if found then
    _cost := (greatest(coalesce(_in,0) - coalesce(_cached,0), 0) * _rate.input_usd_per_mtok
              + coalesce(_cached,0) * coalesce(_rate.cached_input_usd_per_mtok, _rate.input_usd_per_mtok)
              + coalesce(_out,0) * _rate.output_usd_per_mtok) / 1000000.0;
  end if;
  update public.revenue_ai_usage set status = _status, model = _model, input_tokens = _in, output_tokens = _out,
         cached_tokens = _cached, estimated_cost_usd = _cost, pricing_version = _rate.version, settled_at = now()
   where id = _id and organization_id = _org;
  return _cost;
end $$;

-- Approval: compare-and-swap on (status, version, hash) + outbox job, one txn ---
create or replace function public.rv_approve_proposal(
  _org uuid, _proposal uuid, _version int, _hash text, _approver uuid, _request_id text)
returns table (result text, execution_id uuid, job_id uuid)
language plpgsql security definer set search_path = '' as $$
declare _p public.revenue_action_proposals%rowtype; _exec uuid; _job uuid; _key text;
begin
  if not exists (select 1 from public.organization_members m where m.organization_id = _org and m.user_id = _approver
                 and m.status = 'active' and m.role in ('admin','manager')) then
    return query select 'forbidden'::text, null::uuid, null::uuid; return;
  end if;
  select * into _p from public.revenue_action_proposals where id = _proposal and organization_id = _org for update;
  if not found then return query select 'not_found'::text, null::uuid, null::uuid; return; end if;
  if _p.status <> 'proposed' then
    -- double click / replay: report, never enqueue a second job
    select e.id into _exec from public.revenue_action_executions e
     where e.organization_id = _org and e.proposal_id = _proposal and e.proposal_version = _p.approved_version limit 1;
    return query select ('already_' || _p.status)::text, _exec, null::uuid; return;
  end if;
  if _p.version is distinct from _version or _p.payload_hash is distinct from _hash then
    return query select 'stale_version'::text, null::uuid, null::uuid; return;
  end if;
  if _p.expires_at <= now() then
    update public.revenue_action_proposals set status = 'expired' where id = _proposal;
    perform public.rv_audit(_org, 'system', null, 'action.expired', 'action_proposal', _proposal::text, null, null, _request_id);
    return query select 'expired'::text, null::uuid, null::uuid; return;
  end if;
  _key := _org::text || ':' || _proposal::text || ':' || _p.version::text;
  update public.revenue_action_proposals set status = 'approved', approved_by = _approver, approved_at = now(),
         approved_version = _p.version, approved_hash = _p.payload_hash where id = _proposal;
  insert into public.revenue_action_executions (organization_id, proposal_id, proposal_version, idempotency_key)
  values (_org, _proposal, _p.version, _key) returning id into _exec;
  _job := public.rv_enqueue_job(_org, 'execute_action',
            jsonb_build_object('execution_id', _exec, 'proposal_id', _proposal), 'action:' || _key, now(), 3, _approver);
  -- max_attempts = 3 on purpose: after a worker crash the job must be re-claimable so rv_begin_execution can
  -- turn the orphaned 'running' execution into needs_review. A re-claimed job can never write twice (CAS).
  perform public.rv_audit(_org, 'user', _approver, 'action.approved', 'action_proposal', _proposal::text,
            jsonb_build_object('status', 'proposed', 'version', _p.version),
            jsonb_build_object('status', 'approved', 'version', _p.version, 'payload_hash', _p.payload_hash, 'execution_id', _exec),
            _request_id);
  return query select 'approved'::text, _exec, _job;
end $$;

-- Execution CAS: queued -> running exactly once; a crashed 'running' row is NOT re-run.
create or replace function public.rv_begin_execution(_org uuid, _exec uuid)
returns table (result text, proposal_id uuid) language plpgsql security definer set search_path = '' as $$
declare _e public.revenue_action_executions%rowtype;
begin
  select * into _e from public.revenue_action_executions where id = _exec and organization_id = _org for update;
  if not found then return query select 'not_found'::text, null::uuid; return; end if;
  if _e.status = 'queued' then
    update public.revenue_action_executions set status = 'running', started_at = now() where id = _exec;
    update public.revenue_action_proposals set status = 'executing' where id = _e.proposal_id and organization_id = _org and status = 'approved';
    return query select 'started'::text, _e.proposal_id;
  elsif _e.status = 'running' then
    -- previous worker died mid-flight: outcome unknown, must be reconciled by a human/worker check
    update public.revenue_action_executions set status = 'needs_review', uncertain = true, finished_at = now(),
           error = 'worker interrupted during execution; remote outcome unknown' where id = _exec;
    update public.revenue_action_proposals set status = 'needs_review' where id = _e.proposal_id and organization_id = _org;
    return query select 'needs_review'::text, _e.proposal_id;
  else
    return query select ('already_' || _e.status)::text, _e.proposal_id;
  end if;
end $$;

create or replace function public.rv_finish_execution(
  _org uuid, _exec uuid, _status text, _external_id text, _uncertain boolean, _error text, _proposal_status text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare _e public.revenue_action_executions%rowtype; _pstatus text;
begin
  if _status not in ('succeeded','failed','needs_review','conflict') then raise exception 'bad status'; end if;
  select * into _e from public.revenue_action_executions where id = _exec and organization_id = _org for update;
  if not found then raise exception 'not_found'; end if;
  update public.revenue_action_executions set status = _status, external_result_id = _external_id,
         uncertain = coalesce(_uncertain, false), error = left(_error, 500), finished_at = now() where id = _exec;
  _pstatus := coalesce(_proposal_status, _status);
  if _pstatus not in ('succeeded','failed','needs_review','conflict','expired') then raise exception 'bad proposal status'; end if;
  update public.revenue_action_proposals set status = _pstatus,
         result = jsonb_build_object('external_result_id', _external_id, 'error', left(_error, 500))
   where id = _e.proposal_id and organization_id = _org;
  perform public.rv_audit(_org, 'system', null, 'action.' || _status, 'action_proposal', _e.proposal_id::text, null,
            jsonb_build_object('execution_id', _exec, 'external_result_id', _external_id, 'uncertain', coalesce(_uncertain, false)), null);
end $$;


-- Edit: bumps version + hash, voids any pending approval. Only proposed/approved-not-started.
create or replace function public.rv_edit_proposal(
  _org uuid, _proposal uuid, _base_version int, _payload jsonb, _hash text, _editor uuid, _request_id text)
returns table (result text, new_version int)
language plpgsql security definer set search_path = '' as $$
declare _p public.revenue_action_proposals%rowtype;
begin
  if not exists (select 1 from public.organization_members m where m.organization_id = _org and m.user_id = _editor
                 and m.status = 'active' and m.role in ('admin','manager','member')) then
    return query select 'forbidden'::text, null::int; return;
  end if;
  select * into _p from public.revenue_action_proposals where id = _proposal and organization_id = _org for update;
  if not found then return query select 'not_found'::text, null::int; return; end if;
  if _p.version is distinct from _base_version then return query select 'stale_version'::text, null::int; return; end if;
  if _p.status not in ('proposed','approved') then return query select ('not_editable_' || _p.status)::text, null::int; return; end if;
  if _p.status = 'approved' then
    update public.revenue_action_executions set status = 'failed', error = 'approval superseded by an edit', finished_at = now()
     where organization_id = _org and proposal_id = _proposal and status = 'queued';
    update private.revenue_jobs set status = 'dead', last_error = 'approval superseded by an edit', finished_at = now(), locked_by = null, lease_until = null
     where organization_id = _org and kind = 'execute_action' and status = 'queued' and payload->>'proposal_id' = _proposal::text;
  end if;
  update public.revenue_action_proposals set payload = _payload, payload_hash = _hash, version = _p.version + 1, status = 'proposed',
         approved_by = null, approved_at = null, approved_version = null, approved_hash = null
   where id = _proposal;
  perform public.rv_audit(_org, 'user', _editor, 'action.edited', 'action_proposal', _proposal::text,
            jsonb_build_object('version', _p.version, 'payload', _p.payload), jsonb_build_object('version', _p.version + 1, 'payload', _payload), _request_id);
  return query select 'edited'::text, _p.version + 1;
end $$;

create or replace function public.rv_reject_proposal(_org uuid, _proposal uuid, _actor uuid, _reason text, _request_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare _p public.revenue_action_proposals%rowtype;
begin
  if not exists (select 1 from public.organization_members m where m.organization_id = _org and m.user_id = _actor
                 and m.status = 'active' and m.role in ('admin','manager')) then return 'forbidden'; end if;
  select * into _p from public.revenue_action_proposals where id = _proposal and organization_id = _org for update;
  if not found then return 'not_found'; end if;
  if _p.status not in ('proposed','approved') then return 'not_rejectable_' || _p.status; end if;
  if _p.status = 'approved' then
    update public.revenue_action_executions set status = 'failed', error = 'rejected after approval', finished_at = now()
     where organization_id = _org and proposal_id = _proposal and status = 'queued';
    update private.revenue_jobs set status = 'dead', last_error = 'rejected after approval', finished_at = now(), locked_by = null, lease_until = null
     where organization_id = _org and kind = 'execute_action' and status = 'queued' and payload->>'proposal_id' = _proposal::text;
  end if;
  update public.revenue_action_proposals set status = 'rejected', rejected_by = _actor, result = jsonb_build_object('reason', left(_reason, 500)) where id = _proposal;
  perform public.rv_audit(_org, 'user', _actor, 'action.rejected', 'action_proposal', _proposal::text, null, jsonb_build_object('reason', left(_reason, 500)), _request_id);
  return 'rejected';
end $$;


-- Key rotation support: list rows still on an older key and rewrite them with a CAS on key_version.
create or replace function public.rv_list_credentials_for_rotation(_current_version text, _limit int)
returns table (connection_id uuid, organization_id uuid, access_token_enc text, refresh_token_enc text, key_version text)
language sql security definer set search_path = '' as $$
  select c.connection_id, c.organization_id, c.access_token_enc, c.refresh_token_enc, c.key_version
    from private.crm_credentials c where c.key_version <> _current_version order by c.updated_at limit _limit
$$;

create or replace function public.rv_rewrite_credentials(_conn uuid, _old_version text, _access_enc text, _refresh_enc text, _new_version text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare _n int;
begin
  update private.crm_credentials set access_token_enc = _access_enc, refresh_token_enc = _refresh_enc, key_version = _new_version, updated_at = now()
   where connection_id = _conn and key_version = _old_version and (refresh_lease_until is null or refresh_lease_until < now());
  get diagnostics _n = row_count;
  return _n = 1;
end $$;

-- The caller's OWN legacy flag. The legacy endpoints call this with the user's JWT + anon key, so the kill switch
-- does not depend on a service-role key being present in the environment. It only ever reveals the caller's own state.
create or replace function public.rv_my_legacy_outreach_allowed()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.rv_legacy_outreach_allowed((select auth.uid()))
$$;
revoke all on function public.rv_my_legacy_outreach_allowed() from public, anon;
grant execute on function public.rv_my_legacy_outreach_allowed() to authenticated, service_role;

-- Lock down: nothing above is callable from the browser.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in (
       'rv_ensure_user_org','rv_legacy_outreach_allowed','rv_audit','rv_create_oauth_attempt','rv_consume_oauth_attempt',
       'rv_activate_hubspot_connection','rv_get_credentials','rv_acquire_refresh_lease','rv_store_refreshed_credentials',
       'rv_release_refresh_lease','rv_mark_connection','rv_disconnect_connection','rv_enqueue_job','rv_claim_job',
       'rv_heartbeat_job','rv_finish_job','rv_get_job','rv_reserve_ai_usage','rv_settle_ai_usage',
       'rv_approve_proposal','rv_begin_execution','rv_finish_execution','rv_edit_proposal','rv_reject_proposal','rv_list_credentials_for_rotation','rv_rewrite_credentials')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
