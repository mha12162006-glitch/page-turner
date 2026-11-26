import { searchAniList, cleanSyn } from "./anilist";
import { mapGenres, mapTropes } from "./tags";
import { mapTagsToWarnings } from "./warnings";
import { norm } from "./util";

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

/** Standard drawer/database fields, with warnings restricted to clean labels. */
function standard({
  title,
  cover_url,
  synopsis,
  pub_status,
  genres,
  total_chapters,
  anilist_id = null,
  year = null
}) {
  const list = genreNames(genres);
  return {
    anilist_id,
    title: text(title),
    cover_url: text(cover_url),
    // Leave format alone: these sources do not reliably declare it.
    format: "",
    pub_status: pubStatus(pub_status),
    genres: mapGenres(list),
    tags: mapTropes(list.map((name) => ({ name }))),
    warnings: mapTagsToWarnings(
      list.map((name) => ({ name, rank: 80 })),
      list,
      false
    ).join(", "),
    synopsis: cleanSyn(synopsis),
    total_chapters: chapterCount(total_chapters),
    year
  };
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
      return standard({
        title: r.title,
        cover_url: r.image?.url?.original || r.image?.url?.thumbnail,
        synopsis: String(r.description || "").replace(/\[\/?[^\]]+\]/g, " "),
        pub_status: r.status,
        genres: r.genres,
        total_chapters: r.latest_chapter,
        year: r.year ?? null
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
      return standard({
        title: a.canonicalTitle || titles.en || titles.ja_jp,
        cover_url: a.posterImage?.large || a.posterImage?.medium,
        synopsis: a.synopsis,
        pub_status: a.status,
        genres: a.genres,
        total_chapters: a.chapterCount
      });
    })
    .filter((row) => row.title);
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
