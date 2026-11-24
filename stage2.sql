-- Stage 2: run this once in Supabase > SQL Editor > New query
-- Safe to run on the existing database. This creates the table the app was
-- already trying to write to, so characters can save again.

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

alter table public.series_characters enable row level security;

drop policy if exists "own characters" on public.series_characters;
create policy "own characters" on public.series_characters for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public characters" on public.series_characters;
create policy "public characters" on public.series_characters for select to anon, authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.user_id = series_characters.user_id and p.is_public
    )
  );
