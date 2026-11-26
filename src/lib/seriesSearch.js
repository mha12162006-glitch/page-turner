import { searchAniList, cleanSyn } from "./anilist";
import { mapAutoFields } from "./autoTags";
import { joinTags, splitTags } from "./tags";
import { joinWarnings } from "./warnings";
import { detectFormat, norm } from "./util";

/**
 * Title search across three free sources. AniList stays first so existing
 * anilist_id links keep working; MangaUpdates and Kitsu cover Western comics
 * and webtoons that AniList excludes by country of origin. Every failure is
 * isolated so one unavailable source never blocks the others.
 */

const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];
const text = (value) => String(value ?? "").trim();

const genreNames = (value) =>
  asArray(value)
    .map((item) => {
      if (typeof item === "string") return item;
      return text(item?.genre ?? item?.category ?? item?.name ?? item?.title);
    })
    .filter(Boolean);

const categoryNames = (value) =>
  asArray(value)
    .map((item) => {
      if (typeof item === "string") return item;
      const a = item?.attributes || {};
      return text(
        a.title ?? a.name ?? item?.category ?? item?.title ?? item?.name
      );
    })
    .filter(Boolean);

const pubStatus = (value) => {
  const s = text(value).toLowerCase();
  if (/finish|complete|ended/.test(s)) return "Completed";
  if (/current|ongoing|publish|releas/.test(s)) return "Ongoing";
  if (/upcoming|not[ _-]?yet/.test(s)) return "Not yet released";
  if (/hiatus|hold/.test(s)) return "On hiatus";
  if (/cancel|discontinu/.test(s)) return "Discontinued";
  return "";
};

const chapterCount = (value) => {
  const n = Number(text(value).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
};

const cleanDescription = (value) =>
  cleanSyn(String(value || "").replace(/\[\/?[^\]]+\]/g, " "));

/**
 * Map every source into the same three chip fields. Both ranked tags and
 * plain category names are accepted; synopsis and Kitsu age ratings add
 * keyword matches. Only curated built-in labels are returned.
 */
function standard({
  title,
  cover_url,
  synopsis,
  pub_status,
  genres,
  categories = [],
  total_chapters,
  anilist_id = null,
  format = "",
  source_id = null,
  type,
  subtype,
  country,
  labels = [],
  ageRating = "",
  warningTags = null,
  isAdult = false,
  custom = {}
}) {
  const names = [
    ...genreNames(genres),
    ...categoryNames(categories),
    ...categoryNames(labels)
  ];
  const clean = cleanDescription(synopsis);
  const mapped = mapAutoFields({
    labels: names,
    tags: warningTags || names.map((name) => ({ name, rank: 80 })),
    genres: names,
    synopsis: clean,
    ageRating: text(ageRating),
    isAdult,
    custom
  });
  return {
    anilist_id,
    title: text(title),
    cover_url: text(cover_url),
    format: text(format) || detectFormat({ type, subtype, country, labels: names }),
    pub_status: pubStatus(pub_status),
    genres: mapped.genres,
    tags: mapped.tags,
    warnings: mapped.warnings,
    synopsis: clean,
    total_chapters: chapterCount(total_chapters),
    // Internal metadata only; the drawer never copies these into a saved row.
    _source_id: source_id == null ? null : String(source_id),
    _ageRating: text(ageRating)
  };
}

const unionChips = (a, b) =>
  splitTags(joinTags([...splitTags(a), ...splitTags(b)]));

/** Fill scalar fields when blank, but combine all auto-detected chip fields. */
function fillFrom(row, extra) {
  const out = { ...row };
  if (!text(out.title) && text(extra?.title)) out.title = extra.title;
  if (!text(out.cover_url) && text(extra?.cover_url)) {
    out.cover_url = extra.cover_url;
  }
  if (!text(out.synopsis) && text(extra?.synopsis)) out.synopsis = extra.synopsis;
  if (!text(out.pub_status) && text(extra?.pub_status)) {
    out.pub_status = extra.pub_status;
  }
  if (!text(out.format) && text(extra?.format)) out.format = extra.format;
  out.genres = unionChips(out.genres, extra?.genres);
  out.tags = unionChips(out.tags, extra?.tags);
  out.warnings = joinWarnings([out.warnings, extra?.warnings]);
  if (out.total_chapters == null && extra?.total_chapters != null) {
    out.total_chapters = extra.total_chapters;
  }
  return out;
}

async function jsonGet(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

export async function searchMangaUpdates(query, custom = {}) {
  const data = await jsonGet(
    "https://api.mangaupdates.com/v1/series/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ search: query, perpage: 10 })
    }
  );
  return asArray(data?.results)
    .map((entry) => {
      const r = entry?.record || entry || {};
      const labels = [
        ...genreNames(r.genres),
        ...categoryNames(r.categories)
      ];
      return standard({
        title: r.title,
        cover_url: r.image?.url?.original || r.image?.url?.thumbnail,
        synopsis: r.description,
        pub_status: r.status,
        genres: labels,
        categories: r.categories,
        total_chapters: r.latest_chapter,
        type: r.type,
        country: r.country ?? r.country_code,
        labels,
        source_id: r.series_id ?? r.id,
        custom
      });
    })
    .filter((row) => row.title);
}

export async function searchKitsu(query, custom = {}) {
  const data = await jsonGet(
    "https://kitsu.io/api/edge/manga?filter[text]=" +
      encodeURIComponent(query) +
      "&page[limit]=8",
    { headers: { Accept: "application/vnd.api+json" } }
  );
  return asArray(data?.data)
    .map((entry) => {
      const a = entry?.attributes || {};
      const titles = a.titles || {};
      const labels = [
        ...genreNames(a.genres),
        ...categoryNames(a.categories)
      ];
      return standard({
        title: a.canonicalTitle || titles.en || titles.ja_jp,
        cover_url: a.posterImage?.large || a.posterImage?.medium,
        synopsis: a.synopsis,
        pub_status: a.status,
        genres: labels,
        categories: a.categories,
        total_chapters: a.chapterCount,
        subtype: a.subtype,
        country: a.countryCode ?? a.country,
        labels,
        ageRating: a.ageRating,
        source_id: entry?.id,
        custom
      });
    })
    .filter((row) => row.title);
}

/** MangaUpdates/Kitsu picks always have a detail endpoint worth checking. */
export function needsSeriesDetail(row = {}) {
  return (
    !!text(row._source_id) && ["MangaUpdates", "Kitsu"].includes(row.source)
  );
}

/**
 * Fetch the matching source detail endpoint for a picked result. MangaUpdates
 * supplies genres, categories and description; Kitsu supplies up to 40
 * categories while its search result supplies synopsis and ageRating. All of
 * it feeds the same Genres/Tropes/Warnings mapper. Failures keep the result.
 */
export async function completeResult(row, custom = {}) {
  if (!needsSeriesDetail(row)) return row;
  try {
    if (row.source === "MangaUpdates") {
      const d = await jsonGet(
        "https://api.mangaupdates.com/v1/series/" +
          encodeURIComponent(row._source_id)
      );
      const labels = [
        ...genreNames(d?.genres),
        ...genreNames(d?.tags),
        ...categoryNames(d?.categories)
      ];
      const extra = standard({
        title: d?.title,
        cover_url: d?.image?.url?.original || d?.image?.url?.thumbnail,
        synopsis: d?.description || row.synopsis,
        pub_status: d?.status,
        genres: labels,
        categories: d?.categories,
        total_chapters: d?.latest_chapter,
        type: d?.type,
        country: d?.country ?? d?.country_code,
        labels,
        ageRating: row._ageRating,
        custom
      });
      return fillFrom(row, extra);
    }
    if (row.source === "Kitsu") {
      const d = await jsonGet(
        "https://kitsu.io/api/edge/manga/" +
          encodeURIComponent(row._source_id) +
          "/categories?page[limit]=40",
        { headers: { Accept: "application/vnd.api+json" } }
      );
      const labels = categoryNames(d?.data);
      const extra = standard({
        synopsis: row.synopsis,
        genres: labels,
        labels,
        ageRating: row._ageRating,
        format: row.format,
        custom
      });
      const out = fillFrom(row, extra);
      // A Webtoon category is explicit and beats a generic OEL/Western subtype.
      if (detectFormat({ labels }) === "Webtoon") out.format = "Webtoon";
      return out;
    }
  } catch (err) {
    // Keep the mapped search result when the detail lookup is unavailable.
    console.warn("Source detail lookup failed:", err.message);
  }
  return row;
}

/** AniList first, then MangaUpdates and Kitsu, deduped by normalized title. */
export async function searchSeries(query, custom = {}) {
  const q = text(query);
  if (q.length < 3) return [];
  const [anilist, mangaUpdates, kitsu] = await Promise.all([
    searchAniList(q, custom).catch(() => []),
    searchMangaUpdates(q, custom).catch(() => []),
    searchKitsu(q, custom).catch(() => [])
  ]);
  const out = [];
  const seen = new Set();
  for (const [rows, source] of [
    [anilist, "AniList"],
    [mangaUpdates, "MangaUpdates"],
    [kitsu, "Kitsu"]
  ]) {
    for (const row of rows || []) {
      const key = norm(row?.title);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({ ...row, source });
    }
  }
  return out;
}
