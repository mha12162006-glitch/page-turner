import { fuzzyAny } from "./textMatch";

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

const GENRE_MATCHERS = {
  Action: /\baction\b|\bcombat\b|\bfight(?:ing)?\b/i,
  Adventure: /\badventure\b|\bquest\b/i,
  Comedy: /\bcom(?:edy|ic)\b|\bhumo(?:u)?r\b/i,
  Drama: /\bdrama(?:tic)?\b/i,
  Fantasy: /\bfantasy\b|\bmagic(?:al)?\b/i,
  Horror: /\bhorror\b|\bcreepy\b/i,
  Mystery: /\bmystery\b|\bmysterious\b/i,
  Psychological: /psychological|psychology|trauma|dark themes?|\bmental(?:ly)?\b/i,
  Romance: /\bromance\b|\bromantic\b|\blove story\b/i,
  "Sci-Fi": /\bsci[-\s]?fi\b|\bscience fiction\b|\bspace\b/i,
  "Slice of Life": /\bslice of life\b|\beveryday life\b/i,
  Supernatural: /\bsupernatural\b|\bghosts?\b|\bspirits?\b/i,
  Thriller: /\bthriller\b|\bsuspense\b/i
};

const TROPE_MATCHERS = [
  [
    "Isekai",
    /isekai|transported (?:to|into) (?:another|a different) world|another world/i,
    ["isekai", "another world"]
  ],
  [
    "Reincarnation / Regression",
    /reincarnat|reborn|rebirth|regress(?:ion|or|ed)?|time[-\s]?travel|time[-\s]?loop|second chance|past life|previous life|life reset/i,
    [
      "reincarnation",
      "reincarnated",
      "regression",
      "regressor",
      "reborn",
      "rebirth",
      "time travel",
      "time loop",
      "second chance",
      "past life",
      "previous life"
    ]
  ],
  ["Villainess", /villainess|villainous (?:female|hero)ine|female villain/i, ["villainess", "female villain"]],
  [
    "Murim / Martial Arts",
    /murim|martial arts?|martial artist|wuxia|swordsman|sword master/i,
    ["murim", "martial arts", "wuxia", "swordsman"]
  ],
  [
    "System / Dungeons",
    /dungeon|system|litrpg|game elements?|level(?:ing|\s?up)?|tower|hunter|guild/i,
    ["dungeon", "system", "litrpg", "leveling", "tower", "hunter", "guild"]
  ],
  [
    "Contract Marriage",
    /contract marriage|arranged marriage|fake marriage|marriage of convenience|political marriage|pretend marriage/i,
    ["contract marriage", "arranged marriage", "fake marriage", "marriage of convenience", "political marriage"]
  ],
  [
    "Historical / Royalty",
    /historical|royalt(?:y|ies)|royal|nobilit(?:y|ies)|\bnoble|monarch|kingdom|empire|emperor|empress|prince(?:ss)?|aristocrat|(?:royal|imperial|noble) academy/i,
    ["historical", "royalty", "royal", "nobility", "noble", "monarch", "kingdom", "empire", "emperor", "empress", "prince", "princess", "aristocrat"]
  ]
];

const tropeHit = (part, matcher) =>
  matcher[1].test(part) || fuzzyAny(part, matcher[2]);

/** Genres are matched exactly, then by small keyword synonyms in synopses. */
export function mapGenres(genres = [], synopsis = "") {
  const names = asArray(genres).map(nameOf).filter(Boolean);
  const text = String(synopsis || "");
  return GENRE_PRESETS.filter((genre) => {
    if (names.some((name) => key(name) === key(genre))) return true;
    const matcher = GENRE_MATCHERS[genre];
    return !!matcher && (names.some((name) => matcher.test(name)) || matcher.test(text));
  });
}

/**
 * Tropes come from tag/category names and from synopsis keywords. Every result
 * is one of TROPE_PRESETS; raw source phrases are never copied into the chips.
 */
export function mapTropes(tags = [], synopsis = "") {
  const names = asArray(tags)
    .filter(
      (tag) =>
        typeof tag === "string" ||
        (tag && !tag.isMediaSpoiler && typeof tag.name === "string")
    )
    .map(nameOf)
    .filter(Boolean);
  const pool = [...names, String(synopsis || "")];
  return TROPE_PRESETS.filter((label) => {
    const matcher = TROPE_MATCHERS.find(([name]) => name === label);
    return !!matcher && pool.some((part) => tropeHit(part, matcher));
  });
}
