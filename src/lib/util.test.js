import { afterEach, describe, expect, it, vi } from "vitest";
import { proxyCover } from "./util";

afterEach(() => vi.unstubAllGlobals());

describe("proxyCover", () => {
  it("proxies WEBTOON CDN URLs, including spaces and parentheses", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    const raw =
      "https://webtoon-phinf.pstatic.net/20251028_127/1) Thumb_Square_3174.jpg?type=q90";
    expect(proxyCover(raw)).toBe(
      "http://localhost:5173/api/webtoon-search?imageUrl=" +
        encodeURIComponent(raw)
    );
  });

  it("proxies webtoons.com covers but not other hosts", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    expect(proxyCover("https://www.webtoons.com/image/cover.jpg")).toContain(
      "/api/webtoon-search?imageUrl="
    );
    expect(proxyCover("https://cdn.example/cover.jpg")).toBe(
      "https://cdn.example/cover.jpg"
    );
  });

  it("never double-proxies an already rewritten cover", () => {
    vi.stubGlobal("window", { location: { origin: "http://localhost:5173" } });
    const proxied =
      "/api/webtoon-search?imageUrl=" +
      encodeURIComponent("https://webtoon-phinf.pstatic.net/cover.jpg");
    expect(proxyCover(proxied)).toBe(proxied);
  });
});
