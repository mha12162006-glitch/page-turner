/**
 * Vercel serverless function for WEBTOON search, full series details and cover
 * image proxying.
 *
 * WEBTOON search merges the compact JSON autocomplete endpoint with the full
 * /en/search HTML page, because apostrophes and long titles often return no
 * autocomplete hits. Selecting a result calls the detail mode below, which
 * scrapes the real series page server-side. The image mode also proxies any
 * public direct image URL so pasted, hotlink-protected covers still preview.
 */

const ORIGIN = "https://www.webtoons.com";
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

/** Keep the public image proxy from being used as an internal-network probe. */
const isPublicImageUrl = (url) => {
  if (!/^https?:$/i.test(url.protocol)) return false;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /\.(?:local|internal|test|invalid)$/.test(host)
  ) {
    return false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const [a, b, c] = host.split(".").map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113)
    ) {
      return false;
    }
  }
  // IPv6 loopback, link-local, unique-local and IPv4-mapped addresses.
  if (
    host.includes(":") &&
    /^(?:::1|::|f[cd]|fe[89ab]|::ffff:)/i.test(host)
  ) {
    return false;
  }
  return true;
};

const getImage = async (url) => {
  const upstream = encodeImageUrl(url);
  let parsed;
  try {
    parsed = new URL(upstream);
  } catch {
    throw new Error("Invalid image URL");
  }
  if (!isPublicImageUrl(parsed)) {
    throw new Error("Only public http(s) image URLs can be proxied");
  }
  const isWebtoon = /(^|\.)(?:pstatic\.net|webtoons\.com)$/i.test(
    parsed.hostname
  );
  const headers = isWebtoon
    ? {
        ...IMAGE_HEADERS,
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8"
      }
    : {
        "User-Agent": BROWSER_UA,
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
        Referer: parsed.origin + "/"
      };
  const response = await fetch(parsed.href, {
    headers,
    signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Cover image returned HTTP " + response.status);
  const type = response.headers.get("content-type") || "image/jpeg";
  if (!/^image\//i.test(type)) throw new Error("URL did not return an image");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > 8 * 1024 * 1024) throw new Error("Cover image is too large");
  return { type, bytes };
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
