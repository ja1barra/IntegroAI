#!/usr/bin/env node
// IntegroAI — one-command setup
// Usage: node setup.mjs <anon-key> <service-role-key>
// Get both keys from: Supabase dashboard → Settings → API

import { createClient } from '@supabase/supabase-js'
import { writeFileSync, existsSync } from 'fs'

const PROJECT_URL = 'https://pjptveelaqivsmarzbii.supabase.co'
const [,, anonKey, serviceRoleKey] = process.argv

if (!anonKey || !serviceRoleKey) {
  console.error(`
Usage: node setup.mjs <anon-key> <service-role-key>

Find both keys in your Supabase dashboard:
  Settings → API → Project API keys

  anon/public   → use as <anon-key>
  service_role  → use as <service-role-key>
`)
  process.exit(1)
}

const supabase = createClient(PROJECT_URL, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const schema = `
-- user_profiles
create table if not exists public.user_profiles (
  id         uuid primary key references auth.users on delete cascade,
  name       text not null default 'User',
  initials   text not null default 'U',
  role       text not null default 'Strategist',
  org        text not null default 'My Company',
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='user_profiles' and policyname='Users can read own profile'
  ) then
    create policy "Users can read own profile"
      on public.user_profiles for select using (auth.uid() = id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='user_profiles' and policyname='Users can update own profile'
  ) then
    create policy "Users can update own profile"
      on public.user_profiles for update using (auth.uid() = id);
  end if;
end $$;

-- user_settings
create table if not exists public.user_settings (
  user_id      uuid primary key references auth.users on delete cascade,
  agent_states jsonb not null default '{"outbound":"running","demand":"running","success":"running","playbook-agent":"running"}',
  tweaks       jsonb not null default '{"darkMode":false,"accentColor":"orange","density":"default"}',
  updated_at   timestamptz not null default now()
);

alter table public.user_settings enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='user_settings' and policyname='Users can read own settings'
  ) then
    create policy "Users can read own settings"
      on public.user_settings for select using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='user_settings' and policyname='Users can upsert own settings'
  ) then
    create policy "Users can upsert own settings"
      on public.user_settings for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='user_settings' and policyname='Users can update own settings'
  ) then
    create policy "Users can update own settings"
      on public.user_settings for update using (auth.uid() = user_id);
  end if;
end $$;

-- auto-create profile on sign-up
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
`

async function run() {
  console.log('🔗 Connecting to Supabase project...')

  // Run schema via rpc (requires service_role)
  const { error } = await supabase.rpc('exec_sql', { sql: schema }).catch(() => ({ error: { message: 'rpc not available' } }))

  if (error) {
    // Fallback: run each statement via REST
    console.log('   Running schema via SQL API...')
    const res = await fetch(`${PROJECT_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ sql: schema })
    })

    if (!res.ok) {
      // Final fallback: Supabase Management API
      console.log('   Trying Management API...')
      const mgmt = await fetch(`https://api.supabase.com/v1/projects/pjptveelaqivsmarzbii/database/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({ query: schema })
      })
      const mgmtData = await mgmt.json()
      if (!mgmt.ok) {
        console.error('❌ Could not run schema automatically. Please run supabase/schema.sql manually in the SQL Editor.')
        console.error('   Error:', JSON.stringify(mgmtData))
      } else {
        console.log('✅ Schema created via Management API')
      }
    } else {
      console.log('✅ Schema created')
    }
  } else {
    console.log('✅ Schema created')
  }

  // Write .env.local
  const envPath = './integro-ai/.env.local'
  if (existsSync(envPath)) {
    console.log('ℹ️  .env.local already exists — skipping (delete it to regenerate)')
  } else {
    writeFileSync(envPath, `VITE_SUPABASE_URL=${PROJECT_URL}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`)
    console.log('✅ integro-ai/.env.local created')
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Setup complete!

Next steps:
  cd integro-ai
  npm run dev

Then open http://localhost:5173 and create your account.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`)
}

run().catch(err => { console.error('Setup failed:', err.message); process.exit(1) })
