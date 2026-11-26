export const WARNING_PRESETS = Object.freeze([
  "Violence",
  "Gore / Torture",
  "Implied S.A",
  "Explicit S.A",
  "Child / Domestic Abuse",
  "Suicide",
  "Self-Harm",
  "Bullying",
  "Nudity / Ecchi",
  "Drugs / Substance Abuse",
  "Cannibalism",
  "Body Horror",
  "Slavery",
  "War"
]);

const asArray = (value) =>
  Array.isArray(value) ? value : value == null ? [] : [value];

const tagName = (tag) =>
  typeof tag === "string" ? tag : tag && typeof tag.name === "string" ? tag.name : "";

const tagRank = (tag) =>
  typeof tag === "object" && tag !== null ? Number(tag.rank) : NaN;

const lower = (value) => String(value || "").trim().toLowerCase();

/**
 * Map AniList tag objects to the exact warning-box labels used by the drawer.
 * Only tags ranked 40+ count. Sexual-assault tags become "Explicit S.A" at
 * rank 60+, otherwise "Implied S.A". The result is always a subset of
 * WARNING_PRESETS: raw tag names and long descriptive sentences are never
 * copied into the warning chips.
 */
export function mapTagsToWarnings(tags = [], genres = [], isAdult = false) {
  const active = asArray(tags).filter((tag) => {
    const rank = tagRank(tag);
    return !!tagName(tag) && Number.isFinite(rank) && rank >= 40;
  });
  const names = active.map(tagName);
  const plainNames = names.filter(
    (name) => !/rape|sexual\s+(violence|assault|abuse)/i.test(name)
  );
  const plainHas = (re) => plainNames.some((name) => re.test(name));
  const genreNames = asArray(genres).map(lower);
  const found = new Set();

  const sexualRanks = active
    .filter((tag) => /rape|sexual\s+(violence|assault|abuse)/i.test(tagName(tag)))
    .map(tagRank);
  if (sexualRanks.length) {
    found.add(Math.max(...sexualRanks) >= 60 ? "Explicit S.A" : "Implied S.A");
  }

  if (plainHas(/violence|violent|brutality/i)) found.add("Violence");
  if (plainHas(/gore|torture/i)) found.add("Gore / Torture");
  if (
    plainNames.some(
      (name) => /abuse/i.test(name) && !/drug|substance|sexual/i.test(name)
    )
  ) {
    found.add("Child / Domestic Abuse");
  }
  if (plainHas(/suicid/i)) found.add("Suicide");
  if (plainHas(/self[-\s]?harm|self[-\s]?injur|self[-\s]?mutilat/i)) {
    found.add("Self-Harm");
  }
  if (plainHas(/bully|bullying|harassment/i)) found.add("Bullying");
  if (
    isAdult ||
    genreNames.some((genre) => /^(ecchi|hentai)$/.test(genre)) ||
    plainHas(/nudity|ecchi|sexual content|fan[-\s]?service/i)
  ) {
    found.add("Nudity / Ecchi");
  }
  if (plainHas(/drug|substance|alcohol|smoking|addiction|narcotic/i)) {
    found.add("Drugs / Substance Abuse");
  }
  if (plainHas(/cannibal/i)) found.add("Cannibalism");
  if (plainHas(/body horror/i)) found.add("Body Horror");
  if (plainHas(/slavery|slave/i)) found.add("Slavery");
  if (plainHas(/\bwar\b|\bwarfare\b|armed conflict|military conflict/i)) {
    found.add("War");
  }

  return WARNING_PRESETS.filter((label) => found.has(label));
}

const LEGACY_WARNINGS = {
  sexualviolencepossiblyimplied: ["Implied S.A"],
  sexualviolencelikelyexplicit: ["Explicit S.A"],
  goretorture: ["Gore / Torture"],
  abuse: ["Child / Domestic Abuse"],
  suicideselfharm: ["Suicide", "Self-Harm"],
  nudity: ["Nudity / Ecchi"]
};

const warningKey = (value) => lower(value).replace(/[^a-z0-9]/g, "");

/**
 * Read old or new warning strings without keeping invented ages or the old
 * "None listed" placeholder.
 */
export function parseWarnings(value) {
  const out = [];
  const add = (label) => {
    const clean = String(label || "").trim();
    if (clean && !out.some((item) => warningKey(item) === warningKey(clean))) {
      out.push(clean);
    }
  };
  for (const raw of asArray(value).flatMap((item) =>
    Array.isArray(item) ? item : String(item ?? "").split(/[,\n]/)
  )) {
    const label = String(raw || "")
      .replace(/\s*·?\s*Est\.\s*\d+\+?/gi, "")
      .trim();
    if (!label || /^none listed\b/i.test(label) || /^est\.?\s*\d+\+?$/i.test(label)) {
      continue;
    }
    const legacy = LEGACY_WARNINGS[warningKey(label)];
    if (legacy) legacy.forEach(add);
    else add(label);
  }
  return out;
}

export const warningList = parseWarnings;

export const joinWarnings = (value) => parseWarnings(value).join(", ");

export function toggleWarning(value, label) {
  const list = parseWarnings(value);
  const exists = list.some((item) => warningKey(item) === warningKey(label));
  return (exists
    ? list.filter((item) => warningKey(item) !== warningKey(label))
    : [...list, label]
  ).join(", ");
}
