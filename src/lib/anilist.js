import { norm } from "./util";

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
  " countryOfOrigin genres tags{name isMediaSpoiler} ",
  "description(asHtml:false) status}}}"
].join("");

const DETAIL_QUERY = [
  "query($id:Int){Media(id:$id){chapters status ",
  "description(asHtml:false) genres isAdult ",
  "tags{name rank isMediaSpoiler} externalLinks{url type} ",
  "characters(role:MAIN,perPage:8){nodes{name{full} image{large}}}}}"
].join("");

const CHARS_QUERY = [
  "query($id:Int,$p:Int){Media(id:$id){",
  "characters(page:$p,perPage:50,sort:RELEVANCE){",
  " pageInfo{hasNextPage} nodes{name{full alternative} image{large}}}}}"
].join("");

export async function searchAniList(q) {
  const r = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { s: q } })
  });
  return (await r.json()).data.Page.media.map((m) => ({
    anilist_id: m.id,
    pub_status:
      {
        FINISHED: "Completed",
        RELEASING: "Ongoing",
        NOT_YET_RELEASED: "Not yet released",
        CANCELLED: "Discontinued",
        HIATUS: "On hiatus"
      }[m.status] || "",
    title: m.title.english || m.title.romaji,
    cover_url: m.coverImage.large,
    format:
      m.countryOfOrigin === "KR"
        ? "Manhwa"
        : ["CN", "TW", "HK"].includes(m.countryOfOrigin)
          ? "Manhua"
          : "Manga",
    genres: m.genres,
    tags: m.tags.filter((t) => !t.isMediaSpoiler).slice(0, 6).map((t) => t.name),
    synopsis: cleanSyn(m.description)
  }));
}

export async function anilistDetail(id) {
  const r = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: DETAIL_QUERY, variables: { id } })
  });
  const m = (await r.json()).data.Media;
  const tags = m.tags || [];
  const find = (re) => tags.find((t) => re.test(t.name));
  const out = [];
  const sv = find(/rape|sexual (abuse|violence|assault)/i);
  if (sv) {
    out.push("Sexual violence (" + (sv.rank >= 60 ? "likely explicit" : "possibly implied") + ")");
  }
  [
    ["Gore/torture", /gore|torture/i],
    ["Abuse", /^(?!.*sexual).*abuse/i],
    ["Suicide/self-harm", /suicide|self.?harm/i],
    ["Bullying", /bullying/i],
    ["Nudity", /nudity/i]
  ].forEach(([l, re]) => {
    if (find(re)) out.push(l);
  });
  const adult = m.isAdult || m.genres.includes("Hentai");
  const mature =
    sv || find(/gore|torture|nudity|suicide|abuse/i) || m.genres.includes("Ecchi");
  const link = (m.externalLinks || []).find((l) => l.type === "STREAMING");
  return {
    synopsis: cleanSyn(m.description),
    genres: m.genres,
    tags: tags.filter((t) => !t.isMediaSpoiler).slice(0, 6).map((t) => t.name),
    total_chapters: m.status === "FINISHED" ? m.chapters || null : null,
    warnings:
      (out.join(", ") || "None listed") +
      " · Est. " +
      (adult ? "18+" : mature ? "16+" : "13+"),
    read_url: link ? link.url : "",
    chars: (m.characters?.nodes || []).map((n) => ({
      name: n.name.full,
      image_url: n.image?.large || "",
      comment: ""
    }))
  };
}

export async function anilistAllChars(id) {
  let out = [];
  let page = 1;
  let more = true;
  while (more && page <= 4) {
    const r = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: CHARS_QUERY,
        variables: { id, p: page }
      })
    });
    const c = (await r.json()).data.Media.characters;
    out = out.concat(c.nodes);
    more = c.pageInfo.hasNextPage;
    page++;
  }
  return out.map((n) => ({
    name: n.name.full,
    alt: n.name.alternative || [],
    image_url: n.image?.large || ""
  }));
}

export async function enrich(base) {
  const r = { ...base };
  let chars = [];
  try {
    let id = r.anilist_id;
    let b = {};
    if (!id) {
      const m = (await searchAniList(r.title))[0];
      const rn = norm(r.title);
      if (m && (norm(m.title).includes(rn) || rn.includes(norm(m.title)))) {
        id = m.anilist_id;
        b = m;
      }
    }
    if (id) {
      const d = await anilistDetail(id);
      r.anilist_id = id;
      r.cover_url = r.cover_url || b.cover_url || "";
      r.synopsis = r.synopsis || b.synopsis || d.synopsis || "";
      r.pub_status = r.pub_status || b.pub_status || "";
      if (!(r.genres && r.genres.length)) r.genres = d.genres;
      if (!(r.tags && r.tags.length)) r.tags = d.tags;
      r.warnings = r.warnings || d.warnings;
      r.total_chapters = r.total_chapters ?? d.total_chapters;
      r.read_url = r.read_url || d.read_url;
      chars = d.chars;
    }
  } catch (e) {}
  return { row: r, chars };
}
