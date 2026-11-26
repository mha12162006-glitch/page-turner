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
  it("matches rank-40 bullying and rank-90 war while ignoring lower ranks", () => {
    const tags = [
      tag("Dungeon", 95),
      tag("Super Power", 92),
      tag("War", 90, true),
      tag("Bullying", 40, true),
      tag("Snowscape", 20),
      tag("Marriage", 16)
    ];
    expect(mapTagsToWarnings(tags, ["Action", "Adventure", "Fantasy"], false)).toEqual([
      "Bullying",
      "War"
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
      tag("Slavery", 45),
      tag("War", 40)
    ];
    expect(mapTagsToWarnings(tags, [], false)).toEqual(
      WARNING_PRESETS.filter((label) => label !== "Implied S.A" && label !== "Explicit S.A")
    );
  });

  it("adds Nudity / Ecchi for the Ecchi genre or adult media", () => {
    expect(mapTagsToWarnings([], ["Ecchi"], false)).toEqual(["Nudity / Ecchi"]);
    expect(mapTagsToWarnings([], ["Romance"], true)).toEqual(["Nudity / Ecchi"]);
    expect(mapTagsToWarnings([], [], false, "", "R18")).toEqual(["Nudity / Ecchi"]);
  });

  it("maps source synonyms to the clean warning chips", () => {
    expect(
      mapTagsToWarnings(
        [],
        [],
        false,
        "There is blood after a murder. Neglect and stalking follow a kidnapping."
      )
    ).toEqual(["Violence", "Child / Domestic Abuse"]);
  });

  it("detects bullying from WEBTOON tags and synopsis wording", () => {
    expect(
      mapTagsToWarnings(
        [tag("Underdog Story", 80)],
        ["Horror"],
        false,
        "His classmates are eager to remind him his faults daily."
      )
    ).toEqual(["Bullying"]);
    expect(
      mapTagsToWarnings(
        [],
        ["Horror"],
        false,
        "His classmates are eager to remind him his faults daily."
      )
    ).toEqual(["Bullying"]);
  });

  it("only ever auto-fills clean built-in labels, never raw tag sentences", () => {
    const messy = [
      { name: "poisoning/assassination attempts", rank: 90 },
      {
        name: "No explicit or implied sexual violence (100% safe/PG-13; very clean romance)",
        rank: 90
      },
      { name: "severe war trauma and PTSD", rank: 85 },
      { name: "War", rank: 80 },
      { name: "and emotional/familial neglect", rank: 80 }
    ];
    const result = mapTagsToWarnings(messy, ["War", "Historical"], false);
    // "neglect" is a synonym for the built-in Child / Domestic Abuse chip.
    expect(result).toEqual(["Explicit S.A", "Child / Domestic Abuse", "War"]);
    for (const label of result) expect(WARNING_PRESETS).toContain(label);
    expect(result.some((label) => label.length > 40)).toBe(false);
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
