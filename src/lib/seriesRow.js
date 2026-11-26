import { FORMATS, STATUS } from "./util";

/**
 * Only columns that exist on public.series are sent to Supabase. This keeps
 * internal lookup metadata (_source_id, _ageRating) and any accidental form
 * fields from turning an otherwise valid add into an opaque database error.
 */
export const SERIES_WRITE_FIELDS = Object.freeze([
  "user_id",
  "title",
  "cover_url",
  "format",
  "genres",
  "synopsis",
  "status",
  "excitement",
  "priority",
  "source",
  "media",
  "tags",
  "warnings",
  "rating",
  "review",
  "position",
  "anilist_id",
  "pub_status",
  "chapter",
  "total_chapters",
  "read_url",
  "is_hidden"
]);

const STATUS_KEYS = STATUS.map(([key]) => key);

const clean = (value) => String(value ?? "").trim();
const nullable = (value) => clean(value) || null;
const array = (value) =>
  (Array.isArray(value) ? value : [])
    .map(clean)
    .filter(Boolean);

const whole = (value, fallback = null, min = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
};

export const anilistIdOrNull = (value) => {
  const raw = clean(value);
  if (!raw || raw === "0") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

/**
 * Normalize every series insert/update so MangaUpdates, Kitsu, WEBTOON and
 * manual entries all satisfy the same schema constraints as AniList rows.
 */
export function seriesWritePayload(row = {}, userId, extra = {}) {
  const r = { ...row, ...extra };
  const status = clean(r.status);
  const format = clean(r.format);
  const rating = Number(r.rating);
  const excitement = whole(r.excitement, 0);
  return {
    user_id: clean(userId || r.user_id) || null,
    title: clean(r.title),
    cover_url: nullable(r.cover_url),
    format: FORMATS.includes(format) ? format : "Manhwa",
    genres: array(r.genres),
    synopsis: nullable(r.synopsis),
    status: STATUS_KEYS.includes(status) ? status : "want",
    excitement: Math.min(5, Math.max(0, excitement ?? 0)),
    priority: !!r.priority,
    source: nullable(r.source),
    media: array(r.media),
    tags: array(r.tags),
    warnings: clean(r.warnings),
    rating:
      Number.isFinite(rating) && rating >= 0 && rating <= 10 ? rating : null,
    review: nullable(r.review),
    position: whole(r.position, 0),
    anilist_id: anilistIdOrNull(r.anilist_id),
    pub_status: clean(r.pub_status),
    chapter: whole(r.chapter, 0),
    total_chapters: whole(r.total_chapters, null, 1),
    read_url: nullable(r.read_url),
    is_hidden: !!r.is_hidden
  };
}

/** Never hide a rejected insert behind a generic toast. */
export function saveErrorMessage(error, updating = false) {
  console.error(error);
  const message = String(error?.message ?? error ?? "Unknown error");
  return updating
    ? `Could not save those changes. Please try again: ${message}`
    : `Could not add this series, please try again: ${message}`;
}
