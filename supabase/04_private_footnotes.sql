-- Stage 9: footnotes are strictly private to their owner.
--
-- Run this AFTER the Stage 9 frontend is deployed. The old frontend still
-- writes is_shared = true, which the check constraint below would reject.
-- Safe to re-run: the update is idempotent and the policy/constraint are
-- dropped before they are recreated.

-- Existing shared footnotes become private, and new rows default to private.
update public.series_notes
   set is_shared = false
 where is_shared is distinct from false;

alter table public.series_notes
  alter column is_shared set default false;

alter table public.series_notes
  drop constraint if exists series_notes_private;

alter table public.series_notes
  add constraint series_notes_private check (is_shared = false);

-- No friend can read another user's footnote any more. The "own notes"
-- policy from 02_after_frontend_deploy.sql remains the only read path.
drop policy if exists "shared notes" on public.series_notes;
