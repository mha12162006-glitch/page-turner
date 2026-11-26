-- Stage 5: reconcile schema and enable friend-only RLS.
-- Run this once in Supabase > SQL Editor > New query before using Stage 5.
-- Safe to re-run: it only adds missing columns/tables and replaces the policies.

-- ---------------------------------------------------------------------------
-- 1. Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  is_public boolean not null default false
);

alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists is_public boolean not null default false;

-- ---------------------------------------------------------------------------
-- 2. Series
-- ---------------------------------------------------------------------------
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  cover_url text,
  format text not null default 'Manhwa',
  genres text[] not null default '{}',
  synopsis text,
  status text not null default 'want',
  excitement int not null default 0,
  priority boolean not null default false,
  source text,
  media text[] not null default '{}',
  tags text[] not null default '{}',
  warnings text,
  notes text,
  rating numeric(3,1),
  review text,
  position int not null default 0,
  anilist_id int,
  created_at timestamptz not null default now()
);

-- Old installs had a three-value format check; widen it for webtoons/comics.
alter table public.series
  drop constraint if exists series_format_check;
alter table public.series
  add constraint series_format_check
  check (format in ('Manhwa', 'Manga', 'Manhua', 'Webtoon', 'Comic'));

alter table public.series add column if not exists is_hidden boolean not null default false;
alter table public.series add column if not exists chapter int;
alter table public.series add column if not exists total_chapters int;
alter table public.series add column if not exists pub_status text;
alter table public.series add column if not exists read_url text;
alter table public.series add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_series_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists series_set_updated_at on public.series;
create trigger series_set_updated_at
  before update on public.series
  for each row execute function public.set_series_updated_at();

create index if not exists series_user_status_pos
  on public.series (user_id, status, position);

-- If old duplicate AniList rows exist this index can fail. The app still works
-- without it, but the no-repeats check is stronger with it.
do $$
begin
  create unique index if not exists series_user_anilist_uniq
    on public.series (user_id, anilist_id)
    where anilist_id is not null;
exception when unique_violation then
  raise notice 'series_user_anilist_uniq was not created because duplicate anilist_id rows exist.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Characters
-- ---------------------------------------------------------------------------
create table if not exists public.series_characters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  name text not null,
  image_url text,
  comment text,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists series_characters_user_series
  on public.series_characters (user_id, series_id, position);

-- ---------------------------------------------------------------------------
-- 4. Friendships and recommendations
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null default auth.uid() references auth.users(id) on delete cascade,
  addressee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.friendships add column if not exists requester uuid default auth.uid();
alter table public.friendships add column if not exists addressee uuid;
alter table public.friendships add column if not exists status text not null default 'pending';
alter table public.friendships add column if not exists created_at timestamptz not null default now();
alter table public.friendships alter column requester set default auth.uid();

-- Remove exact duplicate pairs before adding the unique index.
delete from public.friendships a
using public.friendships b
where a.ctid > b.ctid
  and least(a.requester, a.addressee) = least(b.requester, b.addressee)
  and greatest(a.requester, a.addressee) = greatest(b.requester, b.addressee);

create unique index if not exists friendships_pair_uniq
  on public.friendships (
    least(requester, addressee),
    greatest(requester, addressee)
  );

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  series_id uuid not null references public.series(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.recommendations add column if not exists from_user uuid default auth.uid();
alter table public.recommendations add column if not exists to_user uuid;
alter table public.recommendations add column if not exists series_id uuid;
alter table public.recommendations add column if not exists created_at timestamptz not null default now();
alter table public.recommendations alter column from_user set default auth.uid();

delete from public.recommendations a
using public.recommendations b
where a.ctid > b.ctid
  and a.to_user = b.to_user
  and a.series_id = b.series_id;

create unique index if not exists recommendations_to_series_uniq
  on public.recommendations (to_user, series_id);

-- ---------------------------------------------------------------------------
-- 5. Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.series enable row level security;
alter table public.series_characters enable row level security;
alter table public.friendships enable row level security;
alter table public.recommendations enable row level security;

-- Drop the old policies so an old permissive policy cannot bypass the hidden
-- flag or the friend checks below.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'series', 'series_characters', 'friendships', 'recommendations')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end;
$$;

-- Profiles: owners manage their own; friends and public-link visitors can read.
create policy "own profile" on public.profiles
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "friend profile" on public.profiles
  for select to authenticated
  using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester = auth.uid() and f.addressee = profiles.user_id)
          or (f.addressee = auth.uid() and f.requester = profiles.user_id)
        )
    )
  );

create policy "public profile" on public.profiles
  for select to anon, authenticated
  using (is_public);

-- Series: owners see everything; accepted friends see non-hidden rows; public
-- share links see non-hidden rows only.
create policy "own series" on public.series
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "friend series" on public.series
  for select to authenticated
  using (
    not is_hidden
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and (
          (f.requester = auth.uid() and f.addressee = series.user_id)
          or (f.addressee = auth.uid() and f.requester = series.user_id)
        )
    )
  );

create policy "public series" on public.series
  for select to anon, authenticated
  using (
    not is_hidden
    and exists (
      select 1 from public.profiles p
      where p.user_id = series.user_id and p.is_public
    )
  );

-- Characters follow the same visibility as their parent series.
create policy "own characters" on public.series_characters
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "friend characters" on public.series_characters
  for select to authenticated
  using (
    exists (
      select 1
      from public.series s
      join public.friendships f
        on f.status = 'accepted'
       and (
         (f.requester = auth.uid() and f.addressee = s.user_id)
         or (f.addressee = auth.uid() and f.requester = s.user_id)
       )
      where s.id = series_characters.series_id
        and s.user_id = series_characters.user_id
        and not s.is_hidden
    )
  );

create policy "public characters" on public.series_characters
  for select to anon, authenticated
  using (
    exists (
      select 1
      from public.series s
      join public.profiles p on p.user_id = s.user_id
      where s.id = series_characters.series_id
        and s.user_id = series_characters.user_id
        and not s.is_hidden
        and p.is_public
    )
  );

-- Friendships are only visible to the two people involved.
create policy "own friendships" on public.friendships
  for select to authenticated
  using (auth.uid() in (requester, addressee));

create policy "send friend request" on public.friendships
  for insert to authenticated
  with check (requester = auth.uid() and requester <> addressee);

create policy "answer friend request" on public.friendships
  for update to authenticated
  using (auth.uid() in (requester, addressee))
  with check (auth.uid() in (requester, addressee));

create policy "remove friendship" on public.friendships
  for delete to authenticated
  using (auth.uid() in (requester, addressee));

-- A recommendation is visible only while its series is visible to that user.
-- Hidden series therefore disappear from recommendation attribution too.
create policy "own recommendations" on public.recommendations
  for select to authenticated
  using (
    (to_user = auth.uid() or from_user = auth.uid())
    and exists (
      select 1 from public.series s
      where s.id = recommendations.series_id
    )
  );

create policy "send recommendation" on public.recommendations
  for insert to authenticated
  with check (from_user = auth.uid() and from_user <> to_user);

create policy "remove recommendation" on public.recommendations
  for delete to authenticated
  using (to_user = auth.uid() or from_user = auth.uid());

-- ---------------------------------------------------------------------------
-- 6. Grants and realtime
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.series to authenticated;
grant select, insert, update, delete on public.series_characters to authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.friendships to authenticated;
grant select, insert, update, delete on public.recommendations to authenticated;
grant select on public.series to anon;
grant select on public.series_characters to anon;
grant select on public.profiles to anon;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'series'
  ) then
    execute 'alter publication supabase_realtime add table public.series';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships'
  ) then
    execute 'alter publication supabase_realtime add table public.friendships';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'recommendations'
  ) then
    execute 'alter publication supabase_realtime add table public.recommendations';
  end if;
exception when undefined_object then
  null;
end;
$$;
