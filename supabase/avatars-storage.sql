-- ============================================================
-- IntegroAI — Avatar Storage
-- Run this in the Supabase SQL Editor (idempotent)
-- ============================================================
--
-- Profile photos are uploaded to the public "avatars" bucket under
-- <user_id>/avatar.<ext>, and the resulting public URL is saved to
-- auth.users.raw_user_meta_data.avatar_url (same place name/org/role
-- already live — see SettingsView's ProfileTab). RLS scopes writes to a
-- user's own folder; reads are public since avatars are shown in shared
-- UI (Team, sign-in) without an authenticated request.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true,
  5242880, -- 5MB, matches the client-side cap in ProfileTab
  array['image/png','image/jpeg','image/gif','image/webp','image/svg+xml']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatar images are publicly readable" on storage.objects;
create policy "avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "users can upload their own avatar" on storage.objects;
create policy "users can upload their own avatar"
  on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "users can update their own avatar" on storage.objects;
create policy "users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "users can delete their own avatar" on storage.objects;
create policy "users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
