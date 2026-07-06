-- ============================================================
-- IntegroAI — Outbound Sales Machine schema (Agent 01)
-- Additive migration. Run AFTER schema.sql in the Supabase SQL Editor.
-- Safe to re-run (idempotent).
-- ============================================================

-- Shared updated_at trigger ----------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 1. Prospects -----------------------------------------------
--    People the Outbound agent can reach out to. Synced from a
--    connected CRM (HubSpot/Apollo) or added manually / via CSV.
create table if not exists public.prospects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  first_name  text not null default '',
  last_name   text not null default '',
  email       text not null,
  title       text not null default '',
  company     text not null default '',
  website     text,
  source      text not null default 'manual',   -- hubspot | apollo | manual | csv
  external_id text,                              -- id in the source system
  status      text not null default 'new',       -- new | enrolled | contacted | replied | meeting | bounced | unsubscribed
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, email)
);

alter table public.prospects enable row level security;

drop policy if exists "own prospects" on public.prospects;
create policy "own prospects" on public.prospects for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists prospects_user_idx   on public.prospects (user_id);
create index if not exists prospects_status_idx on public.prospects (user_id, status);

drop trigger if exists prospects_updated_at on public.prospects;
create trigger prospects_updated_at before update on public.prospects
  for each row execute procedure public.set_updated_at();


-- 2. Sequences -----------------------------------------------
create table if not exists public.sequences (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  status     text not null default 'draft',   -- draft | active | paused
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sequences enable row level security;

drop policy if exists "own sequences" on public.sequences;
create policy "own sequences" on public.sequences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists sequences_user_idx on public.sequences (user_id);

drop trigger if exists sequences_updated_at on public.sequences;
create trigger sequences_updated_at before update on public.sequences
  for each row execute procedure public.set_updated_at();


-- 3. Sequence steps ------------------------------------------
create table if not exists public.sequence_steps (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  sequence_id uuid not null references public.sequences(id) on delete cascade,
  step_order  integer not null default 0,
  type        text not null default 'email',   -- email | linkedin | call
  delay_days  integer not null default 1,
  subject     text not null default '',
  body        text not null default ''
);

alter table public.sequence_steps enable row level security;

drop policy if exists "own sequence steps" on public.sequence_steps;
create policy "own sequence steps" on public.sequence_steps for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists sequence_steps_seq_idx on public.sequence_steps (sequence_id, step_order);


-- 4. Enrollments ---------------------------------------------
--    A prospect placed into a sequence.
create table if not exists public.enrollments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  sequence_id  uuid not null references public.sequences(id) on delete cascade,
  prospect_id  uuid not null references public.prospects(id) on delete cascade,
  current_step integer not null default 0,
  status       text not null default 'active', -- active | paused | completed | replied | bounced
  enrolled_at  timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (sequence_id, prospect_id)
);

alter table public.enrollments enable row level security;

drop policy if exists "own enrollments" on public.enrollments;
create policy "own enrollments" on public.enrollments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists enrollments_user_idx on public.enrollments (user_id);

drop trigger if exists enrollments_updated_at on public.enrollments;
create trigger enrollments_updated_at before update on public.enrollments
  for each row execute procedure public.set_updated_at();


-- 5. Messages ------------------------------------------------
--    An individual AI-generated (or manual) outbound touch.
--    Flows: draft -> approved -> sending -> sent | failed ; replied later.
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  prospect_id   uuid references public.prospects(id) on delete cascade,
  sequence_id   uuid references public.sequences(id) on delete set null,
  enrollment_id uuid references public.enrollments(id) on delete cascade,
  step_id       uuid references public.sequence_steps(id) on delete set null,
  channel       text not null default 'email',   -- email | linkedin | call
  subject       text not null default '',
  body          text not null default '',
  status        text not null default 'draft',   -- draft | approved | sending | sent | failed | replied
  generated_by  text not null default 'ai',       -- ai | manual
  mailbox       text,                              -- provider used to send (gmail, outreach, ...)
  provider_msg_id text,                            -- id returned by the sending provider
  error         text,
  sent_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table public.messages enable row level security;

drop policy if exists "own messages" on public.messages;
create policy "own messages" on public.messages for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists messages_user_status_idx on public.messages (user_id, status);
create index if not exists messages_prospect_idx    on public.messages (prospect_id);

drop trigger if exists messages_updated_at on public.messages;
create trigger messages_updated_at before update on public.messages
  for each row execute procedure public.set_updated_at();


-- 6. Agent runs ----------------------------------------------
--    Audit log of agent actions (generation batches, send batches, syncs).
create table if not exists public.agent_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  agent        text not null default 'outbound',
  kind         text not null,                    -- generate | send | sync
  status       text not null default 'running',  -- running | completed | failed
  item_count   integer not null default 0,
  meta         jsonb not null default '{}',
  error        text,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.agent_runs enable row level security;

drop policy if exists "own agent runs" on public.agent_runs;
create policy "own agent runs" on public.agent_runs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists agent_runs_user_idx on public.agent_runs (user_id, created_at desc);
