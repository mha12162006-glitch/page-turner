export const STATUS = [
  ["reading", "Reading"],
  ["want", "Want to Read"],
  ["hiatus", "Read on Hiatus"],
  ["dropped", "Dropped"],
  ["done", "Completed"]
];

export const FORMATS = ["Manhwa", "Manga", "Manhua", "Webtoon", "Comic"];

const asText = (v) => String(v ?? "").trim();
const hasWebtoonLabel = (labels = []) =>
  (Array.isArray(labels) ? labels : [labels]).some((label) =>
    /web\s*toon/i.test(asText(label))
  );

/**
 * Category detection shared by MangaUpdates and Kitsu results. An explicit
 * Webtoon tag wins over a broad OEL/Western label; country codes keep the
 * existing KR/CN/TW/JP behaviour intact.
 */
export function detectFormat({ type, subtype, country, labels = [] } = {}) {
  const raw = [type, subtype, country].map(asText).join(" ").toLowerCase();
  if (hasWebtoonLabel(labels) || /web\s*toon/.test(raw)) return "Webtoon";
  if (/\b(oel|western|comics?)\b/.test(raw)) return "Comic";
  if (/manhwa|korea|\bkr\b/.test(raw)) return "Manhwa";
  if (/manhua|china|taiwan|hong kong|\bcn\b|\btw\b|\bhk\b/.test(raw)) {
    return "Manhua";
  }
  if (/manga|japan|\bjp\b/.test(raw)) return "Manga";
  return "";
}

export const PUB = [
  "Ongoing",
  "Completed",
  "On hiatus",
  "Permanent hiatus",
  "Discontinued",
  "Not yet released"
];

export const TABS = [
  ...STATUS.slice(0, 3),
  ["recs", "Friend Recommend"],
  ...STATUS.slice(3)
];

export const STAT = Object.fromEntries(STATUS);

export const blank = {
  title: "",
  cover_url: "",
  format: "Manhwa",
  genres: [],
  synopsis: "",
  status: "want",
  excitement: 0,
  priority: false,
  source: "",
  media: [],
  tags: [],
  warnings: "",
  rating: null,
  review: "",
  pub_status: "",
  chapter: null,
  total_chapters: null,
  read_url: "",
  is_hidden: false
};

export const emptyF = { format: "", tag: "", source: "", top: false };

export const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const aid = (x) =>
  x && x.anilist_id != null && x.anilist_id !== ""
    ? String(x.anilist_id)
    : "";

export const same = (a, b) => {
  if (!a || !b) return false;
  const aa = aid(a);
  return (
    (!!aa && aa === aid(b)) ||
    (norm(a.title) !== "" && norm(a.title) === norm(b.title))
  );
};

export const isHttp = (u) => /^https?:\/\//i.test((u || "").trim());
export const httpUrl = (u) => (isHttp(u) ? u.trim() : "");

/**
 * Build the same-origin proxy URL for any direct image. This is used as the
 * fallback when a pasted cover rejects a plain browser <img> request.
 */
export const imageProxyUrl = (u) => {
  const url = httpUrl(u);
  if (!url || typeof window === "undefined") return url;
  return (
    window.location.origin +
    "/api/webtoon-search?imageUrl=" +
    encodeURIComponent(url)
  );
};

/**
 * WEBTOON's CDN answers browser <img> requests without the headers it expects.
 * Rewrite those covers up front; other pasted URLs try the browser first and
 * fall back to imageProxyUrl() only if the image fails. Already-proxied URLs
 * are left alone. In Node tests (no window) the source URL is untouched.
 */
const isProxiedCover = (value) =>
  /\/api\/webtoon-search\?imageUrl=/i.test(String(value || ""));

export const proxyCover = (u) => {
  const raw = String(u ?? "").trim();
  if (isProxiedCover(raw)) return raw;
  const url = httpUrl(raw);
  if (!url || typeof window === "undefined") return url;
  if (!/pstatic\.net|webtoons\.com/i.test(url)) return url;
  return imageProxyUrl(url);
};

/** Never let an autocomplete placeholder become a saved synopsis. */
export const isPlaceholderSynopsis = (value) =>
  /a\s+webtoon\s+made\s+by[\s-]*-+/i.test(String(value ?? ""));

const charKey = (c) =>
  [norm(c.name), (c.image_url || "").trim(), (c.comment || "").trim()].join("|");

export const sameChars = (a = [], b = []) =>
  a.length === b.length && a.every((c, i) => charKey(c) === charKey(b[i]));

export const statusLabel = (s) => STAT[s] || "on your list";

export const relWith = (rows, me, uid) => {
  const f = rows.find(
    (r) =>
      (r.requester === me && r.addressee === uid) ||
      (r.addressee === me && r.requester === uid)
  );
  return f ? { ...f, dir: f.requester === me ? "out" : "in" } : null;
};

export const arr = (s) =>
  (s || "")
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

export const num = (v) => (v === "" || v == null ? null : Number(v));

export const isImg = (u) =>
  /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u) ||
  /pinimg|googleusercontent|gstatic/.test(u);

export const applyF = (items, f) =>
  items.filter(
    (i) =>
      (!f.format || i.format === f.format) &&
      (!f.tag || (i.tags || []).includes(f.tag)) &&
      (!f.source || i.source === f.source) &&
      (!f.top || i.priority)
  );

export function resizeImg(file) {
  return new Promise((ok, no) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      const n = 256;
      const m = Math.min(img.width, img.height);
      c.width = c.height = n;
      c.getContext("2d").drawImage(
        img,
        (img.width - m) / 2,
        (img.height - m) / 2,
        m,
        m,
        0,
        0,
        n,
        n
      );
      ok(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = no;
    img.src = URL.createObjectURL(file);
  });
}

export async function readMalFile(file) {
  const buf = await file.arrayBuffer();
  const b = new Uint8Array(buf);
  if (b[0] === 0x1f && b[1] === 0x8b) {
    return new Response(
      new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))
    ).text();
  }
  return new TextDecoder().decode(buf);
}

export function malImport(xml, uid) {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const map = {
    reading: "reading",
    completed: "done",
    "plan to read": "want",
    "on-hold": "hiatus",
    dropped: "dropped",
    "1": "reading",
    "2": "done",
    "3": "hiatus",
    "4": "dropped",
    "6": "want"
  };
  const rows = [...doc.getElementsByTagName("manga")]
    .map((n, i) => {
      const g = (t) => n.getElementsByTagName(t)[0]?.textContent?.trim() || "";
      const raw = g("my_status").toLowerCase();
      const st = map[raw] || "want";
      const sc = Number(g("my_score"));
      const held = ["on-hold", "3"].includes(raw);
      const drop = ["dropped", "4"].includes(raw);
      return {
        user_id: uid,
        title: g("manga_title") || g("series_title"),
        format: "Manga",
        status: st,
        rating: st === "done" && sc > 0 ? sc : null,
        tags: held ? ["MAL: On-Hold"] : drop ? ["MAL: Dropped"] : [],
        position: i
      };
    })
    .filter((r) => r.title);
  return { rows, anime: doc.getElementsByTagName("anime").length };
}
