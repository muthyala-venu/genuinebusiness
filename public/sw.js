/* Genuine Business service worker — offline app-shell cache.
   Only static assets are cached. API responses are per-user live data
   and must NEVER be cached (a cached identity/ledger would leak across logins). */
const CACHE = "genuine-business-v2";
const CORE = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  // API calls are always live — bypass the cache entirely.
  try {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      e.respondWith(fetch(request));
      return;
    }
  } catch {
    e.respondWith(fetch(request));
    return;
  }
  // Navigation: network-first, fall back to cached shell for offline / Add-to-Home-Screen launches.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request).catch(() => caches.match("/index.html"))
    );
    return;
  }
  // Assets: cache-first.
  e.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
          return res;
        }).catch(() => hit)
    )
  );
});
