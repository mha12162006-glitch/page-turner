import { describe, expect, it } from "vitest";
import { countSpoilers, parseSpoilers } from "./spoilers";

describe("parseSpoilers", () => {
  it("splits plain text and bracketed spoilers", () => {
    expect(parseSpoilers("Before [the twist] after")).toEqual([
      { type: "text", value: "Before " },
      { type: "spoiler", value: "the twist" },
      { type: "text", value: " after" }
    ]);
  });

  it("keeps a spoiler together across line breaks", () => {
    expect(parseSpoilers("A [two\nlines] B")).toEqual([
      { type: "text", value: "A " },
      { type: "spoiler", value: "two\nlines" },
      { type: "text", value: " B" }
    ]);
  });

  it("leaves lone brackets and an empty pair as plain text", () => {
    expect(parseSpoilers("a [ b")).toEqual([{ type: "text", value: "a [ b" }]);
    expect(parseSpoilers("a ] b")).toEqual([{ type: "text", value: "a ] b" }]);
    expect(parseSpoilers("[]")).toEqual([{ type: "text", value: "[]" }]);
  });

  it("blurs only the innermost pair of nested brackets", () => {
    expect(parseSpoilers("[[secret]]")).toEqual([
      { type: "text", value: "[" },
      { type: "spoiler", value: "secret" },
      { type: "text", value: "]" }
    ]);
    expect(parseSpoilers("[outer [inner] outer]")).toEqual([
      { type: "text", value: "[outer " },
      { type: "spoiler", value: "inner" },
      { type: "text", value: " outer]" }
    ]);
  });

  it("does not turn brackets inside a link into a spoiler", () => {
    expect(parseSpoilers("Read https://example.com/a[b]c now")).toEqual([
      { type: "text", value: "Read https://example.com/a[b]c now" }
    ]);
    expect(parseSpoilers("https://example.com/a[b]c [real]")).toEqual([
      { type: "text", value: "https://example.com/a[b]c " },
      { type: "spoiler", value: "real" }
    ]);
  });

  it("finds every spoiler and leaves the original text intact", () => {
    const text = "One [first], two [second], and [third].";
    const tokens = parseSpoilers(text);
    expect(tokens.filter((token) => token.type === "spoiler")).toEqual([
      { type: "spoiler", value: "first" },
      { type: "spoiler", value: "second" },
      { type: "spoiler", value: "third" }
    ]);
    expect(
      tokens
        .map((token) =>
          token.type === "spoiler" ? "[" + token.value + "]" : token.value
        )
        .join("")
    ).toBe(text);
    expect(countSpoilers(text)).toBe(3);
  });

  it("handles empty input", () => {
    expect(parseSpoilers("")).toEqual([]);
    expect(parseSpoilers(null)).toEqual([]);
    expect(countSpoilers(undefined)).toBe(0);
  });
});
