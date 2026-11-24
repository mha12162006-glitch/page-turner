import { isHttp, norm } from "./util";
import { mapTagsToWarnings, parseWarnings } from "./warnings";
import { mapGenres, mapTropes } from "./tags";

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
  "description(asHtml:false) status externalLinks{url type site}}}}"
].join("");

const DETAIL_QUERY = [
  "query($id:Int){Media(id:$id){chapters status ",
  "description(asHtml:false) genres isAdult ",
  "tags{name rank isMediaSpoiler} externalLinks{url type site} ",
  "characters(role:MAIN,perPage:8){nodes{name{full} image{large}}}}}"
].join("");

const CHARS_QUERY = [
  "query($id:Int,$p:Int){Media(id:$id){",
  "characters(page:$p,perPage:50,sort:RELEVANCE){",
  " pageInfo{hasNextPage} nodes{name{full alternative} image{large}}}}}"
].join("");

const BUSY = "AniList is busy, retrying";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function notifyAniList(message, kind = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("anilist:notice", { detail: { message, kind } })
  );
}

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
      notifyAniList("AniList did not respond. Try again in a moment.", "error");
      throw err;
    }

    if (r.status === 429) {
      if (retry < 3) {
        notifyAniList(BUSY, "busy");
        await pause(1000 * 2 ** retry);
        retry++;
        continue;
      }
      notifyAniList(
        "AniList is busy right now. Please try again in a minute.",
        "error"
      );
      throw new Error("AniList is busy (HTTP 429)");
    }

    if (!r.ok) {
      notifyAniList("AniList did not respond. Try again in a moment.", "error");
      throw new Error("AniList request failed (HTTP " + r.status + ")");
    }

    let json;
    try {
      json = await r.json();
    } catch (err) {
      notifyAniList("AniList sent an unreadable response. Try again.", "error");
      throw err;
    }
    if (json.errors && json.errors.length) {
      notifyAniList(
        "AniList could not load that title. Please try again.",
        "error"
      );
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }
    return json.data || {};
  }
}

// Only the official reading platforms named in the Stage 3 brief, in the
// given order, then AniList's explicit "Official Site" link. Aggregators and
// scanlation sites are never selected.
const PLATFORMS = [
  ["WEBTOON", /^webtoons?$/i, /(^|\.)webtoons\.com$/i],
  ["Tapas", /^tapas$/i, /(^|\.)tapas\.io$/i],
  ["Tappytoon", /^tappytoon$/i, /(^|\.)tappytoon\.com$/i],
  ["Lezhin", /^lezhin$/i, /(^|\.)lezhin\.com$/i],
  ["KakaoPage", /^kakaopage$/i, /(^|\.)page\.kakao\.com$/i],
  ["Naver Series", /^naver series$/i, /(^|\.)series\.naver\.com$/i],
  ["Manta", /^manta$/i, /(^|\.)manta\.net$/i],
  ["Comikey", /^comikey$/i, /(^|\.)comikey\.com$/i],
  [
    "MANGA Plus",
    /^manga plus$/i,
    /(^|\.)(mangaplus\.shueisha\.co\.jp|mangaplus\.com)$/i
  ]
];

const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

export function officialReadUrl(links = []) {
  const rows = (Array.isArray(links) ? links : []).filter(
    (link) => link && isHttp(link.url)
  );
  const streaming = [];
  for (const link of rows) {
    if (link.type !== "STREAMING") continue;
    const site = String(link.site || "").trim();
    const host = hostOf(link.url);
    const index = PLATFORMS.findIndex(
      ([, siteRe, hostRe]) => siteRe.test(site) && hostRe.test(host)
    );
    if (index >= 0) streaming.push({ link, index });
  }
  if (streaming.length) {
    streaming.sort((a, b) => a.index - b.index);
    return streaming[0].link.url.trim();
  }
  const official = rows.find((link) =>
    /^official site$/i.test(String(link.site || "").trim())
  );
  return official ? official.url.trim() : "";
}

const tagList = (media) => (Array.isArray(media.tags) ? media.tags : []);
const genreList = (media) => (Array.isArray(media.genres) ? media.genres : []);

export async function searchAniList(q) {
  const data = await anilistQuery(SEARCH_QUERY, { s: q });
  const media = data.Page?.media || [];
  return media.map((m) => {
    const genres = genreList(m);
    const tags = tagList(m);
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
      genres: mapGenres(genres),
      tags: mapTropes(tags),
      warnings: mapTagsToWarnings(tags, genres, !!m.isAdult).join(", "),
      read_url: officialReadUrl(m.externalLinks),
      synopsis: cleanSyn(m.description)
    };
  });
}

export async function anilistDetail(id) {
  const data = await anilistQuery(DETAIL_QUERY, { id });
  const m = data.Media;
  if (!m) {
    notifyAniList("AniList could not load that title. Try again.", "error");
    throw new Error("AniList returned no title");
  }
  const tags = tagList(m);
  const genres = genreList(m);
  return {
    synopsis: cleanSyn(m.description),
    genres: mapGenres(genres),
    tags: mapTropes(tags),
    warnings: mapTagsToWarnings(tags, genres, !!m.isAdult).join(", "),
    total_chapters: m.status === "FINISHED" ? m.chapters || null : null,
    read_url: officialReadUrl(m.externalLinks),
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
  !parseWarnings(row.warnings).length ||
  !hasText(row.read_url);

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
  if (!hasText(r.read_url) && hasText(source.read_url)) {
    r.read_url = source.read_url;
  }
  return r;
}

/**
 * Fill only missing fields. Existing selected genres, tags, warnings and URLs
 * are never overwritten. A failed lookup is announced through the AniList
 * notice event, but it returns the original row so a series save still works.
 */
export async function enrich(base) {
  let row = { ...base };
  let chars = [];
  try {
    let id = row.anilist_id;
    let found = null;
    if (!id) {
      const matches = await searchAniList(row.title);
      const rn = norm(row.title);
      found =
        matches.find((match) => {
          const mn = norm(match.title);
          return mn && (mn.includes(rn) || rn.includes(mn));
        }) || null;
      if (found) id = found.anilist_id;
    }
    if (id) {
      row.anilist_id = id;
      row = fillMissing(row, found);
      const detail = await anilistDetail(id);
      row = fillMissing(row, detail);
      chars = detail.chars || [];
    }
  } catch (err) {
    // anilistQuery has already shown a message; keep the save usable.
  }
  return { row, chars };
}

export async function anilistAllChars(id) {
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
