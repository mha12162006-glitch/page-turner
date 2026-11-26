import { describe, expect, it } from "vitest";
import {
  mergeResults,
  parseImmediate,
  parseSearchHtml
} from "./webtoon-search.js";

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
      <a href="https://www.webtoons.com/en/canvas/city-of-light/list?title_no=12345"
         class="link _card_item" data-title-no="12345" data-webtoon-type="CHALLENGE">
        <img src="/20260101_1/city.jpg?type=q90">
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

describe("WEBTOON search normalization", () => {
  it("parses Originals and Canvas cards into shared fields", () => {
    const rows = parseSearchHtml(searchHtml);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      title: "Don't Enter the House Pool",
      author: "Toffuo",
      genre: "Horror",
      webtoon_id: "7580",
      type: "Webtoon"
    });
    expect(rows[0].cover_url).toContain("webtoon-phinf.pstatic.net");
    expect(rows[1]).toMatchObject({
      title: "City of Light",
      author: "IsaacTheRaccoon",
      genre: "Canvas",
      webtoon_id: "12345",
      type: "Webtoon"
    });
    expect(rows[1].cover_url).toBe("https://webtoon-phinf.pstatic.net/20260101_1/city.jpg?type=q90");
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
  });

  it("keeps the first copy when both endpoints return the same title", () => {
    const rows = mergeResults(
      [{ title: "City of Light", webtoon_id: "12345" }],
      [{ title: "City of Light", webtoon_id: "12345" }, { title: "Other", webtoon_id: "9" }]
    );
    expect(rows.map((row) => row.title)).toEqual(["City of Light", "Other"]);
  });
});
