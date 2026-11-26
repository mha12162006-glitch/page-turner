import { afterEach, describe, expect, it, vi } from "vitest";
import handler, {
  detailUrlFor,
  encodeImageUrl,
  mergeDetail,
  mergeResults,
  mobileDetailUrl,
  parseDetailHtml,
  parseImmediate,
  parseSearchHtml
} from "./webtoon-search.js";

afterEach(() => vi.unstubAllGlobals());

const searchHtml = `
<div class="webtoon_list_wrap">
  <ul class="webtoon_list">
    <li>
      <a href="https://www.webtoons.com/en/horror/house-pool/list?title_no=7580"
         class="link _card_item" data-title-no="7580" data-webtoon-type="WEBTOON">
        <div class="image_wrap">
          <img src="https://webtoon-phinf.pstatic.net/20251028_127/thumb.jpg?type=q90" width="192" height="249" alt="">
        </div>
        <div class="info_text">
          <strong class="title">Don&#39;t Enter the House Pool</strong>
          <div class="author">Toffuo</div>
          <div class="view_count">1M Views</div>
        </div>
      </a>
    </li>
  </ul>
  <ul class="webtoon_list type_small">
    <li>
      <a href="https://www.webtoons.com/en/canvas/city-of-light/list?title_no=674475"
         class="link _card_item" data-title-no="674475" data-webtoon-type="CHALLENGE">
        <img src="/20210806_61/city.jpg?type=q90">
        <div class="info_text">
          <strong class="title">City of Light</strong>
          <div class="author">IsaacTheRaccoon</div>
        </div>
      </a>
    </li>
  </ul>
</div>`;

const immediatePayload = {
  result: {
    searchedList: [
      {
        titleNo: 986,
        title: "I Love Yoo",
        thumbnailMobile: "/20251118_57/986.jpg",
        authorNameList: ["Quimchee"],
        representGenre: "DRAMA",
        searchMode: "TITLE"
      },
      {
        authorName: "Quimchee",
        titleNameList: ["I Love Yoo"],
        searchMode: "AUTHOR"
      }
    ]
  }
};

const originalDetail = `
<html><head>
  <meta property="og:title" content="Don't Enter the House Pool" />
  <meta property="og:url" content="https://www.webtoons.com/en/horror/house-pool/list?title_no=7580" />
  <meta property="og:image" content="https://swebtoon-phinf.pstatic.net/20251028_127/poster.jpg?type=crop540_540" />
  <meta property="og:description" content="Fallback synopsis." />
</head><body>
  <div class="detail_header type_black">
    <h2 class="genre g_horror">Horror</h2>
    <h1 class="subj">Don't Enter the House Pool</h1>
    <a href="#" class="author _gaLoggingLink">Toffuo</a>
  </div>
  <span class="episode_count">39 Episodes</span>
  <ul id="_listUl" class="detail_list">
    <li class="_episodeItem" data-episode-no="39"></li>
    <li class="_episodeItem" data-episode-no="38"></li>
  </ul>
  <p class="day_info"><span>UP</span>EVERY SATURDAY</p>
  <p class="summary">Jasha is magicless at an academy of White Magic. A brutal murder and a war between houses follow.</p>
</body></html>`;

const canvasDetail = `
<html><head>
  <meta property="og:title" content="City of Light" />
  <meta property="og:image" content="https://swebtoon-phinf.pstatic.net/20210806_61/thumbnail.jpg" />
  <meta property="og:description" content="The following events were captured on the dragon home of Sol." />
</head><body>
  <div class="detail_header challenge">
    <p class="genre">Fantasy</p>
    <p class="genre"><span class="bar"></span>Horror</p>
    <h3 class="subj _challengeTitle">City of Light</h3>
    <a href="#" class="author">IsaacTheRaccoon</a>
  </div>
  <ul id="_listUl" class="detail_list">
    <li data-episode-no="8"></li>
    <li data-episode-no="7"></li>
  </ul>
</body></html>`;

const mobileDetail = `
<html><head>
  <meta property="og:image" content="https://swebtoon-phinf.pstatic.net/20251028_127/poster.jpg" />
  <meta property="og:description" content="" />
</head><body>
  <div class="detail_info_wrap">
    <div class="info_area">
      <em class="point">#2 in Horror</em>
      <strong class="subject">Don't Enter the House Pool</strong>
      <a href="" class="summary _summary">Jasha is magicless. His classmates remind him his faults daily.</a>
      <ul class="tag_box">
        <li class="tag">Drama</li>
        <li class="tag">Magical Story</li>
        <li class="tag">Underdog Story</li>
      </ul>
    </div>
  </div>
  <ul><li class="tag">Ignore recommendation tags</li></ul>
  <span class="genre">Ignore recommendation genre</span>
</body></html>`;

describe("WEBTOON search normalization", () => {
  it("parses Originals and Canvas cards into shared fields", () => {
    const rows = parseSearchHtml(searchHtml);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "Don't Enter the House Pool",
      author: "Toffuo",
      genre: "Horror",
      webtoon_id: "7580",
      webtoon_type: "ORIGINAL",
      type: "Webtoon"
    });
    expect(rows[0].cover_url).toContain("webtoon-phinf.pstatic.net");
    expect(rows[0].detail_url).toContain("title_no=7580");
    expect(rows[1]).toMatchObject({
      title: "City of Light",
      author: "IsaacTheRaccoon",
      genre: "Canvas",
      webtoon_id: "674475",
      webtoon_type: "CANVAS",
      type: "Webtoon"
    });
    expect(rows[1].cover_url).toBe(
      "https://webtoon-phinf.pstatic.net/20210806_61/city.jpg?type=q90"
    );
  });

  it("parses autocomplete JSON and skips author-only entries", () => {
    const rows = parseImmediate(immediatePayload);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "I Love Yoo",
      genre: "Drama",
      author: "Quimchee",
      webtoon_id: "986",
      type: "Webtoon"
    });
    expect(rows[0].detail_url).toContain("title_no=986");
  });

  it("keeps the first copy when both endpoints return the same title", () => {
    const rows = mergeResults(
      [{ title: "City of Light", webtoon_id: "674475", detail_url: "page" }],
      [{ title: "City of Light", webtoon_id: "674475", detail_url: "json" }, { title: "Other", webtoon_id: "9" }]
    );
    expect(rows.map((row) => row.title)).toEqual(["City of Light", "Other"]);
    expect(rows[0].detail_url).toBe("page");
  });
});

describe("WEBTOON image encoding", () => {
  it("encodes spaces in CDN filenames without double-encoding", () => {
    const raw =
      "https://webtoon-phinf.pstatic.net/20251028_127/1) Thumb_Square_3174.jpg?type=q90";
    const encoded = encodeImageUrl(raw);
    expect(encoded).toContain("1)%20Thumb_Square_3174.jpg?type=q90");
    expect(encoded).not.toContain("%2520");
    expect(encodeImageUrl(encoded)).toBe(encoded);
  });
});

describe("WEBTOON detail scraping", () => {
  it("reads the real synopsis, cover, genre, episode count and schedule", () => {
    expect(
      parseDetailHtml(
        originalDetail,
        "https://www.webtoons.com/en/horror/house-pool/list?title_no=7580"
      )
    ).toMatchObject({
      title: "Don't Enter the House Pool",
      author: "Toffuo",
      cover_url:
        "https://swebtoon-phinf.pstatic.net/20251028_127/poster.jpg?type=crop540_540",
      genres: ["Horror"],
      synopsis:
        "Jasha is magicless at an academy of White Magic. A brutal murder and a war between houses follow.",
      pub_status: "Ongoing",
      total_chapters: 39,
      webtoon_id: "7580",
      webtoon_type: "ORIGINAL",
      type: "Webtoon"
    });
  });

  it("falls back to og:description and marks finished Canvas series", () => {
    expect(
      parseDetailHtml(
        canvasDetail,
        "https://www.webtoons.com/en/canvas/city-of-light/list?title_no=674475"
      )
    ).toMatchObject({
      title: "City of Light",
      genres: ["Fantasy", "Horror"],
      synopsis: "The following events were captured on the dragon home of Sol.",
      pub_status: "Completed",
      total_chapters: 8,
      webtoon_id: "674475",
      webtoon_type: "CANVAS"
    });
  });

  it("reads the mobile summary and only the series' own tags", () => {
    const parsed = parseDetailHtml(
      mobileDetail,
      "https://m.webtoons.com/en/horror/house-pool/list?title_no=7580"
    );
    expect(parsed).toMatchObject({
      title: "Don't Enter the House Pool",
      genres: ["Horror"],
      tags: ["Drama", "Magical Story", "Underdog Story"],
      synopsis: "Jasha is magicless. His classmates remind him his faults daily."
    });
    expect(parsed.genres).not.toContain("Ignore recommendation genre");
    expect(parsed.tags).not.toContain("Ignore recommendation tags");
    expect(
      mobileDetailUrl(
        "https://www.webtoons.com/en/horror/house-pool/list?title_no=7580"
      )
    ).toBe("https://m.webtoons.com/en/horror/house-pool/list?title_no=7580");
  });

  it("merges desktop chapters with mobile-only tags and synopsis", () => {
    const sparseDesktop = originalDetail
      .replace(/<meta property="og:description"[^>]*\/>/i, "")
      .replace(/<p class="summary">[\s\S]*?<\/p>/i, "");
    const merged = mergeDetail(
      parseDetailHtml(
        sparseDesktop,
        "https://www.webtoons.com/en/horror/house-pool/list?title_no=7580"
      ),
      parseDetailHtml(
        mobileDetail,
        "https://m.webtoons.com/en/horror/house-pool/list?title_no=7580"
      )
    );
    expect(merged).toMatchObject({
      total_chapters: 39,
      pub_status: "Ongoing",
      synopsis:
        "Jasha is magicless. His classmates remind him his faults daily.",
      genres: ["Horror"],
      tags: ["Drama", "Magical Story", "Underdog Story"],
      detail_url:
        "https://www.webtoons.com/en/horror/house-pool/list?title_no=7580"
    });
  });

  it("builds a valid detail URL from a title number and type", () => {
    expect(
      detailUrlFor({ titleNo: "674475", type: "CANVAS", title: "City of Light" })
    ).toBe(
      "https://www.webtoons.com/en/canvas/city-of-light/list?title_no=674475"
    );
    expect(detailUrlFor({ titleNo: "", type: "ORIGINAL" })).toBe("");
  });
});

describe("WEBTOON handler modes", () => {
  const mockRes = () => ({
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(body) {
      this.body = body;
      return this;
    }
  });
  const req = (url) => ({ method: "GET", url });
  const gif = Buffer.from(
    "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "base64"
  );

  it("serves ?titleNo=&type= detail requests with a browser User-Agent", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => originalDetail
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(
      req(
        "/api/webtoon-search?titleNo=7580&type=ORIGINAL&title=" +
          encodeURIComponent("Don't Enter the House Pool")
      ),
      res
    );
    const result = JSON.parse(res.body).result;
    expect(result).toMatchObject({
      title: "Don't Enter the House Pool",
      total_chapters: 39,
      pub_status: "Ongoing",
      webtoon_type: "ORIGINAL"
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain("title_no=7580");
    expect(options.headers["User-Agent"]).toContain("Chrome/131.0.0.0");
    expect(options.headers.Referer).toBe("https://www.webtoons.com/en/");
    expect(options.headers.Cookie).toContain("pagGDPR=true");
    expect(options.headers.Cookie).toContain("needGDPR=false");
  });

  it("uses the mobile page when desktop metadata is missing", async () => {
    const sparseDesktop = originalDetail
      .replace(/<meta property="og:description"[^>]*\/>/i, "")
      .replace(/<p class="summary">[\s\S]*?<\/p>/i, "");
    const fetchMock = vi.fn(async (url) => ({
      ok: true,
      status: 200,
      text: async () =>
        String(url).includes("m.webtoons.com") ? mobileDetail : sparseDesktop
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(
      req(
        "/api/webtoon-search?url=" +
          encodeURIComponent(
            "https://www.webtoons.com/en/horror/house-pool/list?title_no=7580"
          )
      ),
      res
    );
    const result = JSON.parse(res.body).result;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain("m.webtoons.com");
    expect(result).toMatchObject({
      total_chapters: 39,
      pub_status: "Ongoing",
      tags: ["Drama", "Magical Story", "Underdog Story"],
      synopsis: "Jasha is magicless. His classmates remind him his faults daily."
    });
  });

  it("streams encoded WEBTOON cover bytes with image headers and caching", async () => {
    const raw =
      "https://webtoon-phinf.pstatic.net/20251028_127/1) Thumb_Square_3174.jpg?type=q90";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "image/jpeg" },
      arrayBuffer: async () =>
        gif.buffer.slice(gif.byteOffset, gif.byteOffset + gif.byteLength)
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(req("/api/webtoon-search?imageUrl=" + encodeURIComponent(raw)), res);
    expect(res.headers["Content-Type"]).toBe("image/jpeg");
    expect(res.headers["Cache-Control"]).toBe("public, max-age=86400");
    expect(Buffer.from(res.body).equals(gif)).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("1)%20Thumb_Square_3174.jpg");
    expect(fetchMock.mock.calls[0][1].headers.Referer).toBe(
      "https://www.webtoons.com/"
    );
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toContain(
      "Chrome/131.0.0.0"
    );
  });

  it("proxies covers served from webtoons.com as well as the CDN", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "image/webp" },
      arrayBuffer: async () =>
        gif.buffer.slice(gif.byteOffset, gif.byteOffset + gif.byteLength)
    }));
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(
      req(
        "/api/webtoon-search?imageUrl=" +
          encodeURIComponent("https://www.webtoons.com/image/cover.webp")
      ),
      res
    );
    expect(res.headers["Content-Type"]).toBe("image/webp");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refuses to proxy non-WEBTOON image hosts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = mockRes();
    await handler(
      req(
        "/api/webtoon-search?imageUrl=" +
          encodeURIComponent("https://evil.example/cover.jpg")
      ),
      res
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.parse(res.body).error).toMatch(/Only WEBTOON cover images/);
  });
});
