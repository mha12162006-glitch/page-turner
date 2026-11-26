import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enrich, needsEnrichment, searchAniList } from "./anilist";

const media = {
  id: 42,
  title: { romaji: "Example", english: "Example" },
  coverImage: { large: "" },
  countryOfOrigin: "KR",
  genres: ["Action"],
  tags: [],
  description: "A synopsis.",
  status: "RELEASING",
  externalLinks: [
    {
      url: "https://tapas.io/series/example",
      type: "STREAMING",
      site: "Tapas"
    }
  ],
  characters: { nodes: [] }
};

const response = {
  ok: true,
  status: 200,
  json: async () => ({
    data: { Page: { media: [media] }, Media: { ...media, chapters: 100 } }
  })
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ...response })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AniList reading links", () => {
  it("never puts a link into search results", async () => {
    const rows = await searchAniList("Example");
    expect(rows).toHaveLength(1);
    expect(rows[0].read_url ?? "").toBe("");
    expect(Object.hasOwn(rows[0], "read_url")).toBe(false);
  });

  it("never fills a blank link during enrichment", async () => {
    const { row } = await enrich({
      title: "Example",
      synopsis: "",
      genres: [],
      warnings: "",
      read_url: ""
    });
    expect(row.read_url).toBe("");
  });

  it("makes no AniList request for a row without an anilist_id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const spy = vi.fn(async () => ({ ...response }));
    vi.stubGlobal("fetch", spy);
    const base = {
      title: "Uriah",
      synopsis: "",
      genres: [],
      warnings: "",
      read_url: ""
    };
    const { row, chars } = await enrich(base);
    expect(spy).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no anilist_id")
    );
    expect(row).toEqual(base);
    expect(chars).toEqual([]);
  });

  it("logs a real AniList failure without any user-facing notice", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dispatch = vi.fn();
    vi.stubGlobal("window", { dispatchEvent: dispatch });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ...response, ok: false, status: 500 })));
    await enrich({
      title: "Example",
      anilist_id: 42,
      synopsis: "",
      genres: [],
      warnings: ""
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("AniList did not respond")
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps a link typed by the owner", async () => {
    const mine = "https://example.com/my-link";
    const { row } = await enrich({
      title: "Example",
      anilist_id: 42,
      synopsis: "A synopsis.",
      genres: ["Action"],
      warnings: "Violence",
      read_url: mine
    });
    expect(row.read_url).toBe(mine);
  });

  it("does not enrich only because the reading link is blank", () => {
    expect(
      needsEnrichment({
        synopsis: "A synopsis.",
        genres: ["Action"],
        warnings: "Violence",
        read_url: ""
      })
    ).toBe(false);
  });
});
