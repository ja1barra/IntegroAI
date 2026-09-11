-- ============================================================
-- IntegroAI — White Label Settings
-- Run this in the Supabase SQL Editor (idempotent)
-- ============================================================
--
-- Branding (logo/favicon URLs, colors, typography, custom domain,
-- "Powered by" badge) is currently scoped per-user, same as
-- user_settings — this app doesn't yet have a separate
-- workspace/organization table, and each account is its own
-- workspace today. See SettingsView's WhiteLabelTab.

create table if not exists public.white_label_settings (
  user_id           uuid primary key references auth.users on delete cascade,
  light_logo_url    text,
  dark_logo_url     text,
  favicon_url       text,
  primary_color     text not null default '#D4501A',
  ink_color         text not null default '#1A1714',
  font_choice       text not null default 'sans' check (font_choice in ('sans', 'inter', 'custom')),
  custom_font_name  text,
  custom_domain     text,
  domain_status     text not null default 'unset' check (domain_status in ('unset', 'pending', 'verified')),
  powered_by_badge  boolean not null default true,
  updated_at        timestamptz not null default now()
);

alter table public.white_label_settings enable row level security;

drop policy if exists "own white label settings" on public.white_label_settings;
create policy "own white label settings"
  on public.white_label_settings for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Logo/favicon images live in the public "branding" bucket under
-- <user_id>/<slot>.<ext>, mirroring the avatars bucket pattern.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding', 'branding', true,
  2097152, -- 2MB, matches the client-side cap in WhiteLabelTab
  array['image/png','image/jpeg','image/gif','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "branding images are publicly readable" on storage.objects;
create policy "branding images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'branding');

drop policy if exists "users can upload their own branding assets" on storage.objects;
create policy "users can upload their own branding assets"
  on storage.objects for insert
  with check (bucket_id = 'branding' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "users can update their own branding assets" on storage.objects;
create policy "users can update their own branding assets"
  on storage.objects for update
  using (bucket_id = 'branding' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "users can delete their own branding assets" on storage.objects;
create policy "users can delete their own branding assets"
  on storage.objects for delete
  using (bucket_id = 'branding' and auth.uid()::text = (storage.foldername(name))[1]);
