/**
 * Vercel serverless function for WEBTOON/Comix search, full series details and
 * cover image proxying.
 *
 * WEBTOON search merges the compact JSON autocomplete endpoint with the full
 * /en/search HTML page, because apostrophes and long titles often return no
 * autocomplete hits. Selecting a result calls the detail mode below, which
 * scrapes the real series page server-side. Comix uses its signed JSON API;
 * its detail response is XOR-protected and is decoded here. Cover images are
 * proxied because the CDNs block browser <img> requests without a Referer.
 */

const ORIGIN = "https://www.webtoons.com";
const COMIX_ORIGIN = "https://comix.to";
// Any Naver CDN host, webtoons.com and Comix can serve a cover; keep the
// allowlist host-suffixed so look-alike domains such as pstatic.net.evil are
// rejected.
const IMAGE_HOSTS = /(^|\.)(?:pstatic\.net|webtoons\.com|comix\.to)$/i;
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";
// The CDN only serves covers when the request looks like it came from WEBTOON.
const IMAGE_HEADERS = {
  "User-Agent": BROWSER_UA,
  "Accept-Language": "en-US,en;q=0.9",
  Referer: ORIGIN + "/"
};
// Without these consent cookies webtoons.com redirects server-side requests to
// an age/GDPR gate instead of the real series page.
const DETAIL_HEADERS = {
  ...IMAGE_HEADERS,
  Cookie:
    "pagGDPR=true; locale=en; needGDPR=false; needCCPA=false; needCOPPA=false",
  Referer: ORIGIN + "/en/"
};
const COMIX_HEADERS = {
  Accept: "application/json",
  "X-Requested-With": "XMLHttpRequest",
  "X-RT": "0",
  "User-Agent": BROWSER_UA
};

const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const decode = (value) =>
  String(value ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .trim();

const stripTags = (value) =>
  decode(String(value ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

const titleCase = (value) =>
  decode(value)
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());

const absoluteImage = (value) => {
  const src = decode(value);
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith("/")) return "https://webtoon-phinf.pstatic.net" + src;
  return "";
};

const attr = (tag, name) =>
  tag.match(new RegExp("\\b" + name + "\\s*=\\s*\"([^\"]*)\"", "i"))?.[1] || "";

const meta = (html, property) => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(html || "").match(
    new RegExp(
      '<meta[^>]+(?:property|name)\\s*=\\s*"' +
        escaped +
        '"[^>]+content\\s*=\\s*"([\\s\\S]*?)"',
      "i"
    )
  );
  return decode(match?.[1]);
};

const slug = (value) =>
  decode(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "series";

/*
 * Comix signs each request with a keyed SHA-256 variant and XOR-protects
 * detail responses. The bytes below are the site's public API key; keeping the
 * derivation here means `npm run dev` and Vercel behave like the browser
 * without shipping the site's obfuscated bundle.
 */
const COMIX_KEY = Buffer.from(
  "qllej63jwuQW3+O5sSJUM1rgAUy3ErzEl+jsm+64FooKpV4fiR+r+1IdfPBSLBQ5h0RJ0r64niyFarJt75RRfUeEEpCV8F+piWBRSlweoRiKhzmbJ9ddcjQ3Or8ZbS4QVJS79LW4ec+3WXcjhfhm5FHrImN8vlMT0fZYf51YrcKryfgDjOpGR5X2TvzuDN7g0ZxgNJjAw23K7VzgMXZRjVzQV+JA3JKbf3GrMQljXL/Z+55mJHhf0Z5Sej22EaJKgzYDt0ERQe7i3jojVSgfrwYPPTEPLLJJ/R7cNI2WxH+vpQ6LBd+EsUpoguWIWeYCLAWHYdmZcZRLgfB2/4U3bEasa1K+/b+n1Yvc2f13dxuM7vkYBjY4bgr9p4xKwUGxBK2DXdl3N9CCZoLVIgcBjwSGZO7VZGWTC1aRlYLDF5+rQi8m893GZJ8fhFwOYtbbNAQIqxHPdpmmjt4YrVP22if7CFODZ2i979pCrhVLGjqyfVLmkpc3n8E2du8x9kD18riwJqhj5zPb8tb85GnGfgoem2k+Qzb4JOf46PG3orvxa3Zu+dnl6vd3CLk4zyNtRbi12S8ETsPGqOaGZ3Wy0WPRSAZGtP7ojRS54Mu+sD6jhcClGBa1Iq5ixyGEB2TushufWBFLQKK3JFuniqv+dGKo059bvzDe6Wgkjh9IMnMO5sqcMWfLAVgTB2asT2NJNKqXSnjgaT4BOU788UH3p9UxFvWY2gfBlbu40f74PI5NfUWSBc8ATeiwh7ycqlt1wqZnJnGwKJIGgubxF1kBlj7K6F4bQAMIB9dSf925rW8bMAJYJyTvLZZzwywAyk5rHm4DTwjWE/QBgzeR7jJWzRKZYq20nHyxY1hN1GpP0SG70ECLsWQbmnP/mvhxba0ygl2V80mMgJTGoUVIgYQpnAEYT8cjX7X0n9IYQRh+TO7W8xphOw5gfCY1/8m/3BgIPKfzqaeyNJV+hBN33jFYGS4MjzxaFX7+oH4xwnpM8AlTF6CrkN2rnMmsJblKSq8Jd3tqaecsWQrCCj145ahMxdyQX2CsuCkjBR9Afv7XC9fOkckytpYUGp6cezxiN0LvBFth1kR5TKeOKKcAN4s+GuN5unbieKd59LQkqVNHMxWkMmc3sVKLtmIrJ695biQLIYuLvkNCcrj9NYb0MoEJu3Mcz0SPmN3rgxRAQnohuB/rBwTAftklh7xa1iuLRK0b+uk1oiSZTQq0sNAnAXV4k9NbyIzLV/EtHcX1uSwjx2ozT11rCbCb5c6IhGhn3N+llhuqhvijcEluufiCUvPc9KqlKWMtvd/oyNCEvxOyyuo6JzxInWjcEKahEWPYOJZaYlz2Y4aJgAdKLW+SrBm2vFrdvbLWKY/unhS7lu3u7GNqRw4bafzq7KE784kFJMVQYRp+XXaUmYzgrUYZP17mpscETkPy26PDKtwubDKSkWU=",
  "base64"
);
const COMIX_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];
const rotateRight = (value, bits) =>
  ((value >>> bits) | (value << (32 - bits))) >>> 0;

function comixSha256(initial, bytes) {
  const state = Uint32Array.from(initial, (value) => value >>> 0);
  let size = bytes.length + 1;
  while (size % 64 !== 56) size += 1;
  const padded = Buffer.alloc(size + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  // The browser hashes a virtual 64-byte key block before the message.
  const bitLength = (64 + bytes.length) * 8;
  padded.writeUInt32BE(Math.floor(bitLength / 0x100000000), size);
  padded.writeUInt32BE(bitLength >>> 0, size + 4);

  for (let offset = 0; offset < padded.length; offset += 64) {
    const words = new Uint32Array(64);
    for (let i = 0; i < 16; i += 1) words[i] = padded.readUInt32BE(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const a = words[i - 15];
      const b = words[i - 2];
      const small0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const small1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      words[i] = (words[i - 16] + small0 + words[i - 7] + small1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = state;
    for (let i = 0; i < 64; i += 1) {
      const big1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + big1 + choose + COMIX_K[i] + words[i]) >>> 0;
      const big0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (big0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  const digest = Buffer.alloc(32);
  for (let i = 0; i < 8; i += 1) digest.writeUInt32BE(state[i], i * 4);
  return digest;
}

const comixWords = (offset) => [
  0, 1, 2, 3, 4, 5, 6, 7
].map((i) => COMIX_KEY.readUInt32BE(offset + i * 4));

export function comixToken(message) {
  const inner = comixSha256(comixWords(0), Buffer.from(message, "utf8"));
  const outer = comixSha256(comixWords(32), inner);
  return (
    "fdj." +
    outer
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
      .slice(0, 16)
  );
}

export function decodeComixPayload(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed.e !== "string") return parsed;
  const raw = Buffer.from(parsed.e.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (raw.length < 2) throw new Error("Comix returned a short protected response");
  const offset = ((raw[0] << 8) | raw[1]) % 1024;
  const tail = COMIX_KEY.subarray(64, 1088);
  const stream = Buffer.concat([tail.subarray(offset), tail.subarray(0, offset)]);
  const plain = Buffer.from(raw.subarray(2));
  for (let i = 0; i < plain.length; i += 1) plain[i] ^= stream[i % 1024];
  return JSON.parse(plain.toString("utf8"));
}

const comixImage = (value) => {
  const src = decode(value);
  if (/^https?:\/\//i.test(src)) return src;
  return src.startsWith("/") ? COMIX_ORIGIN + src : "";
};

const comixStatus = (value) => {
  const status = String(value || "").toLowerCase();
  if (/finish|complete/.test(status)) return "Completed";
  if (/releas|ongoing|current/.test(status)) return "Ongoing";
  if (/hiatus|hold/.test(status)) return "On hiatus";
  if (/cancel|discontinu/.test(status)) return "Discontinued";
  return "";
};

const comixNames = (values) =>
  asArray(values)
    .map((item) => (typeof item === "string" ? item : decode(item?.title)))
    .filter(Boolean);

const comixFormat = (item = {}) => {
  const labels = [
    ...comixNames(item.genres),
    ...comixNames(item.tags),
    ...comixNames(item.formats)
  ];
  if (labels.some((name) => /web\s*toon|webcomic|full color/i.test(name))) {
    return "Webtoon";
  }
  const raw = [item.type, item.originalLanguage].join(" ").toLowerCase();
  if (/manhwa|korea|\bko\b/.test(raw)) return "Manhwa";
  if (/manhua|china|\bzh\b/.test(raw)) return "Manhua";
  if (/manga|japan|\bja\b/.test(raw)) return "Manga";
  return "";
};

const comixDetailPath = ({ url, slug: givenSlug } = {}) => {
  const value = String(givenSlug || "").trim();
  const id = (value.match(/^[a-z0-9]+/i) || [])[0];
  if (id) return "/manga/" + id;
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl, COMIX_ORIGIN);
    if (!/^comix\.to$/i.test(parsed.hostname)) return "";
    const match = parsed.pathname.match(/^\/title\/([a-z0-9]+)/i);
    return match ? "/manga/" + match[1] : "";
  } catch {
    return "";
  }
};

const normalizedResult = (row) => {
  const title = stripTags(row.title);
  if (!title) return null;
  return {
    title,
    cover_url: absoluteImage(row.cover_url),
    author: stripTags(row.author),
    genre: titleCase(row.genre),
    webtoon_id: String(row.webtoon_id || ""),
    webtoon_type: row.webtoon_type || "ORIGINAL",
    detail_url: absoluteUrl(row.detail_url),
    synopsis: stripTags(row.synopsis),
    type: "Webtoon"
  };
};

function absoluteUrl(value) {
  const raw = decode(value);
  if (!raw) return "";
  try {
    const url = new URL(raw, ORIGIN);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : "";
  } catch {
    return "";
  }
}

/**
 * CDN filenames include spaces and parentheses, e.g.
 * `.../1) Thumb_Square_3174.jpg`. Normalize before handing the URL to fetch so
 * a raw space never turns into an invalid request.
 */
export function encodeImageUrl(value) {
  const raw = String(value ?? "").trim();
  try {
    return encodeURI(decodeURI(raw));
  } catch {
    try {
      return encodeURI(raw);
    } catch {
      return raw;
    }
  }
}

/** Parse the full /en/search page (works for long titles and apostrophes). */
export function parseSearchHtml(html) {
  const cards = String(html || "").matchAll(
    /<a\b([^>]*\bclass\s*=\s*"[^"]*\b_card_item\b[^"]*"[^>]*)>([\s\S]*?)<\/a>/gi
  );
  const out = [];
  for (const [, tag, body] of cards) {
    const href = attr(tag, "href");
    const path = (() => {
      try {
        return new URL(href, ORIGIN).pathname.split("/").filter(Boolean);
      } catch {
        return [];
      }
    })();
    const match = href.match(/[?&]title_no=(\d+)/);
    const webtoonType =
      attr(tag, "data-webtoon-type") === "CHALLENGE" ? "CANVAS" : "ORIGINAL";
    out.push(
      normalizedResult({
        title: body.match(/<strong[^>]*class="title"[^>]*>([\s\S]*?)<\/strong>/i)?.[1],
        cover_url: body.match(/<img[^>]+src="([^"]+)"/i)?.[1],
        author: body.match(/<div[^>]*class="author"[^>]*>([\s\S]*?)<\/div>/i)?.[1],
        genre: path[1] === "canvas" ? "Canvas" : path[1] || "",
        webtoon_id: attr(tag, "data-title-no") || match?.[1] || "",
        webtoon_type: webtoonType,
        detail_url: href,
        synopsis: ""
      })
    );
  }
  return out.filter(Boolean);
}

/** Parse the compact JSON autocomplete payload. */
export function parseImmediate(payload) {
  const rows = asArray(payload?.result?.searchedList || payload?.searchedList);
  return rows
    .filter((row) => !row.searchMode || row.searchMode === "TITLE")
    .map((row) => {
      const id = String(row.titleNo || "");
      return normalizedResult({
        title: row.title,
        cover_url: row.thumbnailMobile || row.thumbnail,
        author: (row.authorNameList || [row.authorName]).filter(Boolean).join(" / "),
        genre: row.representGenre || "",
        webtoon_id: id,
        detail_url: id
          ? ORIGIN + "/en/detail/" + slug(row.title) + "/list?title_no=" + id
          : "",
        synopsis: ""
      });
    })
    .filter(Boolean);
}

export function mergeResults(...groups) {
  const seen = new Set();
  const out = [];
  for (const group of groups) {
    for (const row of group || []) {
      const key = row.webtoon_id
        ? "id:" + row.webtoon_id
        : "title:" + row.title.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
  }
  return out.slice(0, 12);
}

/** English alt-titles win over the Japanese/Romaji main title. */
export function comixTitle(item = {}) {
  const main = decode(item.title);
  const alternatives = asArray(item.altTitles).map(decode).filter(Boolean);
  // Romaji alt-titles also use Latin letters; skip Japanese particles so the
  // actual English translation wins before falling back to the main title.
  const romaji = /\b(?:wa|wo|ni|kun|san|chan|ga|de)\b/i;
  const english = alternatives.find(
    (title) =>
      !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(title) &&
      !romaji.test(title)
  );
  return english || main || alternatives[0] || "";
}

/** Keep the Romaji primary title as an alias after promoting the English one. */
const comixAllTitles = (item = {}) => {
  const values = [
    decode(item.title),
    ...asArray(item.altTitles).map(decode)
  ].filter(Boolean);
  return values.filter((title, i) => values.indexOf(title) === i);
};

export function parseComixResults(payload) {
  return asArray(payload?.result?.items)
    .map((item) => {
      const title = comixTitle(item);
      if (!title) return null;
      const chapters = Math.max(
        Number(item.finalChapter) || 0,
        Number(item.latestChapter) || 0
      );
      return {
        title,
        cover_url: comixImage(item.poster?.large || item.poster?.medium),
        synopsis: stripTags(item.synopsisHtml || item.synopsis),
        pub_status: comixStatus(item.status),
        total_chapters: chapters || null,
        format: comixFormat(item),
        genres: comixNames(item.genres),
        tags: comixNames(item.tags),
        contentRating: decode(item.contentRating),
        altTitles: comixAllTitles(item),
        detail_url: item.url ? COMIX_ORIGIN + item.url : "",
        comix_hid: decode(item.hid),
        type: "Comix"
      };
    })
    .filter(Boolean)
    .slice(0, 12);
}

export function parseComixDetail(payload) {
  const item = payload?.result || {};
  const chapters = Math.max(
    Number(item.finalChapter) || 0,
    Number(item.latestChapter) || 0
  );
  return {
    title: comixTitle(item),
    altTitles: comixAllTitles(item),
    cover_url: comixImage(item.poster?.large || item.poster?.medium),
    synopsis: stripTags(item.synopsisHtml || item.synopsis),
    pub_status: comixStatus(item.status),
    total_chapters: chapters || null,
    // Demographics are genres too. The shared mapper drops labels it does not
    // curate (e.g. Josei) but honors them if the user added a custom chip.
    genres: [...comixNames(item.genres), ...comixNames(item.demographics)],
    tags: comixNames(item.tags),
    contentRating: decode(item.contentRating),
    format: comixFormat(item),
    detail_url: item.url ? COMIX_ORIGIN + item.url : "",
    comix_hid: decode(item.hid),
    type: "Comix"
  };
}

const comixGet = async (message, path, referer) => {
  const url =
    COMIX_ORIGIN +
    "/api/v1" +
    path +
    (path.includes("?") ? "&" : "?") +
    "_=" +
    comixToken(message);
  const response = await fetch(url, {
    headers: { ...COMIX_HEADERS, Referer: referer },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Comix returned HTTP " + response.status);
  return decodeComixPayload(await response.text());
};

const searchComix = async (q) => {
  // The signature covers unencoded values; URLSearchParams only encodes the
  // request line sent over the wire.
  const message =
    "/manga?content_rating[0]=safe&content_rating[1]=suggestive&keyword=" +
    q +
    "&limit=28&order[relevance]=desc&page=1";
  const query = new URLSearchParams();
  query.set("order[relevance]", "desc");
  query.set("page", "1");
  query.set("limit", "28");
  query.append("content_rating[]", "safe");
  query.append("content_rating[]", "suggestive");
  query.set("keyword", q);
  const refererQuery = new URLSearchParams();
  refererQuery.set("q", q);
  const data = await comixGet(
    message,
    "/manga?" + query.toString(),
    COMIX_ORIGIN + "/browse?" + refererQuery.toString()
  );
  return parseComixResults(data);
};

const detailComix = async (params) => {
  const path = comixDetailPath(params);
  if (!path) return {};
  const requested = String(params.url || "").trim();
  const referer = /^https?:\/\//i.test(requested)
    ? requested
    : COMIX_ORIGIN +
      (requested.startsWith("/") ? requested : "/title/" + path.split("/").pop());
  const data = await comixGet(path, path, referer);
  return parseComixDetail(data);
};

/**
 * Scrape a real series page. Desktop originals expose h2.genre, .day_info and
 * episode rows; Canvas uses p.genre; the mobile page uses a summary link,
 * li.tag genres and a "#N in Genre" badge. Synopsis entities are decoded by
 * stripTags() and og:description is only a fallback.
 */
export function parseDetailHtml(html, requestedUrl = "") {
  const doc = String(html || "");
  const list = doc.match(/<ul[^>]+id="_listUl"[^>]*>([\s\S]*?)<\/ul>/i)?.[1] || "";
  const episodeSource = list || doc;
  const episodes = [
    ...episodeSource.matchAll(/data-episode-no="(\d+)"/gi),
    ...episodeSource.matchAll(
      /<span[^>]+class="[^"]*\btx\b[^"]*"[^>]*>\s*#(\d+)\s*<\/span>/gi
    )
  ].map((m) => Number(m[1]));
  const episodeLabel = stripTags(
    doc.match(/<span[^>]+class="[^"]*\bepisode_count\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]
  ).match(/(\d+)/)?.[1];
  const totalChapters =
    Math.max(0, ...episodes) || Number(episodeLabel || 0) || null;

  const dayInfo = stripTags(
    doc.match(/<p[^>]+class="[^"]*\bday_info\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i)?.[1]
  );
  const completedBadge =
    /\bCOMPLETED\b/i.test(dayInfo) ||
    /class="[^"]*\b(?:completed|complete)\b[^"]*"[^>]*>\s*(?:completed|complete)\s*</i.test(
      doc
    );
  const isCanvas =
    /class="[^"]*\bchallenge\b/i.test(doc) ||
    /\/canvas\/|\/challenge\//i.test(requestedUrl);
  const pubStatus = completedBadge
    ? "Completed"
    : /\bevery\b|\bup\b/i.test(dayInfo)
      ? "Ongoing"
      : isCanvas
        ? "Completed"
        : "";

  const uniq = (values) => {
    const out = [];
    for (const value of values.map(stripTags).filter(Boolean)) {
      if (!out.some((item) => item.toLowerCase() === value.toLowerCase())) {
        out.push(value);
      }
    }
    return out;
  };
  const infoArea =
    doc.match(
      /<div[^>]+class="[^"]*\binfo_area\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i
    )?.[1] || "";
  const tagBox =
    doc.match(
      /<ul[^>]+class="[^"]*\btag_box\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/i
    )?.[1] || "";
  const genres = uniq([
    ...[
      ...doc.matchAll(
        /<(?:h2|p)\b[^>]*\bclass="[^"]*\bgenre\b[^"]*"[^>]*>([\s\S]*?)<\/(?:h2|p)>/gi
      ),
      ...infoArea.matchAll(
        /<span\b[^>]*\bclass="[^"]*\bgenre\b[^"]*"[^>]*>([\s\S]*?)<\/span>/gi
      )
    ].map((m) => m[1]),
    // Mobile "Originals #2 in Horror" badge.
    doc.match(/class="[^"]*\bpoint\b[^"]*"[^>]*>\s*#\d+\s+in\s+([^<]+)/i)?.[1] || ""
  ]);
  // Only the series' own tag box; the mobile page repeats tags under recs.
  const tags = uniq([
    ...[
      ...tagBox.matchAll(/<li[^>]+class="[^"]*\btag\b[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)
    ].map((m) => m[1])
  ]);

  const synopsis = stripTags(
    doc.match(
      /<(?:p|a|div)\b[^>]*\bclass="[^"]*\bsummary\b[^"]*"[^>]*>([\s\S]*?)<\/(?:p|a|div)>/i
    )?.[1] ||
      meta(doc, "og:description") ||
      meta(doc, "twitter:description") ||
      meta(doc, "description")
  );

  const detailUrl = [
    meta(doc, "og:url"),
    requestedUrl
  ]
    .map(absoluteUrl)
    .find((url) => /webtoons\.com/i.test(url)) || "";
  const title =
    stripTags(
      doc.match(
        /<h[13][^>]+class="[^"]*\bsubj\b[^"]*"[^>]*>([\s\S]*?)<\/h[13]>/i
      )?.[1] ||
        doc.match(/<strong[^>]+class="[^"]*\bsubject\b[^"]*"[^>]*>([\s\S]*?)<\/strong>/i)?.[1]
    ) || meta(doc, "og:title");

  return {
    title,
    cover_url:
      absoluteImage(meta(doc, "og:image") || meta(doc, "twitter:image")),
    author:
      stripTags(
        doc.match(
          /<a[^>]+class="[^"]*\b(?:author|link_author)\b[^"]*"[^>]*>([\s\S]*?)<\/a>/i
        )?.[1]
      ) || meta(doc, "com-linewebtoon:webtoon:author"),
    genres,
    tags,
    synopsis,
    pub_status: pubStatus,
    total_chapters: totalChapters,
    webtoon_id:
      requestedUrl.match(/title_no=(\d+)/)?.[1] ||
      meta(doc, "al:android:url").match(/titleNo=(\d+)/)?.[1] ||
      "",
    webtoon_type: isCanvas ? "CANVAS" : "ORIGINAL",
    detail_url: detailUrl,
    type: "Webtoon"
  };
}

/** Prefer desktop data; use the mobile page only to fill what it omitted. */
export function mergeDetail(primary = {}, fallback = {}) {
  const uniq = (values) => {
    const out = [];
    for (const value of values.filter(Boolean)) {
      if (!out.some((item) => item.toLowerCase() === value.toLowerCase())) {
        out.push(value);
      }
    }
    return out;
  };
  return {
    ...primary,
    title: primary.title || fallback.title || "",
    cover_url: primary.cover_url || fallback.cover_url || "",
    author: primary.author || fallback.author || "",
    genres: uniq([...(primary.genres || []), ...(fallback.genres || [])]),
    tags: uniq([...(primary.tags || []), ...(fallback.tags || [])]),
    synopsis: primary.synopsis || fallback.synopsis || "",
    pub_status: primary.pub_status || fallback.pub_status || "",
    total_chapters: primary.total_chapters ?? fallback.total_chapters ?? null,
    webtoon_id: primary.webtoon_id || fallback.webtoon_id || "",
    webtoon_type: primary.webtoon_type || fallback.webtoon_type || "ORIGINAL",
    // The requested desktop URL is canonical; mobile og:url can be relative.
    detail_url: primary.detail_url || ""
  };
}

/** Swap www for m so a missing desktop description can be recovered. */
export function mobileDetailUrl(url = "") {
  try {
    const parsed = new URL(url);
    if (!/^www\.webtoons\.com$/i.test(parsed.hostname)) return "";
    parsed.hostname = "m.webtoons.com";
    return parsed.href;
  } catch {
    return "";
  }
}

/** Build a valid detail URL from a search row's id/type. Any slug redirects. */
export function detailUrlFor({ url, titleNo, type, title } = {}) {
  if (url) {
    const parsed = absoluteUrl(url);
    if (/^https:\/\/www\.webtoons\.com\/en\//i.test(parsed)) return parsed;
  }
  const id = String(titleNo || "").trim();
  if (!/^\d+$/.test(id)) return "";
  const path = String(type || "").toUpperCase() === "CANVAS" ? "canvas" : "detail";
  return ORIGIN + "/en/" + path + "/" + slug(title || "series") + "/list?title_no=" + id;
}

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.end(JSON.stringify(body));
};

const get = async (url, asJson = false) => {
  const response = await fetch(url, {
    headers: DETAIL_HEADERS,
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("WEBTOON returned HTTP " + response.status);
  return asJson ? response.json() : response.text();
};

const getImage = async (url) => {
  const upstream = encodeImageUrl(url);
  let parsed;
  try {
    parsed = new URL(upstream);
  } catch {
    throw new Error("Invalid image URL");
  }
  if (parsed.protocol !== "https:" || !IMAGE_HOSTS.test(parsed.hostname)) {
    throw new Error("Only WEBTOON cover images can be proxied");
  }
  const isComix = /(^|\.)comix\.to$/i.test(parsed.hostname);
  const baseHeaders = isComix ? COMIX_HEADERS : IMAGE_HEADERS;
  const response = await fetch(parsed.href, {
    headers: {
      ...baseHeaders,
      Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      Referer: isComix ? COMIX_ORIGIN + "/" : ORIGIN + "/"
    },
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Cover image returned HTTP " + response.status);
  return {
    type: response.headers.get("content-type") || "image/jpeg",
    bytes: Buffer.from(await response.arrayBuffer())
  };
};

const paramsOf = (req) => {
  if (req?.query && typeof req.query === "object") return req.query;
  try {
    return Object.fromEntries(
      new URL(req?.url || "", "http://localhost").searchParams
    );
  } catch {
    return {};
  }
};

export default async function handler(req, res) {
  const params = paramsOf(req);
  const isComix = String(params.source || "").toLowerCase() === "comix";

  if (isComix && !params.imageUrl) {
    if (params.url || params.slug) {
      try {
        return sendJson(res, 200, { result: await detailComix(params) });
      } catch (error) {
        console.warn("Comix detail lookup failed:", error.message);
        return sendJson(res, 200, { result: {} });
      }
    }
    const q = String(params.q || "").trim();
    if (!q) return sendJson(res, 200, { results: [] });
    try {
      return sendJson(res, 200, { results: await searchComix(q) });
    } catch (error) {
      console.warn("Comix search failed:", error.message);
      return sendJson(res, 200, { results: [] });
    }
  }

  if (params.imageUrl) {
    try {
      const image = await getImage(String(params.imageUrl));
      res.statusCode = 200;
      res.setHeader("Content-Type", image.type);
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.end(image.bytes);
    } catch (error) {
      return sendJson(res, 200, { result: {}, error: error.message });
    }
  }

  if (params.url || params.titleNo) {
    const url = detailUrlFor({
      url: params.url,
      titleNo: params.titleNo,
      type: params.type,
      title: params.title
    });
    if (!url) return sendJson(res, 200, { result: {} });
    try {
      const html = await get(url);
      let result = parseDetailHtml(html, url);
      // The consent gate or a sparse desktop page can omit the synopsis. The
      // mobile page also carries the series' own tags, which feed our chips.
      if (
        !result.synopsis ||
        !result.genres.length ||
        !result.total_chapters ||
        !result.tags?.length
      ) {
        const mobile = mobileDetailUrl(url);
        if (mobile) {
          try {
            const mobileHtml = await get(mobile);
            result = mergeDetail(result, parseDetailHtml(mobileHtml, mobile));
          } catch (error) {
            console.warn("WEBTOON mobile detail lookup failed:", error.message);
          }
        }
      }
      return sendJson(res, 200, { result });
    } catch (error) {
      console.warn("WEBTOON detail lookup failed:", error.message);
      return sendJson(res, 200, { result: {} });
    }
  }

  const q = String(params.q || "").trim();
  if (!q) return sendJson(res, 200, { results: [] });

  const encoded = encodeURIComponent(q);
  const [page, immediate] = await Promise.allSettled([
    get(ORIGIN + "/en/search?keyword=" + encoded),
    get(ORIGIN + "/en/search/immediate?keyword=" + encoded, true)
  ]);

  const results = mergeResults(
    page.status === "fulfilled" ? parseSearchHtml(page.value) : [],
    immediate.status === "fulfilled" ? parseImmediate(immediate.value) : []
  );
  return sendJson(res, 200, { results });
}
