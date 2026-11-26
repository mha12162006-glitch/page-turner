import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webtoonSearch from "./api/webtoon-search.js";

/** Run the Vercel function during `npm run dev` without a second server. */
function webtoonApi() {
  return {
    name: "webtoon-search-api",
    configureServer(server) {
      server.middlewares.use("/api/webtoon-search", (req, res, next) => {
        if (req.method !== "GET") return next();
        const url = new URL(req.url || "", "http://localhost");
        req.query = Object.fromEntries(url.searchParams);
        Promise.resolve(webtoonSearch(req, res)).catch((error) => {
          console.error("WEBTOON search failed:", error);
          if (!res.headersSent) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
          }
          res.end(JSON.stringify({ results: [] }));
        });
      });
    }
  };
}

export default defineConfig({
  base: "./",
  plugins: [react(), webtoonApi()]
});
