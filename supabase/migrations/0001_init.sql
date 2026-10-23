-- k1llshawty.exe — начальная схема. Выполнить в Supabase → SQL Editor.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 200),
  created_at timestamptz not null default now()
);

create table public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);

create table public.register_attempts (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index on public.register_attempts (ip_hash, created_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  direct_key text not null unique,            -- "меньший_uuid:больший_uuid": одна пара = один диалог
  created_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index on public.conversation_members (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at desc);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index on public.posts (created_at desc);
create index on public.posts (author_id, created_at desc);

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  primary key (post_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
create index on public.comments (post_id, created_at);

-- ───── Функции ─────
create function public.is_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from conversation_members where conversation_id = cid and user_id = auth.uid()) $$;

-- Вход по username: возвращает внутренний email для signInWithPassword.
create function public.resolve_login(p_username text) returns text
language sql stable security definer set search_path = public, auth as
$$ select u.email::text from profiles p join auth.users u on u.id = p.id where p.username = lower(p_username) $$;

-- Открыть существующий диалог или создать единственный для пары.
create function public.start_direct_chat(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); k text; cid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if other = me or not exists (select 1 from profiles where id = other) then raise exception 'invalid user'; end if;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  insert into conversations (direct_key) values (k) on conflict (direct_key) do nothing returning id into cid;
  if cid is null then select id into cid from conversations where direct_key = k; 
  else insert into conversation_members (conversation_id, user_id) values (cid, me), (cid, other); end if;
  return cid;
end $$;

-- ───── RLS ─────
alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;          -- политик нет: клиентам недоступно
alter table public.register_attempts enable row level security;     -- политик нет
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.comments enable row level security;

create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "conv read" on public.conversations for select to authenticated using (public.is_member(id));
create policy "members read" on public.conversation_members for select to authenticated using (public.is_member(conversation_id));
create policy "members update own" on public.conversation_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "msg read" on public.messages for select to authenticated using (public.is_member(conversation_id));
create policy "msg send" on public.messages for insert to authenticated with check (sender_id = auth.uid() and public.is_member(conversation_id));

create policy "posts read" on public.posts for select to authenticated using (true);
create policy "posts insert" on public.posts for insert to authenticated with check (author_id = auth.uid());
create policy "posts delete own" on public.posts for delete to authenticated using (author_id = auth.uid());

create policy "likes read" on public.post_likes for select to authenticated using (true);
create policy "likes insert" on public.post_likes for insert to authenticated with check (user_id = auth.uid());
create policy "likes delete own" on public.post_likes for delete to authenticated using (user_id = auth.uid());

create policy "comments read" on public.comments for select to authenticated using (true);
create policy "comments insert" on public.comments for insert to authenticated with check (author_id = auth.uid());
create policy "comments delete own" on public.comments for delete to authenticated using (author_id = auth.uid());

-- ───── Права (таблицы-секреты закрыты полностью) ─────
revoke all on public.invite_codes, public.register_attempts from anon, authenticated;
revoke all on all tables in schema public from anon;
revoke update on public.profiles from authenticated;
grant update (username, display_name, bio) on public.profiles to authenticated;
revoke update on public.conversation_members from authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
revoke insert, update, delete on public.conversations, public.conversation_members from authenticated;
revoke execute on all functions in schema public from public, anon;
grant execute on function public.resolve_login(text) to anon, authenticated;
grant execute on function public.start_direct_chat(uuid), public.is_member(uuid) to authenticated;

alter publication supabase_realtime add table public.messages;
