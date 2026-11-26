// Bump VERSION whenever a new frontend build ships. The install step deletes
// older caches, so returning visitors pick up the new deploy on next load.
const VERSION = "2";
const C = "manhwa-tracker-v" + VERSION;
const PREFIX = "manhwa-tracker-v";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== C)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/supabase\.co|anilist\.co/.test(url.host)) return;
  // Config is environment-specific and must never be served from a stale cache.
  if (url.pathname.endsWith("/config.js")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(C).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || caches.match("./index.html"))
      )
  );
});
