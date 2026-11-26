import { searchAniList, cleanSyn } from "./anilist";
import { mapAutoFields } from "./autoTags";
import { joinTags, splitTags } from "./tags";
import { joinWarnings } from "./warnings";
import { detectFormat, isPlaceholderSynopsis, norm, proxyCover } from "./util";

/**
 * Title search across four free sources. AniList stays first so existing
 * anilist_id links keep working; MangaUpdates, Kitsu and the WEBTOON API cover
 * Western comics and webtoons that AniList excludes by country of origin.
 * Every failure is isolated so one unavailable source never blocks the others.
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

const chapterCount = (value, status = "") => {
  const n = Number(text(value));
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  // MangaUpdates often reports its count inside the status sentence instead of
  // latest_chapter, e.g. "125 Chapters (Complete)" or "48 Chapters (Ongoing)".
  const fromStatus = text(status).match(/(\d+)\s*Chapters?/i);
  if (fromStatus) {
    const parsed = Number(fromStatus[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
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
  const clean = isPlaceholderSynopsis(synopsis)
    ? ""
    : cleanDescription(synopsis);
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
    cover_url: proxyCover(text(cover_url)),
    format: text(format) || detectFormat({ type, subtype, country, labels: names }),
    pub_status: pubStatus(pub_status),
    genres: mapped.genres,
    tags: mapped.tags,
    warnings: mapped.warnings,
    synopsis: clean,
    // Non-AniList picks start at chapter 0 so cards show "Ch. 0 / Y" and the
    // +/- controls behave exactly like AniList-linked rows.
    chapter: 0,
    total_chapters: chapterCount(total_chapters, pub_status),
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
  // A detail page's og:image is the canonical cover, so it wins over the small
  // search thumbnail when present.
  if (text(extra?.cover_url)) out.cover_url = extra.cover_url;
  // Detail endpoints carry the full description; a short autocomplete sentence
  // must never win once the real page has been scraped.
  if (text(extra?.synopsis) && !isPlaceholderSynopsis(extra.synopsis)) {
    out.synopsis = extra.synopsis;
  }
  if (!text(out.pub_status) && text(extra?.pub_status)) {
    out.pub_status = extra.pub_status;
  }
  if (!text(out.format) && text(extra?.format)) out.format = extra.format;
  out.genres = unionChips(out.genres, extra?.genres);
  out.tags = unionChips(out.tags, extra?.tags);
  out.warnings = joinWarnings([out.warnings, extra?.warnings]);
  // A detail endpoint is authoritative for the total chapter count.
  if (extra?.total_chapters != null) out.total_chapters = extra.total_chapters;
  return out;
}

async function jsonGet(url, options) {
  const r = await fetch(url, options);
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}

/** Exact-title MangaUpdates fallback for Kitsu rows with no chapterCount. */
async function mangaUpdatesChapterByTitle(title) {
  const data = await jsonGet(
    "https://api.mangaupdates.com/v1/series/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ search: text(title), perpage: 10 })
    }
  );
  const wanted = norm(title);
  const hit = asArray(data?.results).find((entry) => {
    const record = entry?.record || entry || {};
    return norm(record.title) === wanted;
  });
  const id = hit?.record?.series_id ?? hit?.record?.id ?? hit?.series_id ?? hit?.id;
  if (id == null) return null;
  const detail = await jsonGet(
    "https://api.mangaupdates.com/v1/series/" + encodeURIComponent(id)
  );
  return chapterCount(detail?.latest_chapter, detail?.status);
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

/**
 * Search rows are deliberately sparse: WEBTOON's autocomplete has no real
 * description, so we keep synopsis empty and let the detail call fill it. The
 * server supplies everything needed to scrape the actual page later.
 */
export async function searchWebtoon(query, custom = {}) {
  const data = await jsonGet(
    "/api/webtoon-search?q=" + encodeURIComponent(query),
    { headers: { Accept: "application/json" } }
  );
  return asArray(data?.results)
    .map((r) => {
      const genre = text(r.genre);
      const labels = [genre, text(r.author)].filter(Boolean);
      const row = standard({
        title: r.title,
        cover_url: r.cover_url,
        synopsis: text(r.synopsis),
        genres: genre ? [genre] : [],
        labels,
        format: "Webtoon",
        source_id: r.webtoon_id,
        custom
      });
      return {
        ...row,
        _detail_url: text(r.detail_url),
        _webtoon_type: text(r.webtoon_type) || "ORIGINAL"
      };
    })
    .filter((row) => row.title);
}

/** Every non-AniList source has a detail endpoint worth checking. */
export function needsSeriesDetail(row = {}) {
  return (
    !!text(row._source_id) &&
    ["MangaUpdates", "Kitsu", "WEBTOON"].includes(row.source)
  );
}

/**
 * Fetch the matching source detail endpoint for a picked result. MangaUpdates
 * supplies genres, categories, description and chapter count; Kitsu supplies
 * its detail record plus up to 40 categories, with an exact-title MangaUpdates
 * chapter fallback when chapterCount is null. All of it feeds the same mapper.
 * Failures keep the result already shown in search.
 */
export async function completeResult(row, custom = {}) {
  if (!needsSeriesDetail(row)) return row;
  try {
    if (row.source === "WEBTOON") {
      const fallbackUrl = text(row._source_id)
        ? "https://www.webtoons.com/en/detail/series/list?title_no=" +
          encodeURIComponent(row._source_id)
        : "";
      const detailUrl = text(row._detail_url) || fallbackUrl;
      if (!detailUrl) return row;
      const data = await jsonGet(
        "/api/webtoon-search?url=" + encodeURIComponent(detailUrl),
        { headers: { Accept: "application/json" } }
      );
      const d = data?.result || {};
      if (!text(d.title) && !text(d.synopsis)) return row;
      const genres = [
        ...asArray(d.genres).map(text),
        ...genreNames(row.genres)
      ].filter(Boolean);
      // The mobile page's own tag box is part of the detail payload. Pass it
      // as tags (not genres/labels) so it can derive curated tropes/warnings
      // without turning a story tag such as "Drama" into a genre chip.
      const webtoonTags = asArray(d.tags)
        .map(text)
        .filter(Boolean)
        .map((name) => ({ name, rank: 80 }));
      const extra = standard({
        title: d.title || row.title,
        cover_url: d.cover_url || row.cover_url,
        // The server never invents descriptions. An empty string keeps the
        // search row clean instead of persisting a placeholder.
        synopsis: text(d.synopsis),
        pub_status: d.pub_status || row.pub_status,
        genres,
        categories: genres,
        labels: genres,
        warningTags: webtoonTags,
        total_chapters: d.total_chapters,
        format: "Webtoon",
        source_id: d.webtoon_id || row._source_id,
        custom
      });
      const out = fillFrom(row, extra);
      out._detail_url = text(d.detail_url) || detailUrl;
      out._webtoon_type = text(d.webtoon_type) || row._webtoon_type || "ORIGINAL";
      return out;
    }
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
        total_chapters: chapterCount(d?.latest_chapter, d?.status),
        type: d?.type,
        country: d?.country ?? d?.country_code,
        labels,
        ageRating: row._ageRating,
        custom
      });
      return fillFrom(row, extra);
    }
    if (row.source === "Kitsu") {
      const headers = { Accept: "application/vnd.api+json" };
      const base = "https://kitsu.io/api/edge/manga/" + encodeURIComponent(row._source_id);
      const [detailResult, categoriesResult] = await Promise.allSettled([
        jsonGet(base, { headers }),
        jsonGet(base + "/categories?page[limit]=40", { headers })
      ]);
      if (detailResult.status === "rejected") {
        console.warn("Kitsu detail lookup failed:", detailResult.reason?.message);
      }
      if (categoriesResult.status === "rejected") {
        console.warn("Kitsu categories lookup failed:", categoriesResult.reason?.message);
      }
      const d =
        detailResult.status === "fulfilled" ? detailResult.value : {};
      const attributes = d?.data?.attributes || {};
      const labels = categoryNames(
        categoriesResult.status === "fulfilled" ? categoriesResult.value?.data : []
      );
      let total = chapterCount(attributes.chapterCount);
      // Kitsu leaves chapterCount null for many webtoons; use the exact-title
      // MangaUpdates entry (search then detail) so the total still fills in.
      if (total == null && text(row.title)) {
        try {
          total = await mangaUpdatesChapterByTitle(row.title);
        } catch (err) {
          console.warn("MangaUpdates chapter fallback failed:", err.message);
        }
      }
      const extra = standard({
        cover_url: attributes.posterImage?.large || attributes.posterImage?.medium,
        synopsis: attributes.synopsis || row.synopsis,
        pub_status: attributes.status || row.pub_status,
        genres: labels,
        labels,
        total_chapters: total,
        ageRating: attributes.ageRating || row._ageRating,
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

/** AniList first, then MangaUpdates/Kitsu/WEBTOON, deduped by title. */
export async function searchSeries(query, custom = {}) {
  const q = text(query);
  if (q.length < 3) return [];
  const [anilist, mangaUpdates, kitsu, webtoon] = await Promise.all([
    searchAniList(q, custom).catch(() => []),
    searchMangaUpdates(q, custom).catch(() => []),
    searchKitsu(q, custom).catch(() => []),
    searchWebtoon(q, custom).catch(() => [])
  ]);
  const out = [];
  const seen = new Set();
  for (const [rows, source] of [
    [anilist, "AniList"],
    [mangaUpdates, "MangaUpdates"],
    [kitsu, "Kitsu"],
    [webtoon, "WEBTOON"]
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
