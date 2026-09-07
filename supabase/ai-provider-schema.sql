-- AI Provider Settings — "bring your own AI"
--
-- Lets each user connect their own AI provider (Anthropic, OpenAI, Google,
-- or any OpenAI-compatible endpoint) so the agent endpoints
-- (api/agent/generate.js, api/agent/generate-sequence.js) run generation on
-- the user's own account and billing instead of Integro's shared
-- ANTHROPIC_API_KEY. One row per user; row-level security means a user can
-- only ever see or edit their own settings, and only their own signed-in
-- session can read the key back (needed so the client can pre-fill the
-- "connected" state and so the API endpoints can look it up for that user).
--
-- Run this after schema.sql.

create table if not exists public.ai_provider_settings (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  provider   text not null check (provider in ('anthropic', 'openai', 'google', 'custom')),
  api_key    text not null,
  base_url   text,
  model      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_provider_settings enable row level security;

create policy "Users can manage own AI provider settings"
  on public.ai_provider_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
