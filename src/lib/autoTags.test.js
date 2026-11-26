import { describe, expect, it } from "vitest";
import { mapAutoFields } from "./autoTags";
import { GENRE_PRESETS, TROPE_PRESETS } from "./tags";
import { WARNING_PRESETS } from "./warnings";

describe("shared auto-fill mapping", () => {
  it("maps MangaUpdates labels and description into all three chip sections", () => {
    const mapped = mapAutoFields({
      labels: ["Action", "Violence", "Isekai"],
      genres: ["Action", "Violence", "Isekai"],
      synopsis:
        "A western webtoon about a cursed knight who survives brutal murders and blood."
    });
    expect(mapped.genres).toEqual(["Action"]);
    expect(mapped.tags).toEqual(["Isekai"]);
    expect(mapped.warnings).toBe("Violence");
  });

  it("maps Kitsu categories, synopsis and ageRating into all three chip sections", () => {
    const mapped = mapAutoFields({
      labels: [
        "Isekai",
        "Reincarnation",
        "Action",
        "Fantasy",
        "Violence",
        "War"
      ],
      genres: ["Action", "Fantasy"],
      synopsis: "An emperor reborn as a child; dungeons and a brutal war.",
      ageRating: "R18"
    });
    expect(mapped.genres).toEqual(["Action", "Fantasy"]);
    expect(mapped.tags).toEqual([
      "Isekai",
      "Reincarnation / Regression",
      "System / Dungeons",
      "Historical / Royalty"
    ]);
    expect(mapped.warnings).toBe("Violence, Nudity / Ecchi, War");
  });

  it("ignores negated warning phrases", () => {
    const mapped = mapAutoFields({
      synopsis: "No sexual violence or self-harm appears in this gentle story."
    });
    expect(mapped.warnings).toBe("");
  });

  it("matches typo-tolerant sources without inventing new chips", () => {
    const mapped = mapAutoFields({
      synopsis:
        "An isekaii story with a systm and a contrct marrige; the vilence and stalkng continue."
    });
    expect(mapped.tags).toEqual([
      "Isekai",
      "System / Dungeons",
      "Contract Marriage"
    ]);
    expect(mapped.warnings).toBe("Violence");
  });

  it("includes the user's saved custom chips when metadata mentions them", () => {
    const mapped = mapAutoFields({
      synopsis: "A found family faces grief in a slow burn romance.",
      custom: {
        tags: ["Found family", "Slow burn"],
        warnings: ["Grief"]
      }
    });
    expect(mapped.tags).toEqual(["Found family", "Slow burn"]);
    expect(mapped.warnings).toBe("Grief");
  });

  it("only ever returns built-in chips", () => {
    const mapped = mapAutoFields({
      labels: ["Webtoon", "Some messy uncategorised tag", "Isekai"],
      synopsis: "A strange uncategorised experiment with no clean categories."
    });
    for (const label of mapped.genres) expect(GENRE_PRESETS).toContain(label);
    for (const label of mapped.tags) expect(TROPE_PRESETS).toContain(label);
    for (const label of mapped.warnings.split(", ").filter(Boolean)) {
      expect(WARNING_PRESETS).toContain(label);
    }
  });
});
