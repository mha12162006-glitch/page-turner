import { describe, expect, it } from "vitest";
import { GENRE_PRESETS, TROPE_PRESETS } from "./tags";
import { WARNING_PRESETS } from "./warnings";

// The curated defaults. Exact equality keeps the old long, comma-split
// sentences from ever being restored to the built-in preset pool.
const CLEAN = {
  warnings: [
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
  ],
  genres: [
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
  ],
  tags: [
    "Isekai",
    "Reincarnation / Regression",
    "Villainess",
    "Murim / Martial Arts",
    "System / Dungeons",
    "Contract Marriage",
    "Historical / Royalty"
  ]
};

describe("curated preset defaults", () => {
  it("uses the exact clean warning, genre and trope lists", () => {
    expect([...WARNING_PRESETS]).toEqual(CLEAN.warnings);
    expect([...GENRE_PRESETS]).toEqual(CLEAN.genres);
    expect([...TROPE_PRESETS]).toEqual(CLEAN.tags);
  });

  it("contains no long descriptive sentences", () => {
    for (const list of Object.values(CLEAN)) {
      for (const label of list) {
        expect(label.length).toBeLessThan(40);
        expect(label).not.toMatch(/[,;]|\b(?:and|the)\b/i);
      }
    }
  });
});
