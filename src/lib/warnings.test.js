import { describe, expect, it } from "vitest";
import {
  joinWarnings,
  mapTagsToWarnings,
  parseWarnings,
  WARNING_PRESETS
} from "./warnings";

const tag = (name, rank, isMediaSpoiler = false) => ({
  name,
  rank,
  isMediaSpoiler
});

describe("mapTagsToWarnings", () => {
  it("matches Solo Leveling's rank-40 bullying tag and ignores lower ranks", () => {
    const tags = [
      tag("Dungeon", 95),
      tag("Super Power", 92),
      tag("War", 90, true),
      tag("Bullying", 40, true),
      tag("Snowscape", 20),
      tag("Marriage", 16)
    ];
    expect(mapTagsToWarnings(tags, ["Action", "Adventure", "Fantasy"], false)).toEqual([
      "Bullying"
    ]);
  });

  it("returns no boxes for a title with no qualifying warnings", () => {
    const tags = [tag("Full Color", 20), tag("Long Strip", 20)];
    expect(mapTagsToWarnings(tags, ["Drama", "Romance"], false)).toEqual([]);
  });

  it("uses Explicit S.A only at rank 60 or above, otherwise Implied S.A", () => {
    expect(mapTagsToWarnings([tag("Rape", 60)], [], false)).toEqual([
      "Explicit S.A"
    ]);
    expect(mapTagsToWarnings([tag("Sexual Violence", 59)], [], false)).toEqual([
      "Implied S.A"
    ]);
    expect(mapTagsToWarnings([tag("Sexual Assault", 39)], [], false)).toEqual([]);
  });

  it("does not treat a sexual-assault tag as generic violence", () => {
    expect(mapTagsToWarnings([tag("Sexual Violence", 75)], [], false)).toEqual([
      "Explicit S.A"
    ]);
  });

  it("maps every preset label from sample AniList tags", () => {
    const tags = [
      tag("Violence", 80),
      tag("Gore", 70),
      tag("Torture", 65),
      tag("Child Abuse", 60),
      tag("Suicide", 55),
      tag("Self-Harm", 50),
      tag("Bullying", 45),
      tag("Nudity", 60),
      tag("Drug Abuse", 50),
      tag("Cannibalism", 45),
      tag("Body Horror", 45),
      tag("Slavery", 45)
    ];
    expect(mapTagsToWarnings(tags, [], false)).toEqual(
      WARNING_PRESETS.filter((label) => label !== "Implied S.A" && label !== "Explicit S.A")
    );
  });

  it("adds Nudity / Ecchi for the Ecchi genre or adult media", () => {
    expect(mapTagsToWarnings([], ["Ecchi"], false)).toEqual(["Nudity / Ecchi"]);
    expect(mapTagsToWarnings([], ["Romance"], true)).toEqual(["Nudity / Ecchi"]);
  });
});

describe("warning parsing", () => {
  it("drops the old invented age and None listed placeholder", () => {
    expect(parseWarnings("None listed · Est. 13+")).toEqual([]);
    expect(joinWarnings("Gore/torture · Est. 16+")).toBe("Gore / Torture");
  });

  it("normalizes old warning labels and keeps custom warnings", () => {
    expect(
      parseWarnings(
        "Sexual violence (possibly implied), Suicide/self-harm, Nudity, My custom warning"
      )
    ).toEqual([
      "Implied S.A",
      "Suicide",
      "Self-Harm",
      "Nudity / Ecchi",
      "My custom warning"
    ]);
  });
});
