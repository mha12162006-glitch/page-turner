import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webtoonSearch from "./api/webtoon-search.js";

const FALLBACK_IMAGE = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

/** Run the Vercel function during `npm run dev` without a second server. */
function webtoonApi() {
  return {
    name: "webtoon-search-api",
    configureServer(server) {
      server.middlewares.use("/api/webtoon-search", (req, res, next) => {
        if (req.method !== "GET") return next();
        const url = new URL(req.url || "", "http://localhost");
        // All modes (search, detail and image proxy) share the Vercel handler:
        // ?q=..., ?url=... / ?titleNo=..., ?imageUrl=..., and Comix's
        // ?source=comix&q=..., ?source=comix&slug=... / &url=..., or
        // ?source=comix&imageUrl=... for its covers.
        // Signed tokens, cookie/Referer headers and encodeImageUrl() live there
        // too, so `npm run dev` and Vercel behave identically.
        req.query = Object.fromEntries(url.searchParams);
        Promise.resolve(webtoonSearch(req, res)).catch((error) => {
          console.error("WEBTOON API failed:", error);
          if (res.headersSent) return res.end();
          if (url.searchParams.has("imageUrl")) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "image/gif");
            return res.end(FALLBACK_IMAGE);
          }
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify({ results: [], result: {} }));
        });
      });
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), webtoonApi()]
});
