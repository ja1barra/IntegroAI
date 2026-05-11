import https from 'https'
import { writeFileSync, existsSync } from 'fs'

const PROJECT_REF = 'pjptveelaqivsmarzbii'
const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`
const [,, ANON_KEY, SERVICE_KEY] = process.argv

if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Usage: node run-schema.mjs <anon-key> <service-role-key>')
  console.error('Find both at: Supabase dashboard → Settings → API')
  process.exit(1)
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve({ status: res.statusCode, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

// Each statement separately to avoid transaction issues
const statements = [
  // user_profiles table
  `create table if not exists public.user_profiles (
    id uuid primary key references auth.users on delete cascade,
    name text not null default 'User',
    initials text not null default 'U',
    role text not null default 'Strategist',
    org text not null default 'My Company',
    created_at timestamptz not null default now()
  )`,

  `alter table public.user_profiles enable row level security`,

  `do $$ begin
    if not exists (select 1 from pg_policies where tablename='user_profiles' and policyname='Users can read own profile') then
      create policy "Users can read own profile" on public.user_profiles for select using (auth.uid() = id);
    end if;
  end $$`,

  `do $$ begin
    if not exists (select 1 from pg_policies where tablename='user_profiles' and policyname='Users can update own profile') then
      create policy "Users can update own profile" on public.user_profiles for update using (auth.uid() = id);
    end if;
  end $$`,

  // user_settings table
  `create table if not exists public.user_settings (
    user_id uuid primary key references auth.users on delete cascade,
    agent_states jsonb not null default '{"outbound":"running","demand":"running","success":"running","playbook-agent":"running"}',
    tweaks jsonb not null default '{"darkMode":false,"accentColor":"orange","density":"default"}',
    updated_at timestamptz not null default now()
  )`,

  `alter table public.user_settings enable row level security`,

  `do $$ begin
    if not exists (select 1 from pg_policies where tablename='user_settings' and policyname='Users can read own settings') then
      create policy "Users can read own settings" on public.user_settings for select using (auth.uid() = user_id);
    end if;
  end $$`,

  `do $$ begin
    if not exists (select 1 from pg_policies where tablename='user_settings' and policyname='Users can upsert own settings') then
      create policy "Users can upsert own settings" on public.user_settings for insert with check (auth.uid() = user_id);
    end if;
  end $$`,

  `do $$ begin
    if not exists (select 1 from pg_policies where tablename='user_settings' and policyname='Users can update own settings') then
      create policy "Users can update own settings" on public.user_settings for update using (auth.uid() = user_id);
    end if;
  end $$`,

  // trigger function
  `create or replace function public.handle_new_user()
  returns trigger language plpgsql security definer set search_path = public as $$
  begin
    insert into public.user_profiles (id, name, initials, role, org)
    values (
      new.id,
      coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
      coalesce(new.raw_user_meta_data->>'initials', upper(left(split_part(new.email, '@', 1), 2))),
      coalesce(new.raw_user_meta_data->>'role', 'Strategist'),
      coalesce(new.raw_user_meta_data->>'org', 'My Company')
    )
    on conflict (id) do nothing;
    return new;
  end;
  $$`,

  `drop trigger if exists on_auth_user_created on auth.users`,

  `create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user()`,
]

async function execSQL(query) {
  const body = JSON.stringify({ query })
  const opts = {
    hostname: 'api.supabase.com',
    path: `/v1/projects/${PROJECT_REF}/database/query`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Length': Buffer.byteLength(body),
    }
  }
  const res = await request(opts, body)
  return res
}

async function main() {
  console.log('🔗 Running schema against Supabase...\n')

  for (const stmt of statements) {
    const preview = stmt.trim().split('\n')[0].slice(0, 60)
    const res = await execSQL(stmt)
    if (res.status === 200 || res.status === 201) {
      console.log(`  ✅ ${preview}`)
    } else {
      const err = JSON.parse(res.body || '{}')
      // Ignore "already exists" type errors
      if (err?.message?.includes('already exists') || err?.code === '42710' || err?.code === '42P07') {
        console.log(`  ⚠️  Already exists — skipping: ${preview}`)
      } else {
        console.log(`  ❌ ${preview}`)
        console.log(`     ${res.status}: ${res.body?.slice(0, 150)}`)
      }
    }
  }

  // Write .env.local
  const envPath = './integro-ai/.env.local'
  if (!existsSync(envPath)) {
    writeFileSync(envPath, `VITE_SUPABASE_URL=${PROJECT_URL}\nVITE_SUPABASE_ANON_KEY=${ANON_KEY}\n`)
    console.log('\n✅ integro-ai/.env.local created')
  } else {
    console.log('\nℹ️  .env.local already exists')
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Done! Start the app:

  cd integro-ai && npm run dev
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
