// public/record-sw.js
//
// SEPARATE, minimal service worker for the Web Share Target flow on
// /record. Deliberately NOT merged into sw.js — that worker is scoped to
// /portal/<orgSlug>/ (see its own header) and this repo keeps that scope
// untouched. This worker exists for exactly one purpose: intercept the
// Share Target POST so a shared screen-recording file never has to cross
// the network as a request body. Vercel functions cap POST bodies at
// ~4.5MB and screen recordings routinely exceed that, so the file is
// staged on-device in CacheStorage instead, and the browser is redirected
// to /record, which reads the staged file back out and runs it through the
// EXISTING upload path (record-client.tsx's handleFilePicked).
//
// Constants below MUST match src/lib/recordings/share-target.ts — this file
// can't `import` that TS module (it's an unbundled script served straight
// from /public), so the two are kept in sync by hand. share-target.spec.ts
// pins the TS-side values; a change here needs the matching change there.
const SHARE_TARGET_PATH = "/record/share-target";
const SHARE_CACHE_NAME = "sf-record-share";
const STAGED_RECORDING_CACHE_KEY = "/record/__staged-recording__";

// No precaching, no offline handling — this worker does exactly one thing.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Every request other than an exact POST to SHARE_TARGET_PATH falls through
// untouched (no event.respondWith at all) — this worker must never affect
// ordinary navigation, static assets, or API calls.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "POST") return;

  const url = new URL(req.url);
  if (url.pathname !== SHARE_TARGET_PATH) return;

  event.respondWith(
    (async () => {
      try {
        const formData = await req.formData();
        const file = formData.get("recording");
        if (file) {
          const cache = await caches.open(SHARE_CACHE_NAME);
          await cache.put(
            STAGED_RECORDING_CACHE_KEY,
            new Response(file, {
              headers: { "Content-Type": file.type || "application/octet-stream" },
            }),
          );
        }
      } catch {
        // Malformed/empty share payload — fall through to the redirect
        // regardless; the client shows its "couldn't find" fallback message
        // when the cache read comes up empty.
      }
      // 303 so the browser issues a GET against /record instead of
      // re-POSTing the share payload.
      return Response.redirect("/record?shared=1", 303);
    })(),
  );
});
