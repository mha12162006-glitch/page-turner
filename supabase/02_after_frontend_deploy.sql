-- Stage 6: move footnotes from public.series.notes to public.series_notes.
--
-- IMPORTANT: Run this only AFTER the Stage 6 frontend is deployed.
-- The last step drops public.series.notes, so the old frontend would break if
-- this runs first.
--
-- Safe to re-run: the table is created only when missing, the old column is
-- copied only when it still exists, and the policies are replaced.

-- ---------------------------------------------------------------------------
-- 1. Footnote table
-- ---------------------------------------------------------------------------
create table if not exists public.series_notes (
  series_id uuid primary key references public.series(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  note text not null default '',
  is_shared boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists series_notes_user
  on public.series_notes (user_id);

create or replace function public.set_series_notes_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists series_notes_set_updated_at on public.series_notes;
create trigger series_notes_set_updated_at
  before update on public.series_notes
  for each row execute function public.set_series_notes_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Row-level security
-- ---------------------------------------------------------------------------
alter table public.series_notes enable row level security;

drop policy if exists "own notes" on public.series_notes;
drop policy if exists "shared notes" on public.series_notes;

-- The owner can read and write their own footnote, including a private one.
create policy "own notes" on public.series_notes
  for all to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.series s
      where s.id = series_notes.series_id
        and s.user_id = auth.uid()
    )
  );

-- A friend can read a footnote only when it is shared, the parent series is
-- visible to them, and that series is not hidden.
create policy "shared notes" on public.series_notes
  for select to authenticated
  using (
    is_shared
    and exists (
      select 1
      from public.series s
      join public.friendships f
        on f.status = 'accepted'
       and (
         (f.requester = auth.uid() and f.addressee = s.user_id)
         or (f.addressee = auth.uid() and f.requester = s.user_id)
       )
      where s.id = series_notes.series_id
        and s.user_id = series_notes.user_id
        and not s.is_hidden
    )
  );

-- No anon policy: the public share link never reads footnotes.
revoke all on public.series_notes from anon;
grant select, insert, update, delete on public.series_notes to authenticated;

-- Realtime keeps a friend's open page in sync when sharing is changed.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'series_notes'
  ) then
    execute 'alter publication supabase_realtime add table public.series_notes';
  end if;
exception when undefined_object then
  null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Move old footnotes, then remove the old column
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'series'
      and column_name = 'notes'
  ) then
    execute $mig$
      insert into public.series_notes (series_id, user_id, note, is_shared)
      select id, user_id, coalesce(notes, ''), true
      from public.series
      where notes is not null and btrim(notes) <> ''
      on conflict (series_id) do nothing
    $mig$;

    execute 'alter table public.series drop column notes';
  end if;
end;
$$;
