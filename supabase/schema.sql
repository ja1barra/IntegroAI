-- ============================================================
-- IntegroAI — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. User Profiles
--    Stores display name, initials, role, org — seeded from
--    auth.users.raw_user_meta_data on first sign-up.
create table if not exists public.user_profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null default 'User',
  initials   text not null default 'U',
  role       text not null default 'Strategist',
  org        text not null default 'My Company',
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy "Users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update
  using (auth.uid() = id);

-- Auto-create profile row after sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles (id, name, initials, role, org)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name',  split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'initials', upper(left(split_part(new.email, '@', 1), 2))),
    coalesce(new.raw_user_meta_data->>'role', 'Strategist'),
    coalesce(new.raw_user_meta_data->>'org',  'My Company')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- 2. User Settings
--    Persists agent on/pause states and UI tweaks (dark mode etc.)
create table if not exists public.user_settings (
  user_id      uuid primary key references auth.users on delete cascade,
  agent_states jsonb not null default '{"outbound":"running","demand":"running","success":"running","playbook-agent":"running"}',
  tweaks       jsonb not null default '{"darkMode":false,"accentColor":"orange","density":"default"}',
  updated_at   timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can read own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users can upsert own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);


-- 3. Demo account
--    Uncomment and run if you want a shared demo login.
--    You must first sign up demo@integroai.com via the app
--    (or Supabase Auth dashboard) with password: demo-integro-2026
-- insert into public.user_profiles (id, name, initials, role, org)
-- select id, 'Jay Rodriguez', 'JR', 'Strategist', 'Acme SaaS Co.'
-- from auth.users where email = 'demo@integroai.com'
-- on conflict do nothing;
