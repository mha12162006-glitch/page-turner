-- Page Turner: run this whole file once in Supabase > SQL Editor > New query

create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  cover_url text,
  format text not null default 'Manhwa' check (format in ('Manhwa','Manga','Manhua')),
  genres text[] not null default '{}',
  synopsis text,
  status text not null default 'want' check (status in ('want','reading','done')),
  excitement int not null default 0 check (excitement between 0 and 5),
  priority boolean not null default false,
  source text,
  media text[] not null default '{}',
  tags text[] not null default '{}',
  warnings text,
  notes text,
  rating numeric(3,1) check (rating between 0 and 10),
  review text,
  position int not null default 0,
  anilist_id int,
  created_at timestamptz not null default now()
);
create index if not exists series_user_status_pos on public.series (user_id, status, position);

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  is_public boolean not null default false
);

alter table public.series enable row level security;
alter table public.profiles enable row level security;

-- Owners can do everything with their own rows
create policy "own series" on public.series for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own profile" on public.profiles for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Anyone (no login) can read a list once its owner has pressed "Share my list"
create policy "public profile" on public.profiles for select to anon, authenticated
  using (is_public);
create policy "public series" on public.series for select to anon, authenticated
  using (exists (select 1 from public.profiles p where p.user_id = series.user_id and p.is_public));

-- Real-time sync across devices
alter publication supabase_realtime add table public.series;
