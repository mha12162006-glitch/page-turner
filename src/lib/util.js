export const STATUS = [
  ["reading", "Reading"],
  ["want", "Want to Read"],
  ["hiatus", "Read on Hiatus"],
  ["dropped", "Dropped"],
  ["done", "Completed"]
];

export const FORMATS = ["Manhwa", "Manga", "Manhua"];

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
  notes: "",
  rating: null,
  review: "",
  pub_status: "",
  chapter: null,
  total_chapters: null,
  read_url: ""
};

export const emptyF = { q: "", format: "", tag: "", source: "", top: false };

export const norm = (t) => (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const same = (a, b) =>
  (a.anilist_id && a.anilist_id === b.anilist_id) ||
  (norm(a.title) !== "" && norm(a.title) === norm(b.title));

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
      (!f.q || i.title.toLowerCase().includes(f.q.toLowerCase())) &&
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
    "on-hold": "want",
    dropped: "want",
    "1": "reading",
    "2": "done",
    "3": "want",
    "4": "want",
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
        notes: g("my_comments") || null,
        tags: held ? ["MAL: On-Hold"] : drop ? ["MAL: Dropped"] : [],
        position: i
      };
    })
    .filter((r) => r.title);
  return { rows, anime: doc.getElementsByTagName("anime").length };
}
