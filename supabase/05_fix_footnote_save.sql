-- Stage 11: reliable, strictly private footnote saves.
-- Run in Supabase SQL Editor after 02 and 04. Safe to re-run.
--
-- Why: upsert(onConflict: "series_id") needs a UNIQUE/PRIMARY KEY on that
-- column. Because 02 uses "create table if not exists", a pre-existing
-- series_notes table can keep an older shape without that constraint, and
-- PostgREST then rejects every note write with 42P10 ("no unique or exclusion
-- constraint matching the ON CONFLICT specification"). The frontend now uses
-- an owner-scoped SELECT followed by UPDATE or INSERT, so it no longer depends
-- on the conflict target; these statements make the database match as well.

-- 1. Guarantee one note per series, whatever shape the table currently has.
do $$
begin
  if not exists (
    select 1
    from pg_index i
    join pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
    where i.indrelid = 'public.series_notes'::regclass
      and i.indisunique
      and a.attname = 'series_id'
      and array_length(i.indkey, 1) = 1
  ) then
    alter table public.series_notes
      add constraint series_notes_series_id_key unique (series_id);
  end if;
end $$;

-- 2. Private by default, private on every row.
alter table public.series_notes
  add column if not exists is_shared boolean not null default false;
alter table public.series_notes
  alter column is_shared set default false;
update public.series_notes
   set is_shared = false
 where is_shared is distinct from false;
alter table public.series_notes
  drop constraint if exists series_notes_private;
alter table public.series_notes
  add constraint series_notes_private check (is_shared = false);

-- 3. Only the owner can read or write a footnote. No friend, anon or public
--    policy exists for this table.
alter table public.series_notes enable row level security;
drop policy if exists "shared notes" on public.series_notes;
drop policy if exists "public notes" on public.series_notes;
drop policy if exists "own notes" on public.series_notes;
create policy "own notes" on public.series_notes
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.series_notes from anon;
grant select, insert, update, delete on public.series_notes to authenticated;
