import { mapAutoFields } from "./autoTags";
import { parseWarnings } from "./warnings";

export const cleanSyn = (t) =>
  (t || "")
    .replace(/~!.*?!~/gs, "")
    .replace(/~!.*$/s, "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\((Source|Written by)[^)]*\)/gi, "")
    .replace(/\[(Source|Written by)[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 520)
    .replace(/^(.{200,}[.!?])\s[^.!?]*$/, "$1");

const SEARCH_QUERY = [
  "query($s:String){Page(perPage:8){media(search:$s,type:MANGA,",
  "sort:SEARCH_MATCH){id title{romaji english} coverImage{large}",
  " countryOfOrigin genres isAdult tags{name rank isMediaSpoiler} ",
  "description(asHtml:false) status}}}"
].join("");

const DETAIL_QUERY = [
  "query($id:Int){Media(id:$id){chapters status ",
  "description(asHtml:false) genres isAdult ",
  "tags{name rank isMediaSpoiler} ",
  "characters(role:MAIN,perPage:8){nodes{name{full} image{large}}}}}"
].join("");

const CHARS_QUERY = [
  "query($id:Int,$p:Int){Media(id:$id){",
  "characters(page:$p,perPage:50,sort:RELEVANCE){",
  " pageInfo{hasNextPage} nodes{name{full alternative} image{large}}}}}"
].join("");

const BUSY = "AniList is busy, retrying";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Failures are logged only. They never become toasts, banners, or alerts. */
const warnAniList = (message) => console.warn(message);

async function anilistQuery(query, variables) {
  let retry = 0;
  for (;;) {
    let r;
    try {
      r = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables })
      });
    } catch (err) {
      warnAniList("AniList did not respond. Try again in a moment.");
      throw err;
    }

    if (r.status === 429) {
      if (retry < 3) {
        warnAniList(BUSY);
        await pause(1000 * 2 ** retry);
        retry++;
        continue;
      }
      warnAniList("AniList is busy right now. Please try again in a minute.");
      throw new Error("AniList is busy (HTTP 429)");
    }

    if (!r.ok) {
      warnAniList("AniList did not respond. Try again in a moment.");
      throw new Error("AniList request failed (HTTP " + r.status + ")");
    }

    let json;
    try {
      json = await r.json();
    } catch (err) {
      warnAniList("AniList sent an unreadable response. Try again.");
      throw err;
    }
    if (json.errors && json.errors.length) {
      warnAniList("AniList could not load that title. Please try again.");
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }
    return json.data || {};
  }
}

const tagList = (media) => (Array.isArray(media.tags) ? media.tags : []);
const genreList = (media) => (Array.isArray(media.genres) ? media.genres : []);

export async function searchAniList(q, custom = {}) {
  const data = await anilistQuery(SEARCH_QUERY, { s: q });
  const media = data.Page?.media || [];
  return media.map((m) => {
    const genres = genreList(m);
    const tags = tagList(m);
    const synopsis = cleanSyn(m.description);
    const mapped = mapAutoFields({
      labels: genres,
      tags,
      genres,
      synopsis,
      isAdult: !!m.isAdult,
      custom
    });
    return {
      anilist_id: m.id,
      pub_status:
        {
          FINISHED: "Completed",
          RELEASING: "Ongoing",
          NOT_YET_RELEASED: "Not yet released",
          CANCELLED: "Discontinued",
          HIATUS: "On hiatus"
        }[m.status] || "",
      title: m.title?.english || m.title?.romaji || "",
      cover_url: m.coverImage?.large || "",
      format:
        m.countryOfOrigin === "KR"
          ? "Manhwa"
          : ["CN", "TW", "HK"].includes(m.countryOfOrigin)
            ? "Manhua"
            : "Manga",
      genres: mapped.genres,
      tags: mapped.tags,
      warnings: mapped.warnings,
      synopsis
    };
  });
}

export async function anilistDetail(id, custom = {}) {
  // A null id means this is a MangaUpdates/Kitsu/manual comic. It has no
  // AniList endpoint, so return before any request or user-facing message.
  if (id == null || id === "") {
    warnAniList("Skipping AniList detail: no anilist_id on this series.");
    return null;
  }
  const data = await anilistQuery(DETAIL_QUERY, { id });
  const m = data.Media;
  if (!m) {
    warnAniList("AniList could not load that title. Try again.");
    throw new Error("AniList returned no title");
  }
  const tags = tagList(m);
  const genres = genreList(m);
  const synopsis = cleanSyn(m.description);
  const mapped = mapAutoFields({
    labels: genres,
    tags,
    genres,
    synopsis,
    isAdult: !!m.isAdult,
    custom
  });
  return {
    synopsis,
    genres: mapped.genres,
    tags: mapped.tags,
    warnings: mapped.warnings,
    total_chapters: m.status === "FINISHED" ? m.chapters || null : null,
    chars: (m.characters?.nodes || []).map((n) => ({
      name: n.name.full,
      image_url: n.image?.large || "",
      comment: ""
    }))
  };
}

const hasText = (value) => !!String(value ?? "").trim();
const hasList = (value) =>
  Array.isArray(value) ? value.length > 0 : hasText(value);

export const needsEnrichment = (row = {}) =>
  !hasText(row.synopsis) ||
  !hasList(row.genres) ||
  !parseWarnings(row.warnings).length;

function fillMissing(row, source) {
  if (!source) return row;
  const r = { ...row };
  if (!hasText(r.cover_url) && hasText(source.cover_url)) {
    r.cover_url = source.cover_url;
  }
  if (!hasText(r.synopsis) && hasText(source.synopsis)) {
    r.synopsis = source.synopsis;
  }
  if (!hasText(r.pub_status) && hasText(source.pub_status)) {
    r.pub_status = source.pub_status;
  }
  if (!hasList(r.genres) && hasList(source.genres)) {
    r.genres = Array.isArray(source.genres)
      ? [...source.genres]
      : [source.genres];
  }
  if (!hasList(r.tags) && hasList(source.tags)) {
    r.tags = Array.isArray(source.tags) ? [...source.tags] : [source.tags];
  }
  if (!parseWarnings(r.warnings).length && hasText(source.warnings)) {
    r.warnings = source.warnings;
  }
  if (r.total_chapters == null && source.total_chapters != null) {
    r.total_chapters = source.total_chapters;
  }
  return r;
}

/**
 * Fill only missing details for rows that already have an AniList id. Rows
 * from MangaUpdates/Kitsu (or manual entry) have no id and are left untouched:
 * no AniList request, no toast. "Link to read" is never filled.
 */
export async function enrich(base) {
  let row = { ...base };
  let chars = [];
  const id = row.anilist_id;
  if (id == null || id === "") {
    warnAniList("Skipping AniList enrichment: no anilist_id on this series.");
    return { row, chars };
  }
  try {
    const detail = await anilistDetail(id);
    if (!detail) return { row, chars };
    row = fillMissing(row, detail);
    chars = detail.chars || [];
  } catch (err) {
    // anilistQuery has already logged the failure; keep the save usable.
  }
  return { row, chars };
}

export async function anilistAllChars(id) {
  if (id == null || id === "") {
    warnAniList("Skipping AniList characters: no anilist_id on this series.");
    return [];
  }
  let out = [];
  let page = 1;
  let more = true;
  while (more && page <= 4) {
    const data = await anilistQuery(CHARS_QUERY, { id, p: page });
    const c = data.Media?.characters;
    if (!c) break;
    out = out.concat(c.nodes || []);
    more = c.pageInfo?.hasNextPage;
    page++;
  }
  return out.map((n) => ({
    name: n.name.full,
    alt: n.name.alternative || [],
    image_url: n.image?.large || ""
  }));
}
