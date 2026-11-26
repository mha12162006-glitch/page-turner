-- Stage 7: translator recommendations.
--
-- Safe to run before deploying the Stage 7 frontend: old versions simply do
-- not use this table. Re-running this file is safe because policies are
-- replaced and the unique index is created only when missing.

create table if not exists public.translator_recs (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  language text not null default 'English',
  type text not null default 'Official license'
    check (type in ('Official license', 'Fan translation')),
  link text not null,
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One entry per translator or group per series, ignoring case and spacing.
create unique index if not exists translator_recs_series_name_uniq
  on public.translator_recs (series_id, lower(btrim(name)));

create index if not exists translator_recs_user
  on public.translator_recs (user_id);

create or replace function public.set_translator_recs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists translator_recs_set_updated_at on public.translator_recs;
create trigger translator_recs_set_updated_at
  before update on public.translator_recs
  for each row execute function public.set_translator_recs_updated_at();

alter table public.translator_recs enable row level security;

drop policy if exists "own translator recs" on public.translator_recs;
drop policy if exists "friend translator recs" on public.translator_recs;

-- Owners manage entries on their own series.
create policy "own translator recs" on public.translator_recs
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.series s
      where s.id = translator_recs.series_id
        and s.user_id = auth.uid()
    )
  );

-- Accepted friends can read entries while the parent series is visible.
create policy "friend translator recs" on public.translator_recs
  for select to authenticated
  using (
    exists (
      select 1 from public.series s
      join public.friendships f
        on f.status = 'accepted'
       and (
         (f.requester = auth.uid() and f.addressee = s.user_id)
         or (f.addressee = auth.uid() and f.requester = s.user_id)
       )
      where s.id = translator_recs.series_id
        and s.user_id = translator_recs.user_id
        and not s.is_hidden
    )
  );

-- Public share links never read translator recommendations.
revoke all on public.translator_recs from anon;
grant select, insert, update, delete on public.translator_recs to authenticated;

-- Keep open drawers in sync when an entry is added, edited or removed.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'translator_recs'
  ) then
    execute 'alter publication supabase_realtime add table public.translator_recs';
  end if;
exception when undefined_object then
  null;
end;
$$;
