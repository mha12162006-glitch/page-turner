export const GENRE_PRESETS = Object.freeze([
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Fantasy",
  "Horror",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Supernatural",
  "Thriller"
]);

export const TROPE_PRESETS = Object.freeze([
  "Isekai",
  "Reincarnation / Regression",
  "Villainess",
  "Murim / Martial Arts",
  "System / Dungeons",
  "Contract Marriage",
  "Historical / Royalty"
]);

const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const key = (value) => String(value || "").trim().toLowerCase();

const nameOf = (tag) =>
  typeof tag === "string" ? tag : tag && typeof tag.name === "string" ? tag.name : "";

export const splitTags = (value) =>
  asArray(value)
    .flatMap((item) => (Array.isArray(item) ? item : String(item ?? "").split(/[,\n]/)))
    .map((item) => String(item || "").trim())
    .filter(Boolean);

export const joinTags = (value) => {
  const out = [];
  for (const item of splitTags(value)) {
    if (!out.some((x) => key(x) === key(item))) out.push(item);
  }
  return out.join(", ");
};

export function toggleTag(value, label) {
  const list = splitTags(value);
  const exists = list.some((item) => key(item) === key(label));
  return (exists
    ? list.filter((item) => key(item) !== key(label))
    : [...list, label]
  ).join(", ");
}

export function mapGenres(genres = []) {
  const found = new Set(
    asArray(genres)
      .map(key)
      .filter(Boolean)
  );
  return GENRE_PRESETS.filter((genre) => found.has(key(genre)));
}

const TROPE_MATCHERS = [
  ["Isekai", /^isekai$/i],
  [
    "Reincarnation / Regression",
    /reincarnation|reincarnated|regression|second chance/i
  ],
  ["Villainess", /villainess|villainous female lead/i],
  ["Murim / Martial Arts", /murim|martial arts|martial artist|wuxia/i],
  ["System / Dungeons", /dungeon|system|litrpg|game elements|leveling/i],
  ["Contract Marriage", /contract marriage|fake marriage|marriage of convenience/i],
  [
    "Historical / Royalty",
    /historical|royalty|royal affairs|nobility|monarchy|kingdom/i
  ]
];

export function mapTropes(tags = []) {
  const names = asArray(tags)
    .filter(
      (tag) =>
        typeof tag === "string" ||
        (tag && !tag.isMediaSpoiler && typeof tag.name === "string")
    )
    .map(nameOf)
    .filter(Boolean);
  return TROPE_PRESETS.filter((label) => {
    const matcher = TROPE_MATCHERS.find(([name]) => name === label);
    return !!matcher && names.some((name) => matcher[1].test(name));
  });
}
