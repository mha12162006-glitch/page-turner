const SPOILER = /\[([^\[\]]+)\]/g;
const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/**
 * Split review text into plain-text and spoiler tokens.
 *
 * The only markup is [spoiler]. Unmatched brackets and "[]" stay plain, a
 * nested pair blurs its innermost content, and bracketed parts of a raw URL
 * are left alone so links are not broken.
 */
export function parseSpoilers(input) {
  const text = String(input ?? "");
  if (!text) return [];

  const links = [];
  const linkRe = new RegExp(LINK.source, LINK.flags);
  let link;
  while ((link = linkRe.exec(text))) {
    links.push([link.index, link.index + link[0].length]);
  }

  const tokens = [];
  const spoilerRe = new RegExp(SPOILER.source, SPOILER.flags);
  let last = 0;
  let match;
  while ((match = spoilerRe.exec(text))) {
    const start = match.index;
    const end = start + match[0].length;
    if (links.some(([from, to]) => start >= from && end <= to)) continue;
    if (start > last) {
      tokens.push({ type: "text", value: text.slice(last, start) });
    }
    tokens.push({ type: "spoiler", value: match[1] });
    last = end;
  }
  if (last < text.length) {
    tokens.push({ type: "text", value: text.slice(last) });
  }
  return tokens;
}

export const countSpoilers = (input) =>
  parseSpoilers(input).filter((token) => token.type === "spoiler").length;
