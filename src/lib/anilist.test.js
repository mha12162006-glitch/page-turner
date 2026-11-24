import { describe, expect, it } from "vitest";
import { officialReadUrl } from "./anilist";

describe("officialReadUrl", () => {
  it("picks an official streaming platform, preferring the requested order", () => {
    const url = officialReadUrl([
      {
        url: "https://page.kakao.com/content/1",
        type: "STREAMING",
        site: "KakaoPage"
      },
      {
        url: "https://tapas.io/series/example",
        type: "STREAMING",
        site: "Tapas"
      },
      {
        url: "https://www.tappytoon.com/en/book/example",
        type: "STREAMING",
        site: "Tappytoon"
      }
    ]);
    expect(url).toBe("https://tapas.io/series/example");
  });

  it("falls back to the explicit Official Site link", () => {
    expect(
      officialReadUrl([
        {
          url: "https://publisher.example/series",
          type: "INFO",
          site: "Official Site"
        }
      ])
    ).toBe("https://publisher.example/series");
  });

  it("never returns an unofficial aggregator or scanlation site", () => {
    expect(
      officialReadUrl([
        {
          url: "https://mangadex.org/title/example",
          type: "STREAMING",
          site: "MangaDex"
        },
        {
          url: "https://scanlation.example/series",
          type: "INFO",
          site: "Some Scanlation"
        }
      ])
    ).toBe("");
  });

  it("rejects a trusted site name when its domain is not the official one", () => {
    expect(
      officialReadUrl([
        {
          url: "https://mirror.example/tapas",
          type: "STREAMING",
          site: "Tapas"
        }
      ])
    ).toBe("");
  });
});
