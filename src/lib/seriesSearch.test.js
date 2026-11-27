import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeResult, searchMangaDex, searchSeries } from "./seriesSearch";
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
    webtoon = () => [],
    webtoonDetail = () => ({}),
    jikan = () => [],
    mangadex = () => [],
    mangadexAggregate = () => ({ volumes: {} }),
    muDetail = null,
    kitsuDetail = null,
    kitsuCategories = null,
    fail = ""
  } = {},
  calls = {}
) =>
  vi.fn(async (input, options = {}) => {
    const url = urlOf(input);
    if (url.includes("/api/webtoon-search")) {
      const params = new URL(url, "http://localhost").searchParams;
      if (params.has("url")) {
        calls.webtoonDetail = (calls.webtoonDetail || 0) + 1;
        calls.webtoonDetailUrls = [
          ...(calls.webtoonDetailUrls || []),
          params.get("url")
        ];
        return response({ result: webtoonDetail(params.get("url")) });
      }
      calls.webtoon = (calls.webtoon || 0) + 1;
      return response({ results: webtoon(params.get("q")) });
    }
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
    if (url.includes("api.mangadex.org")) {
      if (fail === "mangadex") throw new Error("offline");
      calls.mangadex = (calls.mangadex || 0) + 1;
      if (/\/manga\/[^/]+\/aggregate/.test(url)) {
        calls.mangadexAggregate = (calls.mangadexAggregate || 0) + 1;
        const id = decodeURIComponent(url.match(/\/manga\/([^/]+)\/aggregate/)[1]);
        return response(
          typeof mangadexAggregate === "function"
            ? mangadexAggregate(id)
            : mangadexAggregate
        );
      }
      const q = new URL(url).searchParams.get("title");
      calls.mangadexUrl = url;
      return response({ data: mangadex(q) });
    }
    if (url.includes("api.jikan.moe")) {
      if (fail === "jikan") throw new Error("offline");
      calls.jikan = (calls.jikan || 0) + 1;
      calls.jikanUrl = url;
      const q = new URL(url).searchParams.get("q");
      return response({ data: jikan(q) });
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

  it("maps direct WEBTOON results into the same cleaned fields", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          mangaUpdates: () => [],
          kitsu: () => [],
          webtoon: () => [
            {
              title: "Don't Enter the House Pool",
              cover_url: "https://webtoon-phinf.pstatic.net/thumb.jpg",
              author: "Toffuo",
              genre: "Horror",
              webtoon_id: "7580",
              webtoon_type: "ORIGINAL",
              detail_url:
                "https://www.webtoons.com/en/horror/house-pool/list?title_no=7580",
              type: "Webtoon"
            }
          ]
        },
        calls
      )
    );
    const [row] = await searchSeries("Don't Enter the House Pool");
    expect(calls.webtoon).toBe(1);
    expect(row.source).toBe("WEBTOON");
    expect(row.anilist_id).toBe(null);
    expect(row._source_id).toBe("7580");
    expect(row._detail_url).toContain("title_no=7580");
    expect(row.format).toBe("Webtoon");
    expect(row.title).toBe("Don't Enter the House Pool");
    expect(row.cover_url).toBe("https://webtoon-phinf.pstatic.net/thumb.jpg");
    expect(row.synopsis).toBe("");
    expect(row.genres).toEqual(["Horror"]);
    expect(row.chapter).toBe(0);
    expect(row.total_chapters).toBe(null);
    expect(Object.hasOwn(row, "read_url")).toBe(false);
  });

  it("keeps Canvas titles searchable without inventing preset chips", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        anilist: () => [],
        mangaUpdates: () => [],
        kitsu: () => [],
        webtoon: () => [
          {
            title: "City of Light",
            cover_url: "https://webtoon-phinf.pstatic.net/city.jpg",
            author: "IsaacTheRaccoon",
            genre: "Canvas",
            webtoon_id: "12345",
            type: "Webtoon"
          }
        ]
      })
    );
    const [row] = await searchSeries("City of Light");
    expect(row.source).toBe("WEBTOON");
    expect(row.format).toBe("Webtoon");
    expect(row.genres).toEqual([]);
    expect(row.tags).toEqual([]);
    expect(row.warnings).toBe("");
    expect(row.synopsis).toBe("");
    expect(row.read_url ?? "").toBe("");
  });

  it("scrapes the real WEBTOON detail page and maps full metadata", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          mangaUpdates: () => [],
          kitsu: () => [],
          webtoonDetail: (url) =>
            url.includes("title_no=7580")
              ? {
                  title: "Don't Enter the House Pool",
                  cover_url:
                    "https://swebtoon-phinf.pstatic.net/20251028_127/poster.jpg",
                  genres: ["Horror"],
                  tags: ["Drama", "Magical Story", "Underdog Story"],
                  synopsis:
                    "Jasha is magicless at a royal academy of White Magic. A brutal murder and a war between houses follow; he is reborn with a second chance.",
                  pub_status: "Ongoing",
                  total_chapters: 39,
                  webtoon_id: "7580",
                  webtoon_type: "ORIGINAL",
                  detail_url:
                    "https://www.webtoons.com/en/horror/house-pool/list?title_no=7580"
                }
              : {}
        },
        calls
      )
    );
    const picked = {
      source: "WEBTOON",
      _source_id: "7580",
      _detail_url:
        "https://www.webtoons.com/en/horror/house-pool/list?title_no=7580",
      _webtoon_type: "ORIGINAL",
      _ageRating: "",
      anilist_id: null,
      title: "Don't Enter the House Pool",
      cover_url: "https://webtoon-phinf.pstatic.net/thumb.jpg",
      synopsis: "",
      pub_status: "",
      genres: ["Horror"],
      tags: [],
      warnings: "",
      total_chapters: null,
      read_url: ""
    };
    const full = await completeResult(picked);
    expect(calls.webtoonDetail).toBe(1);
    expect(calls.webtoonDetailUrls[0]).toContain("title_no=7580");
    expect(full.title).toBe("Don't Enter the House Pool");
    expect(full.pub_status).toBe("Ongoing");
    expect(full.total_chapters).toBe(39);
    expect(full.synopsis).toContain("brutal murder and a war");
    expect(full.genres).toEqual(["Horror", "Fantasy"]);
    expect(full.tags).toEqual([
      "Reincarnation / Regression",
      "Historical / Royalty",
      "Academy / School"
    ]);
    expect(full.warnings).toBe("Violence, Bullying, War");
    expect(full.read_url ?? "").toBe("");
    expect(full.format).toBe("Webtoon");
    expect(full.anilist_id).toBe(null);
  });

  it("fills Canvas details without inventing a placeholder synopsis", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          mangaUpdates: () => [],
          kitsu: () => [],
          webtoonDetail: () => ({
            title: "City of Light",
            cover_url:
              "https://swebtoon-phinf.pstatic.net/20210806_61/thumbnail.jpg",
            genres: ["Fantasy", "Horror"],
            synopsis:
              "The following events were captured on the dragon home of Sol during a brutal war; a reborn guard fights back.",
            pub_status: "Completed",
            total_chapters: 8,
            webtoon_id: "674475",
            webtoon_type: "CANVAS",
            detail_url:
              "https://www.webtoons.com/en/canvas/city-of-light/list?title_no=674475"
          })
        },
        calls
      )
    );
    const full = await completeResult({
      source: "WEBTOON",
      _source_id: "674475",
      _detail_url:
        "https://www.webtoons.com/en/canvas/city-of-light/list?title_no=674475",
      anilist_id: null,
      title: "City of Light",
      synopsis: "",
      genres: [],
      tags: [],
      warnings: "",
      total_chapters: null,
      read_url: ""
    });
    expect(calls.webtoonDetail).toBe(1);
    expect(full.pub_status).toBe("Completed");
    expect(full.total_chapters).toBe(8);
    expect(full.genres).toContain("Fantasy");
    expect(full.genres).toContain("Horror");
    expect(full.tags).toContain("Reincarnation / Regression");
    expect(full.warnings).toBe("Violence, War");
    expect(full.read_url ?? "").toBe("");
    expect(full.synopsis).not.toMatch(/webtoon made by|--/i);
  });

  it("finds a Romaji-indexed title through MangaDex with full clean metadata", async () => {
    const title = "The Villainess Licks the Ice Prince Clean";
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          anilist: () => [],
          mangaUpdates: () => [],
          kitsu: () => [],
          mangadex: () => [
            {
              id: "md-123",
              attributes: {
                title: { ja: "Akujo wa Kouri no Prince-kun wo Name Tsukusu" },
                altTitles: [
                  { en: title },
                  { en: "The Villainess Cleans the Ice Prince" }
                ],
                description: {
                  en:
                    "**[Spoiler]** Reborn as a villainess, Lilian enters a contract marriage with the ice prince. A brutal murder follows. [Source](https://example.com)"
                },
                originalLanguage: "ko",
                status: "ongoing",
                lastChapter: "37",
                contentRating: "suggestive",
                tags: [
                  { attributes: { name: { en: "Romance" } } },
                  { attributes: { name: { en: "Drama" } } },
                  { attributes: { name: { en: "Villainess" } } },
                  { attributes: { name: { en: "Contract Marriage" } } },
                  { attributes: { name: { en: "Violence" } } },
                  { attributes: { name: { en: "Long Strip" } } }
                ]
              },
              relationships: [
                {
                  type: "cover_art",
                  attributes: { fileName: "cover-a1.jpg" }
                }
              ]
            }
          ]
        },
        calls
      )
    );

    const [row] = await searchSeries(title);
    expect(calls.mangadex).toBe(1);
    expect(calls.mangadexUrl).toBe(
      "https://api.mangadex.org/manga?title=" +
        encodeURIComponent(title) +
        "&limit=10&includes[]=cover_art" +
        "&contentRating[]=safe&contentRating[]=suggestive&contentRating[]=erotica" +
        "&order[relevance]=desc"
    );
    expect(row.source).toBe("MangaDex");
    expect(row.title).toBe(title);
    expect(row.anilist_id).toBe(null);
    expect(row._source_id).toBe("md-123");
    expect(row._aliases).toContain("akujowakourinoprincekunwonametsukusu");
    expect(row.cover_url).toBe(
      "https://uploads.mangadex.org/covers/md-123/cover-a1.jpg.512.jpg"
    );
    expect(row.format).toBe("Manhwa");
    expect(row.pub_status).toBe("Ongoing");
    expect(row.total_chapters).toBe(37);
    expect(row.synopsis).toContain("Reborn as a villainess");
    expect(row.synopsis).not.toMatch(/\[|source|spoiler|\*\*/i);
    expect(row.genres).toEqual(["Drama", "Romance"]);
    expect(row.tags).toContain("Villainess");
    expect(row.tags).toContain("Contract Marriage");
    expect(row.tags).toContain("Reincarnation / Regression");
    expect(row.tags).toContain("Historical / Royalty");
    expect(row.warnings).toBe("Violence, Nudity / Ecchi");
    expect(Object.hasOwn(row, "read_url")).toBe(false);
  });

  it("maps MangaDex original languages and long-strip tags to clean formats", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        mangadex: () => [
          {
            id: "ja-strip",
            attributes: {
              title: { en: "Japanese Webtoon" },
              originalLanguage: "ja",
              tags: [
                { attributes: { name: { en: "Long Strip" } } }
              ]
            }
          },
          {
            id: "ja-plain",
            attributes: {
              title: { en: "Japanese Manga" },
              originalLanguage: "ja",
              tags: [
                { attributes: { name: { en: "Action" } } }
              ]
            }
          },
          {
            id: "en-strip",
            attributes: {
              title: { en: "English Webtoon" },
              originalLanguage: "en",
              tags: [
                { attributes: { name: { en: "Web Comic" } } }
              ]
            }
          },
          {
            id: "en-plain",
            attributes: {
              title: { en: "English Comic" },
              originalLanguage: "en",
              tags: [
                { attributes: { name: { en: "Action" } } }
              ]
            }
          },
          {
            id: "zh-hk",
            attributes: {
              title: { en: "Hong Kong Manhua" },
              originalLanguage: "zh-hk"
            }
          }
        ]
      })
    );
    const rows = await searchMangaDex("formats");
    expect(Object.fromEntries(rows.map((row) => [row.title, row.format]))).toEqual({
      "Japanese Webtoon": "Webtoon",
      "Japanese Manga": "Manga",
      "English Webtoon": "Webtoon",
      "English Comic": "Comic",
      "Hong Kong Manhua": "Manhua"
    });
  });

  it("uses the MangaDex aggregate endpoint when lastChapter is blank", async () => {
    const calls = {};
    vi.stubGlobal(
      "fetch",
      mockApis(
        {
          mangadexAggregate: () => ({
            volumes: {
              1: {
                chapters: {
                  "1": { chapter: "1" },
                  "7": { chapter: "7" },
                  "12": { chapter: "12.5" }
                }
              }
            }
          })
        },
        calls
      )
    );
    const row = {
      source: "MangaDex",
      _source_id: "md-123",
      _ageRating: "suggestive",
      anilist_id: null,
      title: "Aggregate Example",
      cover_url: "https://uploads.mangadex.org/covers/md-123/c.jpg.512.jpg",
      synopsis: "A clean synopsis.",
      format: "Manhwa",
      pub_status: "Ongoing",
      genres: ["Action"],
      tags: [],
      warnings: "",
      total_chapters: null,
      read_url: ""
    };
    const full = await completeResult(row);
    expect(calls.mangadexAggregate).toBe(1);
    expect(full.total_chapters).toBe(12);
    expect(full.read_url).toBe("");

    await completeResult({ ...row, total_chapters: 37 });
    expect(calls.mangadexAggregate).toBe(1);
  });

  it("dedupes MangaDex results by English alt-title", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        anilist: () => [],
        mangaUpdates: () => [
          {
            record: {
              series_id: 555,
              title: "Uriah",
              latest_chapter: "142"
            }
          }
        ],
        kitsu: () => [],
        mangadex: () => [
          {
            id: "md-uriah",
            attributes: {
              title: { ko: "우리아" },
              altTitles: [{ en: "Uriah" }],
              originalLanguage: "ko"
            }
          }
        ]
      })
    );
    const rows = await searchSeries("Uriah");
    expect(rows.map((row) => row.source)).toEqual(["MangaUpdates"]);
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

  it("publishes each source as soon as it settles", async () => {
    const updates = [];
    vi.stubGlobal(
      "fetch",
      mockApis({
        kitsu: () => [
          { attributes: { canonicalTitle: "Uriah", posterImage: { medium: "k.jpg" } } }
        ]
      })
    );
    const rows = await searchSeries("Uriah", {}, (partial) => {
      updates.push(partial.map((row) => row.source));
    });
    expect(updates.length).toBe(6);
    expect(updates.some((sources) => sources.includes("Kitsu"))).toBe(true);
    expect(rows.map((r) => r.source)).toContain("Kitsu");
  });

  it("keeps other sources when one route returns HTML instead of JSON", async () => {
    const fallback = mockApis({
      kitsu: () => [
        { attributes: { canonicalTitle: "Uriah", posterImage: { medium: "k.jpg" } } }
      ]
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input, options) => {
        if (urlOf(input).includes("api.jikan.moe")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "text/html; charset=utf-8" },
            json: async () => {
              throw new SyntaxError("Unexpected token <");
            }
          };
        }
        return fallback(input, options);
      })
    );
    const rows = await searchSeries("Uriah");
    expect(rows.map((r) => r.source)).toContain("Kitsu");
  });

  it("maps Jikan/MAL results with English titles, aliases and curated chips", async () => {
    const item = {
      mal_id: 80010,
      title: "Akujo wa Kouri no Prince-kun wo Name Tsukusu",
      title_english: "The Villainess Licks the Ice Prince Clean",
      title_synonyms: ["Akujo wa Kouri no Prince-kun wo Name Tsukusu"],
      images: {
        jpg: {
          image_url: "https://cdn.example.com/cover-small.jpg",
          large_image_url: "https://cdn.example.com/cover-large.jpg"
        }
      },
      type: "Webtoon",
      chapters: 33,
      status: "Finished",
      synopsis:
        "Koyuki is transported into another world and reincarnated as the villainess Freesia. She must survive a brutal murder plot orchestrated by her step-brother, the Ice Prince.",
      genres: [{ name: "Fantasy" }, { name: "Romance" }],
      themes: [{ name: "Violence" }],
      demographics: [{ name: "Josei" }],
      rating: "R - 17+ (violence & profanity)"
    };
    const calls = {};
    vi.stubGlobal("fetch", mockApis({ jikan: () => [item] }, calls));

    const rows = await searchSeries("The Villainess Licks the Ice Prince Clean");
    expect(calls.jikan).toBe(1);
    expect(calls.jikanUrl).toBe(
      "https://api.jikan.moe/v4/manga?q=The%20Villainess%20Licks%20the%20Ice%20Prince%20Clean&limit=8&sfw=false"
    );
    const picked = rows.find((row) => row.source === "MAL");
    expect(picked).toMatchObject({
      title: "The Villainess Licks the Ice Prince Clean",
      anilist_id: null,
      _source_id: "80010",
      format: "Webtoon",
      pub_status: "Completed",
      total_chapters: 33,
      cover_url: "https://cdn.example.com/cover-large.jpg"
    });
    expect(picked._aliases).toContain(
      "Akujo wa Kouri no Prince-kun wo Name Tsukusu"
    );
    expect(picked.synopsis).toContain("reincarnated as the villainess");
    expect(picked.genres).toEqual(expect.arrayContaining(["Fantasy", "Romance"]));
    expect(picked.genres).not.toContain("Josei");
    expect(picked.tags).toEqual(
      expect.arrayContaining([
        "Villainess",
        "Reincarnation / Regression",
        "Isekai"
      ])
    );
    expect(picked.warnings.split(", ")).toContain("Violence");
    expect(
      picked.warnings
        .split(", ")
        .filter(Boolean)
        .every((chip) => WARNING_PRESETS.includes(chip))
    ).toBe(true);
    expect(picked.read_url ?? "").toBe("");
  });

  it("dedupes a Jikan synonym against a title already found elsewhere", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        mangaUpdates: () => [
          { record: { series_id: 555, title: "Uriah", latest_chapter: "142" } }
        ],
        jikan: () => [
          {
            mal_id: 101,
            title: "They Call Me Uriah",
            title_english: "Uriah: The Real Story",
            title_synonyms: ["Uriah"]
          }
        ]
      })
    );
    const rows = await searchSeries("Uriah");
    expect(rows.map((row) => row.source)).toEqual(["MangaUpdates"]);
  });

  it("still returns other sources when Jikan is down", async () => {
    vi.stubGlobal(
      "fetch",
      mockApis({
        fail: "jikan",
        kitsu: () => [
          { attributes: { canonicalTitle: "Uriah", posterImage: { medium: "k.jpg" } } }
        ]
      })
    );
    const rows = await searchSeries("Uriah");
    expect(rows.map((row) => row.source)).toEqual(["Kitsu"]);
  });
});
