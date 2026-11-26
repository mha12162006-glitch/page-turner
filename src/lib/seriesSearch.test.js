import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchSeries } from "./seriesSearch";
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

const mockApis = ({ anilist = [], mangaUpdates = [], kitsu = [], fail = "" } = {}) =>
  vi.fn(async (input, options = {}) => {
    const url = urlOf(input);
    if (url.includes("graphql.anilist.co")) {
      const body = JSON.parse(options.body);
      return response({ data: { Page: { media: anilist(body.variables?.s) } } });
    }
    if (url.includes("api.mangaupdates.com")) {
      if (fail === "mangaupdates") throw new Error("offline");
      const body = JSON.parse(options.body);
      return response({ results: mangaUpdates(body.search) });
    }
    if (url.includes("kitsu.io")) {
      if (fail === "kitsu") throw new Error("offline");
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
              title: "Uriah",
              image: { url: { original: "https://img.example/uriah-mu.jpg" } },
              genres: [{ genre: "Action" }, { genre: "Violence" }, { genre: "Isekai" }],
              description: "A western webtoon about a cursed knight.",
              latest_chapter: "142",
              year: 2020,
              status: "Ongoing"
            }
          }
        ],
        kitsu: () => [
          {
            attributes: {
              canonicalTitle: "Uriah: Bloodline",
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
    expect(rows[1].total_chapters).toBe(88);
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
