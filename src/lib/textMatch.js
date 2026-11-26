/** Normalize source text for comparisons: lowercase, alphanumeric words only. */
export const normalizeText = (value) =>
  String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const distance = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(
        next[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = next;
  }
  return prev[b.length];
};

const close = (word, term) => {
  if (word === term) return true;
  const length = Math.max(word.length, term.length);
  // Short words are too ambiguous to fuzz; longer ones allow one or two typos.
  if (length < 5) return false;
  return distance(word, term) <= (length >= 9 ? 2 : 1);
};

/**
 * Exact substring first, then typo-tolerant word/phrase matching. Phrases keep
 * word order so "contract marriage" cannot match an unrelated "marriage contract
 * dispute" several sentences later.
 */
export function fuzzyHas(text, term) {
  const hay = normalizeText(text);
  const needle = normalizeText(term);
  if (!needle) return false;
  if (hay.includes(needle)) return true;
  const needles = needle.split(" ").filter(Boolean);
  const words = hay.split(" ").filter(Boolean);
  let cursor = 0;
  return needles.every((part) => {
    const index = words.findIndex(
      (word, i) => i >= cursor && close(word, part)
    );
    if (index < 0) return false;
    cursor = index + 1;
    return true;
  });
}

export const fuzzyAny = (text, terms = []) =>
  (terms || []).some((term) => fuzzyHas(text, term));
