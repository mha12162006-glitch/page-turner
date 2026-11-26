import { fuzzyAny } from "./textMatch";

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
 * Map source metadata to the exact warning-box labels used by the drawer.
 * Ranked AniList tags still work as before; MangaUpdates/Kitsu labels are
 * supplied with a synthetic rank. Synopsis text and age ratings add keyword
 * matches (blood, murder, neglect, stalking, R18, ...). The result is always a
 * subset of WARNING_PRESETS: raw sentences are never copied into the chips.
 */
export function mapTagsToWarnings(
  tags = [],
  genres = [],
  isAdult = false,
  synopsis = "",
  ageRating = ""
) {
  const active = asArray(tags).filter((tag) => {
    const rank = tagRank(tag);
    return !!tagName(tag) && Number.isFinite(rank) && rank >= 40;
  });
  const names = active.map(tagName);
  const sexualRe = /rape|sexual\s+(?:violence|assault|abuse)/i;
  const plainNames = names.filter((name) => !sexualRe.test(name));
  const plainHas = (re) => plainNames.some((name) => re.test(name));
  const genreNames = asArray(genres).map(lower);
  const text = String(synopsis || "").toLowerCase();
  const rating = lower(ageRating);
  // Ignore negated clauses such as "no explicit or implied sexual violence".
  const positiveParts = text
    .split(/[.!?;]+/)
    .map((part) => part.trim())
    .filter(
      (part) =>
        !!part &&
        !/\b(?:no|not|without|free (?:of|from)|does not|doesn't)\b/.test(part)
    );
  const textHas = (re) => positiveParts.some((part) => re.test(part));
  // Typos such as "violnce" or "reincarnation" variants still map to a chip.
  const fuzzyHas = (terms) =>
    [...plainNames, ...genreNames, ...positiveParts].some((part) =>
      fuzzyAny(part, terms)
    );
  const has = (re, terms = []) =>
    plainHas(re) ||
    genreNames.some((name) => re.test(name)) ||
    textHas(re) ||
    fuzzyHas(terms);
  const found = new Set();

  const sexualRanks = active
    .filter((tag) => sexualRe.test(tagName(tag)))
    .map(tagRank);
  if (sexualRanks.length) {
    found.add(Math.max(...sexualRanks) >= 60 ? "Explicit S.A" : "Implied S.A");
  } else if (textHas(sexualRe) || fuzzyHas(["sexual violence"])) {
    found.add("Implied S.A");
  }

  if (
    has(
      /\bviolence\b|\bviolent\b|\bbrutal(?:ity)?\b|\bblood(?:y|y[-\s]?soaked)?\b|\bmurder(?:s|ed|ous)?\b|\bkill(?:ing|ed|s)?\b|stalk(?:ing|er)|kidnap(?:ping|ped)?|abduction/i,
      ["violence", "violent", "brutality", "blood", "murder", "killing", "stalking", "kidnapping"]
    )
  ) {
    found.add("Violence");
  }
  if (
    has(/gore|gory|torture|dismember|mutilat/i, [
      "gore",
      "torture",
      "dismemberment",
      "mutilation"
    ])
  ) {
    found.add("Gore / Torture");
  }
  if (
    plainNames.some(
      (name) => /abuse|neglect/i.test(name) && !/drug|substance|sexual/i.test(name)
    ) ||
    genreNames.some((name) => /abuse|neglect/i.test(name)) ||
    positiveParts.some(
      (part) =>
        /abuse|neglect/i.test(part) && !/drug|substance|sexual/i.test(part)
    ) ||
    fuzzyHas(["abuse", "neglect"])
  ) {
    found.add("Child / Domestic Abuse");
  }
  if (has(/suicid/i, ["suicide", "suicidal"])) found.add("Suicide");
  if (
    has(/self[-\s]?harm|self[-\s]?injur|self[-\s]?mutilat|\bcutting\b/i, [
      "self harm",
      "self injury",
      "self mutilation",
      "cutting"
    ])
  ) {
    found.add("Self-Harm");
  }
  if (
    has(
      /bully|bullying|harassment|underdog|remind[^.!?;]*faults/i,
      ["bullying", "harassment", "underdog", "underdog story"]
    )
  ) {
    found.add("Bullying");
  }
  if (
    isAdult ||
    genreNames.some((genre) => /^(ecchi|hentai)$/.test(genre)) ||
    /r18|adults? only|mature 17/.test(rating) ||
    has(/nudity|ecchi|sexual content|fan[-\s]?service/i, [
      "nudity",
      "ecchi",
      "fan service"
    ])
  ) {
    found.add("Nudity / Ecchi");
  }
  if (
    has(/drug|substance|alcohol|smoking|addiction|narcotic/i, [
      "drugs",
      "substance abuse",
      "alcohol",
      "addiction",
      "narcotics"
    ])
  ) {
    found.add("Drugs / Substance Abuse");
  }
  if (has(/cannibal/i, ["cannibalism", "cannibal"])) found.add("Cannibalism");
  if (has(/body horror/i, ["body horror"])) found.add("Body Horror");
  if (has(/slavery|slave/i, ["slavery", "slave"])) found.add("Slavery");
  if (
    has(/\bwar\b|\bwarfare\b|armed conflict|military conflict/i, [
      "warfare",
      "armed conflict",
      "military conflict"
    ])
  ) {
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
