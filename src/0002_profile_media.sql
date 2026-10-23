-- k1llshawty.exe — аватары и обложки. Выполнить ОДИН раз в Supabase → SQL Editor.
alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists cover_path text;

-- Путь обязан лежать в папке самого пользователя: нельзя указать чужой файл
alter table public.profiles drop constraint if exists profiles_media_paths;
alter table public.profiles add constraint profiles_media_paths check (
  (avatar_path is null or avatar_path like id::text || '/%') and
  (cover_path is null or cover_path like id::text || '/%'));

grant update (username, display_name, bio, avatar_path, cover_path) on public.profiles to authenticated;

-- Приватное хранилище, только JPEG/PNG/WebP, файл до 2 МБ (клиент сжимает заранее)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-media', 'profile-media', false, 2097152, array['image/webp','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/webp','image/jpeg','image/png'];

drop policy if exists "pm read" on storage.objects;
drop policy if exists "pm insert own" on storage.objects;
drop policy if exists "pm update own" on storage.objects;
drop policy if exists "pm delete own" on storage.objects;
create policy "pm read" on storage.objects for select to authenticated using (bucket_id = 'profile-media');
create policy "pm insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pm update own" on storage.objects for update to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "pm delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-media' and (storage.foldername(name))[1] = auth.uid()::text);
