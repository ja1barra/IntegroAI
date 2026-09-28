// PGlite (real Postgres, in-process) harness that mimics the Supabase pieces
// the migrations depend on: auth schema, auth.uid(), and the anon /
// authenticated / service_role roles with Supabase's default privileges.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const BASELINE_FILES = ['schema.sql', 'outbound-schema.sql', 'playbooks-schema.sql', 'ai-provider-schema.sql']

export async function newDb() {
  const db = new PGlite()
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    -- Supabase grants ALL on new public objects to these roles by default
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  `)
  return db
}

export async function applyBaseline(db) {
  for (const f of BASELINE_FILES) {
    await db.exec(readFileSync(join(root, 'supabase', f), 'utf8'))
  }
}

export function migrationFiles() {
  const dir = join(root, 'supabase', 'migrations')
  return readdirSync(dir).filter(f => f.endsWith('.sql')).sort().map(f => ({ name: f, sql: readFileSync(join(dir, f), 'utf8') }))
}

export async function applyMigrations(db, { only } = {}) {
  for (const m of migrationFiles()) {
    if (only && !only.includes(m.name)) continue
    await db.exec(m.sql)
  }
}

export async function seedUser(db, email, org = 'Acme') {
  const r = await db.query(`insert into auth.users (email) values ($1) returning id`, [email])
  const id = r.rows[0].id
  await db.query(`insert into public.user_profiles (id, name, initials, role, org) values ($1, $2, 'XX', 'Strategist', $3) on conflict (id) do update set org = excluded.org`, [id, email.split('@')[0], org])
  return id
}

// Run `fn` as an authenticated end user (RLS applies), then restore superuser.
export async function asUser(db, userId, fn) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false)`)
  try { return await fn() } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false)`) }
}

export async function asService(db, fn) {
  await db.exec(`set role service_role`)
  try { return await fn() } finally { await db.exec(`reset role`) }
}
