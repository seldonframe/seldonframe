// v1 PWA service worker (hand-rolled — see plan Decision #2).
//
// Scope is set at registration time to /portal/<orgSlug>/ so each
// installed contractor app controls only its own workspace path.
//
// Strategy:
//   - install: precache the app shell (icons + the offline fallback).
//   - fetch (navigations / documents): network-first, fall back to the
//     cached offline page when the network is unavailable.
//   - fetch (immutable static assets): stale-while-revalidate.
//   - everything else (RSC navigations, server actions, dynamic GET,
//     cross-origin, non-GET, API): network passthrough — never cached.
//
// Data + rendered pages always need the network; we deliberately do NOT
// cache API, server-action, OR React Server Component (RSC) responses.
// They're workspace-scoped, change often, AND — critically — RSC
// payloads embed deploy-pinned chunk references. A cached RSC payload
// from a previous deploy points at chunk filenames that 404 on the new
// deploy, which breaks client-side navigation in the installed app
// ("works on desktop, breaks on mobile after install"). Only content-
// hashed, immutable assets under /_next/static/ are safe to cache.

const CACHE = "sf-pwa-shell-v2";
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

// Only content-hashed, immutable build output is safe to cache. Next.js
// fingerprints everything under /_next/static/ (chunks, css, media), so
// a cached entry there is valid forever (the URL changes when the
// content changes). We do NOT cache /_next/image, /_next/data, or any
// app route — those are dynamic / deploy-coupled.
function isImmutableStaticAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

// React Server Component payloads (client-nav + prefetch) are GET
// requests whose Accept is */* (not text/html), so they would otherwise
// fall through to the asset branch. Detect + exclude them explicitly so
// a stale RSC can never be served across a deploy.
function isRscRequest(req, url) {
  return (
    req.headers.get("RSC") === "1" ||
    req.headers.get("Next-Router-Prefetch") === "1" ||
    (req.headers.get("accept") || "").includes("text/x-component") ||
    url.searchParams.has("_rsc")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Top-level navigations / HTML documents → network-first, offline
  // fallback. RSC navigation fetches are NOT documents (they must always
  // hit the network so they stay in lockstep with the live deploy).
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

  // Immutable static assets → stale-while-revalidate. Everything else
  // (RSC navigations, server actions, /_next/image, /_next/data, dynamic
  // GET) → network passthrough so it can never go stale across a deploy.
  if (!isImmutableStaticAsset(url) || isRscRequest(req, url)) {
    return; // let the browser handle it against the network
  }

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
