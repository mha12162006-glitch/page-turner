import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeResult, searchSeries } from "./seriesSearch";
import { WARNING_PRESETS } from "./warnings";

const response = (body, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body
});

const urlOf = (input) => String(input?.url || input);

const ani = (title, id) => ({
  id,
  title: { romaji: title, english: title },
  coverImage: { large: "https://img.example/" + id + ".jpg" },
  countryOfOrigin: "KR",
  genres: ["Action", "Fantasy"],
  tags: [{ name: "Isekai", rank: 80 }],
  description: "AniList synopsis for " + title + ".",
  status: "RELEASING"
});

const mockApis = (
  {
    anilist = () => [],
    mangaUpdates = () => [],
    kitsu = () => [],
    muDetail = null,
    kitsuDetail = null,
    kitsuCategories = null,
    fail = ""
  } = {},
  calls = {}
) =>
  vi.fn(async (input, options = {}) => {
    const url = urlOf(input);
    if (url.includes("graphql.anilist.co")) {
      const body = JSON.parse(options.body);
      return response({ data: { Page: { media: anilist(body.variables?.s) } } });
    }
    if (url.includes("api.mangaupdates.com")) {
      if (fail === "mangaupdates") throw new Error("offline");
      calls.mu = (calls.mu || 0) + 1;
      if (/\/v1\/series\/\d+/.test(url)) {
        return response(
          typeof muDetail === "function"
            ? muDetail(url.split("/v1/series/")[1])
            : muDetail || {}
        );
      }
      const body = JSON.parse(options.body);
      return response({ results: mangaUpdates(body.search) });
    }
    if (url.includes("kitsu.io")) {
      if (fail === "kitsu") throw new Error("offline");
      calls.kitsu = (calls.kitsu || 0) + 1;
      const id = url.match(/\/manga\/(\d+)/)?.[1];
      if (/\/categories/.test(url)) {
        calls.kitsuUrls = [...(calls.kitsuUrls || []), url];
        return response(
          typeof kitsuCategories === "function"
            ? kitsuCategories(id)
            : kitsuCategories || { data: [] }
        );
      }
      if (id) {
        return response(
          typeof kitsuDetail === "function"
            ? kitsuDetail(id)
            : kitsuDetail || { data: {} }
        );
      }
      const q = new URL(url).searchParams.get("filter[text]");
      return response({ data: kitsu(q) });
    }
    throw new Error("unexpected URL: " + url);
  });

beforeEach(() => vi.unstubAllGlobals());

describe("multi-source title search", () => {
  it("finds a Western webtoon missing from AniList, with its cover and details", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        anilist: () => [],
        mangaUpdates: () => [
          {
            record: {
              series_id: 555,
              title: "Uriah",
              type: "Webtoon",
              image: { url: { original: "https://img.example/uriah-mu.jpg" } },
              genres: [{ genre: "Action" }, { genre: "Violence" }, { genre: "Isekai" }],
              description: "A western webtoon about a cursed knight.",
              latest_chapter: "142",
              status: "Ongoing"
            }
          }
        ],
        kitsu: () => [
          {
            id: 777,
            attributes: {
              canonicalTitle: "Uriah: Bloodline",
              subtype: "oel",
              posterImage: { large: "https://img.example/uriah-kitsu.jpg" },
              synopsis: "Kitsu synopsis.",
              status: "finished",
              chapterCount: 88,
              genres: ["Fantasy"]
            }
          }
        ]
      })
    );

    const rows = await searchSeries("Uriah");
    expect(rows.map((r) => r.source)).toEqual(["MangaUpdates", "Kitsu"]);
    const uriah = rows[0];
    expect(uriah.anilist_id).toBe(null);
    expect(uriah._source_id).toBe("555");
    expect(uriah.format).toBe("Webtoon");
    expect(uriah.title).toBe("Uriah");
    expect(uriah.cover_url).toBe("https://img.example/uriah-mu.jpg");
    expect(uriah.synopsis).toBe("A western webtoon about a cursed knight.");
    expect(uriah.pub_status).toBe("Ongoing");
    expect(uriah.total_chapters).toBe(142);
    expect(uriah.genres).toEqual(["Action"]);
    expect(uriah.tags).toEqual(["Isekai"]);
    expect(uriah.warnings).toBe("Violence");
    expect(WARNING_PRESETS).toContain(uriah.warnings);
    expect(Object.hasOwn(uriah, "read_url")).toBe(false);
    expect(rows[1].anilist_id).toBe(null);
    expect(rows[1]._source_id).toBe("777");
    expect(rows[1].format).toBe("Comic");
    expect(rows[1].total_chapters).toBe(88);
  });

  it("detects OEL as Comic unless a Webtoon tag is present", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        anilist: () => [],
        mangaUpdates: () => [
          {
            record: {
              series_id: 900,
              title: "The Beginning After the End",
              type: "OEL",
              genres: [{ genre: "Fantasy" }]
            }
          },
          {
            record: {
              series_id: 901,
              title: "Webtoon OEL Example",
              type: "OEL",
              genres: [{ genre: "Webtoon" }]
            }
          }
        ],
        kitsu: () => [
          {
            id: 902,
            attributes: {
              canonicalTitle: "The Beginning After the End: Western Edition",
              subtype: "western",
              genres: ["Action", "Reincarnation"]
            }
          }
        ]
      })
    );

    const rows = await searchSeries("The Beginning After the End");
    const tbate = rows.find((r) => r.title === "The Beginning After the End" && r.source === "MangaUpdates");
    expect(tbate.format).toBe("Comic");
    const tagged = rows.find((r) => r.title === "Webtoon OEL Example");
    expect(tagged.format).toBe("Webtoon");
    const kitsu = rows.find((r) => r.source === "Kitsu");
    expect(kitsu.format).toBe("Comic");
    expect(kitsu.tags).toContain("Reincarnation / Regression");
  });

  it("completes a partial MangaUpdates result from its detail endpoint", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          mangaUpdates: () => [],
          muDetail: () => ({
            series_id: 555,
            title: "Uriah",
            type: "Webtoon",
            image: { url: { original: "https://img.example/uriah-full.jpg" } },
            description: "Full webtoon synopsis.",
            status: "Ongoing",
            genres: [{ genre: "Action" }, { genre: "Violence" }],
            latest_chapter: "142"
          })
        },
        calls
      )
    );
    const partial = {
      source: "MangaUpdates",
      _source_id: "555",
      anilist_id: null,
      title: "Uriah",
      cover_url: "",
      synopsis: "",
      format: "",
      pub_status: "",
      genres: [],
      tags: [],
      warnings: "",
      total_chapters: null,
      read_url: ""
    };
    const full = await completeResult(partial);
    expect(calls.mu).toBe(1);
    expect(full.cover_url).toBe("https://img.example/uriah-full.jpg");
    expect(full.synopsis).toBe("Full webtoon synopsis.");
    expect(full.format).toBe("Webtoon");
    expect(full.genres).toEqual(["Action"]);
    expect(full.warnings).toBe("Violence");
    expect(full.total_chapters).toBe(142);
    expect(full.read_url).toBe("");
  });

  it("uses Kitsu categories to add clean tags and a Webtoon category", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          kitsu: () => [],
          kitsuCategories: () => ({
            data: [
              { id: 1, attributes: { title: "Webtoon" } },
              { id: 2, attributes: { title: "Isekai" } },
              { id: 3, attributes: { title: "Violence" } },
              { id: 4, attributes: { title: "Some messy uncategorised tag" } }
            ]
          })
        },
        calls
      )
    );
    const partial = {
      source: "Kitsu",
      _source_id: "902",
      anilist_id: null,
      title: "The Beginning After the End",
      cover_url: "https://img.example/tbate.jpg",
      synopsis: "Kitsu synopsis.",
      format: "Comic",
      pub_status: "Ongoing",
      genres: ["Action"],
      tags: [],
      warnings: "",
      total_chapters: 80,
      read_url: ""
    };
    const full = await completeResult(partial);
    expect(calls.kitsu).toBe(2);
    expect(calls.kitsuUrls[0]).toContain("/categories?page[limit]=40");
    expect(full.format).toBe("Webtoon");
    expect(full.tags).toEqual(["Isekai"]);
    expect(full.warnings).toBe("Violence");
    expect(full.genres).toEqual(["Action"]);
    expect(full.read_url).toBe("");
  });

  it("fills Uriah warnings and tropes from MangaUpdates detail", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          mangaUpdates: () => [],
          muDetail: () => ({
            title: "Uriah",
            type: "Webtoon",
            image: { url: { original: "https://img.example/uriah-full.jpg" } },
            description:
              "A cursed knight survives brutal murders and blood in another world.",
            status: "Ongoing",
            genres: [
              { genre: "Action" },
              { genre: "Violence" },
              { genre: "Isekai" }
            ],
            categories: [{ category: "Drama" }],
            latest_chapter: "142"
          })
        },
        calls
      )
    );
    const picked = {
      source: "MangaUpdates",
      _source_id: "555",
      _ageRating: "",
      anilist_id: null,
      title: "Uriah",
      cover_url: "",
      synopsis: "",
      format: "",
      pub_status: "",
      genres: [],
      tags: [],
      warnings: "",
      total_chapters: null,
      read_url: ""
    };
    const full = await completeResult(picked);
    expect(calls.mu).toBe(1);
    expect(full.genres).toEqual(["Action", "Drama"]);
    expect(full.tags).toEqual(["Isekai"]);
    expect(full.warnings).toBe("Violence");
    expect(full.read_url).toBe("");
  });

  it("fills TBATE warnings, tropes and genres from Kitsu detail", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          kitsu: () => [],
          kitsuCategories: () => ({
            data: [
              { attributes: { title: "Isekai" } },
              { attributes: { title: "Reincarnation" } },
              { attributes: { title: "Violence" } },
              { attributes: { title: "War" } }
            ]
          })
        },
        calls
      )
    );
    const picked = {
      source: "Kitsu",
      _source_id: "902",
      _ageRating: "R18",
      anilist_id: null,
      title: "The Beginning After the End",
      cover_url: "https://img.example/tbate.jpg",
      synopsis: "An emperor reborn as a child; dungeons and a brutal war.",
      format: "Comic",
      pub_status: "Ongoing",
      genres: ["Action", "Fantasy"],
      tags: [],
      warnings: "",
      total_chapters: 80,
      read_url: ""
    };
    const full = await completeResult(picked);
    expect(calls.kitsuUrls[0]).toContain("/categories?page[limit]=40");
    expect(full.genres).toEqual(["Action", "Fantasy"]);
    expect(full.tags).toEqual([
      "Isekai",
      "Reincarnation / Regression",
      "System / Dungeons",
      "Historical / Royalty"
    ]);
    expect(full.warnings).toBe("Violence, Nudity / Ecchi, War");
    expect(full.read_url).toBe("");
  });

  it("honors saved custom chips from source metadata", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          kitsu: () => [],
          kitsuCategories: () => ({
            data: [{ attributes: { title: "Found family" } }]
          })
        },
        calls
      )
    );
    const picked = {
      source: "Kitsu",
      _source_id: "903",
      _ageRating: "",
      anilist_id: null,
      title: "Custom Chip Example",
      cover_url: "",
      synopsis: "A found family survives neglect and grief.",
      format: "Comic",
      pub_status: "",
      genres: [],
      tags: [],
      warnings: "",
      total_chapters: null,
      read_url: ""
    };
    const full = await completeResult(picked, {
      tags: ["Found family"],
      warnings: ["Grief"]
    });
    expect(full.tags).toContain("Found family");
    expect(full.warnings).toBe("Child / Domestic Abuse, Grief");
    expect(full.read_url).toBe("");
  });

  it("parses a MangaUpdates chapter count out of the status sentence", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        anilist: () => [],
        mangaUpdates: () => [
          {
            record: {
              series_id: 901,
              title: "Completed Comic",
              status: "125 Chapters (Complete)"
            }
          }
        ],
        kitsu: () => []
      })
    );
    const [row] = await searchSeries("Completed Comic");
    expect(row.total_chapters).toBe(125);
    expect(row.chapter).toBe(0);
    expect(row.pub_status).toBe("Completed");
  });

  it("parses a MangaUpdates detail status count when latest_chapter is blank", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          mangaUpdates: () => [],
          muDetail: () => ({
            title: "Lore Olympus",
            status: "48 Chapters (Ongoing)",
            latest_chapter: null
          })
        },
        calls
      )
    );
    const full = await completeResult({
      source: "MangaUpdates",
      _source_id: "901",
      _ageRating: "",
      anilist_id: null,
      title: "Lore Olympus",
      chapter: 0,
      total_chapters: null,
      genres: [],
      tags: [],
      warnings: ""
    });
    expect(calls.mu).toBe(1);
    expect(full.total_chapters).toBe(48);
  });

  it("prefers the Kitsu detail chapterCount over the search result", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          kitsu: () => [],
          kitsuDetail: () => ({
            data: { id: 902, attributes: { chapterCount: 160, status: "finished" } }
          }),
          kitsuCategories: () => ({ data: [] })
        },
        {}
      )
    );
    const full = await completeResult({
      source: "Kitsu",
      _source_id: "902",
      _ageRating: "",
      anilist_id: null,
      title: "Completed Kitsu Comic",
      chapter: 0,
      total_chapters: 80,
      genres: [],
      tags: [],
      warnings: ""
    });
    expect(full.total_chapters).toBe(160);
    expect(full.pub_status).toBe("Completed");
  });

  it("cross-checks MangaUpdates by exact title when Kitsu chapterCount is null", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          mangaUpdates: () => [
            { record: { series_id: 555, title: "Uriah" } }
          ],
          muDetail: () => ({
            title: "Uriah",
            status: "48 Chapters (Ongoing)",
            latest_chapter: null
          }),
          kitsu: () => [],
          kitsuDetail: () => ({
            data: { id: 777, attributes: { chapterCount: null } }
          }),
          kitsuCategories: () => ({ data: [] })
        },
        calls
      )
    );
    const full = await completeResult({
      source: "Kitsu",
      _source_id: "777",
      _ageRating: "",
      anilist_id: null,
      title: "Uriah",
      chapter: 0,
      total_chapters: null,
      genres: [],
      tags: [],
      warnings: ""
    });
    expect(calls.kitsu).toBe(2);
    expect(calls.mu).toBe(2);
    expect(full.total_chapters).toBe(48);
  });

  it("deduplicates a title found everywhere and keeps the AniList id", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        anilist: (q) => [ani(q, 42)],
        mangaUpdates: (q) => [
          { record: { title: q, image: { url: { original: "mu.jpg" } } } }
        ],
        kitsu: (q) => [
          { attributes: { canonicalTitle: q, posterImage: { medium: "kitsu.jpg" } } }
        ]
      })
    );

    const rows = await searchSeries("Solo Leveling");
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("AniList");
    expect(rows[0].anilist_id).toBe(42);
    expect(rows[0].cover_url).toBe("https://img.example/42.jpg");
    expect(rows[0].read_url ?? "").toBe("");
  });

  it("still returns other sources when one API is down", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        fail: "mangaupdates",
        anilist: () => [],
        kitsu: () => [
          { attributes: { canonicalTitle: "Uriah", posterImage: { medium: "k.jpg" } } }
        ]
      })
    );
    const rows = await searchSeries("Uriah");
    expect(rows.map((r) => r.source)).toEqual(["Kitsu"]);
  });
});
