import { searchAniList, cleanSyn } from "./anilist";
import { mapGenres, mapTropes } from "./tags";
import { mapTagsToWarnings } from "./warnings";
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
      return text(item?.genre ?? item?.name ?? item?.title);
    })
    .filter(Boolean);

const categoryNames = (value) =>
  asArray(value)
    .map((item) => {
      if (typeof item === "string") return item;
      const a = item?.attributes || {};
      return text(a.title ?? a.name ?? item?.title ?? item?.name);
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

const has = (value) =>
  Array.isArray(value) ? value.length > 0 : !!text(value);

/** Only built-in Genre/Trope/Warning labels are ever produced here. */
function standard({
  title,
  cover_url,
  synopsis,
  pub_status,
  genres,
  total_chapters,
  anilist_id = null,
  format = "",
  source_id = null,
  type,
  subtype,
  country,
  labels = []
}) {
  const names = genreNames(genres);
  const allLabels = [...names, ...categoryNames(labels)];
  return {
    anilist_id,
    title: text(title),
    cover_url: text(cover_url),
    format: text(format) || detectFormat({ type, subtype, country, labels: allLabels }),
    pub_status: pubStatus(pub_status),
    genres: mapGenres(names),
    tags: mapTropes(names.map((name) => ({ name }))),
    warnings: mapTagsToWarnings(
      names.map((name) => ({ name, rank: 80 })),
      names,
      false
    ).join(", "),
    synopsis: cleanSyn(synopsis),
    total_chapters: chapterCount(total_chapters),
    // Internal metadata only; the drawer never copies this into the form/save.
    _source_id: source_id == null ? null : String(source_id)
  };
}

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
  if (!has(out.genres) && has(extra?.genres)) out.genres = [...extra.genres];
  if (!has(out.tags) && has(extra?.tags)) out.tags = [...extra.tags];
  if (!text(out.warnings) && text(extra?.warnings)) out.warnings = extra.warnings;
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

export async function searchMangaUpdates(query) {
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
      const labels = genreNames(r.genres);
      return standard({
        title: r.title,
        cover_url: r.image?.url?.original || r.image?.url?.thumbnail,
        synopsis: String(r.description || "").replace(/\[\/?[^\]]+\]/g, " "),
        pub_status: r.status,
        genres: r.genres,
        total_chapters: r.latest_chapter,
        type: r.type,
        country: r.country ?? r.country_code,
        labels,
        source_id: r.series_id ?? r.id
      });
    })
    .filter((row) => row.title);
}

export async function searchKitsu(query) {
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
        total_chapters: a.chapterCount,
        subtype: a.subtype,
        country: a.countryCode ?? a.country,
        labels,
        source_id: entry?.id
      });
    })
    .filter((row) => row.title);
}

/** True when a non-AniList result can still gain categories from its detail endpoint. */
export function needsSeriesDetail(row = {}) {
  if (!text(row._source_id)) return false;
  if (!["MangaUpdates", "Kitsu"].includes(row.source)) return false;
  return (
    !text(row.synopsis) ||
    !text(row.cover_url) ||
    !text(row.pub_status) ||
    !text(row.format) ||
    !has(row.genres) ||
    !has(row.tags) ||
    !text(row.warnings) ||
    row.total_chapters == null
  );
}

/**
 * Fetch the matching source detail endpoint when a search result is partial.
 * MangaUpdates returns full series metadata; Kitsu only adds categories.
 * failures are ignored so a picked result always stays saveable.
 */
export async function completeResult(row) {
  if (!needsSeriesDetail(row)) return row;
  try {
    if (row.source === "MangaUpdates") {
      const d = await jsonGet(
        "https://api.mangaupdates.com/v1/series/" +
          encodeURIComponent(row._source_id)
      );
      const labels = [
        ...genreNames(d?.genres),
        ...genreNames(d?.tags)
      ];
      const extra = standard({
        title: d?.title,
        cover_url: d?.image?.url?.original || d?.image?.url?.thumbnail,
        synopsis: String(d?.description || "").replace(/\[\/?[^\]]+\]/g, " "),
        pub_status: d?.status,
        genres: labels,
        total_chapters: d?.latest_chapter,
        type: d?.type,
        country: d?.country ?? d?.country_code,
        labels
      });
      return fillFrom(row, extra);
    }
    if (row.source === "Kitsu") {
      const d = await jsonGet(
        "https://kitsu.io/api/edge/manga/" +
          encodeURIComponent(row._source_id) +
          "/categories"
      );
      const labels = categoryNames(d?.data);
      const extra = standard({ genres: labels, labels });
      const out = fillFrom(row, extra);
      // A Webtoon category is explicit and beats a generic OEL/Western subtype.
      if (detectFormat({ labels }) === "Webtoon") out.format = "Webtoon";
      return out;
    }
  } catch (err) {
    // Keep the already-mapped search result when detail lookup is unavailable.
  }
  return row;
}

/** AniList first, then MangaUpdates and Kitsu, deduped by normalized title. */
export async function searchSeries(query) {
  const q = text(query);
  if (q.length < 3) return [];
  const [anilist, mangaUpdates, kitsu] = await Promise.all([
    searchAniList(q).catch(() => []),
    searchMangaUpdates(q).catch(() => []),
    searchKitsu(q).catch(() => [])
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
