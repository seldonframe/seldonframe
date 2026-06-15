// v1 PWA service worker (hand-rolled — see plan Decision #2).
//
// Scope is set at registration time to /portal/<orgSlug>/ so each
// installed contractor app controls only its own workspace path.
//
// Strategy:
//   - install: precache the app shell (icons + the offline fallback).
//   - fetch (navigations / documents): network-first, fall back to the
//     cached offline page when the network is unavailable.
//   - fetch (same-origin static GET): stale-while-revalidate.
//   - everything else (cross-origin, non-GET, API): pass through.
//
// Data always needs the network; we deliberately do NOT cache API or
// server-action responses (they're workspace-scoped + change often).

const CACHE = "sf-pwa-shell-v1";
const PRECACHE = ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // The per-scope offline page lives under the registration scope;
      // resolve it relative to the SW's own scope.
      const scope = new URL(self.registration.scope);
      const offlineUrl = new URL("offline", scope).pathname;
      await cache.addAll([...PRECACHE, offlineUrl]);
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigations / HTML documents → network-first, offline fallback.
  const isDocument =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  if (isDocument) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch {
          const cache = await caches.open(CACHE);
          const scope = new URL(self.registration.scope);
          const offlineUrl = new URL("offline", scope).pathname;
          const cached = await cache.match(offlineUrl);
          return cached ?? new Response("You're offline.", { status: 503 });
        }
      })(),
    );
    return;
  }

  // Static same-origin assets → stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached ?? network;
    })(),
  );
});
