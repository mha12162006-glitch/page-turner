-- Run once in Supabase > SQL Editor > New query.
-- The original schema.sql created series_format_check with only three values.
-- Drop that narrow check and add one that accepts webtoons and western comics.

alter table public.series
  drop constraint if exists series_format_check;

alter table public.series
  add constraint series_format_check
  check (format in ('Manhwa', 'Manga', 'Manhua', 'Webtoon', 'Comic'));

-- If your production column is named `type` instead of `format`, use this pair:
-- alter table public.series drop constraint if exists series_type_check;
-- alter table public.series add constraint series_type_check
--   check (type in ('Manhwa', 'Manga', 'Manhua', 'Webtoon', 'Comic'));
