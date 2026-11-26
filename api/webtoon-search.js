/**
 * Vercel serverless function: search WEBTOON Originals and Canvas titles.
 *
 * WEBTOON's immediate endpoint is JSON, but it often returns no hits for
 * apostrophes or long titles, so the full search page is parsed as well. The
 * two are merged and normalized for the client; no scraping happens in React.
 */

const ORIGIN = "https://www.webtoons.com";
const IMAGE_BASE = "https://webtoon-phinf.pstatic.net";
const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
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
  if (src.startsWith("/")) return IMAGE_BASE + src;
  return "";
};

const attr = (tag, name) =>
  tag.match(new RegExp("\\b" + name + "\\s*=\\s*\"([^\"]*)\"", "i"))?.[1] || "";

const normalizedResult = (row) => {
  const title = stripTags(row.title);
  if (!title) return null;
  return {
    title,
    cover_url: absoluteImage(row.cover_url),
    author: stripTags(row.author),
    genre: titleCase(row.genre),
    webtoon_id: String(row.webtoon_id || ""),
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
    out.push(
      normalizedResult({
        title: body.match(/<strong[^>]*class="title"[^>]*>([\s\S]*?)<\/strong>/i)?.[1],
        cover_url: body.match(/<img[^>]+src="([^"]+)"/i)?.[1],
        author: body.match(/<div[^>]*class="author"[^>]*>([\s\S]*?)<\/div>/i)?.[1],
        genre: path[1] || "",
        webtoon_id: attr(tag, "data-title-no") || match?.[1] || "",
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
    .map((row) =>
      normalizedResult({
        title: row.title,
        cover_url: row.thumbnailMobile || row.thumbnail,
        author: (row.authorNameList || [row.authorName]).filter(Boolean).join(" / "),
        genre: row.representGenre || "",
        webtoon_id: row.titleNo,
        synopsis: ""
      })
    )
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

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60");
  res.end(JSON.stringify(body));
};

const get = async (url, asJson = false) => {
  const response = await fetch(url, {
    headers: HEADERS,
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error("WEBTOON returned HTTP " + response.status);
  return asJson ? response.json() : response.text();
};

export default async function handler(req, res) {
  const query =
    (req.query && req.query.q) ||
    new URL(req.url || "", "http://localhost").searchParams.get("q") ||
    "";
  const q = String(query).trim();
  if (!q) return send(res, 200, { results: [] });

  const encoded = encodeURIComponent(q);
  const [immediate, page] = await Promise.allSettled([
    get(ORIGIN + "/en/search/immediate?keyword=" + encoded, true),
    get(ORIGIN + "/en/search?keyword=" + encoded)
  ]);

  const results = mergeResults(
    immediate.status === "fulfilled" ? parseImmediate(immediate.value) : [],
    page.status === "fulfilled" ? parseSearchHtml(page.value) : []
  );
  return send(res, 200, { results });
}
