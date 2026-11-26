import { joinTags, mapGenres, mapTropes, splitTags } from "./tags";
import { normalizeText } from "./textMatch";
import { joinWarnings, mapTagsToWarnings } from "./warnings";

const nameOf = (value) => {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  return String(
    value.name ?? value.title ?? value.attributes?.title ?? ""
  ).trim();
};

const customMatches = (labels, pool) => {
  const hay = normalizeText(pool);
  return splitTags(labels).filter((label) => {
    const needle = normalizeText(label);
    return !!needle && hay.includes(needle);
  });
};

/**
 * Shared auto-fill mapper for AniList, MangaUpdates and Kitsu selections.
 * Every built-in result is a curated label; custom chips come only from the
 * current user's saved list. Raw source sentences are never copied into chips.
 */
export function mapAutoFields({
  labels = [],
  tags = [],
  genres = [],
  synopsis = "",
  ageRating = "",
  isAdult = false,
  custom = {}
} = {}) {
  const names = [...labels, ...tags, ...genres].map(nameOf).filter(Boolean);
  const clean = String(synopsis || "");
  const pool = [...names, clean].join(" ");
  const found = {
    genres: mapGenres(names, clean),
    tags: mapTropes(names, clean),
    warnings: mapTagsToWarnings(
      tags,
      genres,
      isAdult,
      clean,
      ageRating
    ).join(", ")
  };
  if (custom) {
    found.genres = splitTags(
      joinTags([...found.genres, ...customMatches(custom.genres, pool)])
    );
    found.tags = splitTags(
      joinTags([...found.tags, ...customMatches(custom.tags, pool)])
    );
    found.warnings = joinWarnings([
      found.warnings,
      ...customMatches(custom.warnings, pool)
    ]);
  }
  return found;
}
