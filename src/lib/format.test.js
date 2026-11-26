import { describe, expect, it } from "vitest";
import { detectFormat, FORMATS } from "./util";

describe("category detection", () => {
  it("offers the five clean categories", () => {
    expect(FORMATS).toEqual(["Manhwa", "Manga", "Manhua", "Webtoon", "Comic"]);
  });

  it("keeps the existing country mapping", () => {
    expect(detectFormat({ country: "KR" })).toBe("Manhwa");
    expect(detectFormat({ country: "CN" })).toBe("Manhua");
    expect(detectFormat({ country: "TW" })).toBe("Manhua");
    expect(detectFormat({ country: "JP" })).toBe("Manga");
  });

  it("maps MangaUpdates types and Kitsu subtypes", () => {
    expect(detectFormat({ type: "Webtoon" })).toBe("Webtoon");
    expect(detectFormat({ type: "OEL" })).toBe("Comic");
    expect(detectFormat({ type: "Western" })).toBe("Comic");
    expect(detectFormat({ subtype: "comic" })).toBe("Comic");
    expect(detectFormat({ subtype: "oel", labels: ["Webtoon"] })).toBe("Webtoon");
    expect(detectFormat({ subtype: "manhwa", country: "KR" })).toBe("Manhwa");
    expect(detectFormat({ subtype: "manhua", country: "TW" })).toBe("Manhua");
  });
});
