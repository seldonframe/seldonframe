# Claim-flow origin fix — /record host-pin + allowlisted return + honest compile errors

**Date:** 2026-07-15 · **Branch:** `fix/claim-compile-origin-split` (off `origin/main` @ `1aa7bf4c9`) · **Status:** design approved by Max (incl. the SEO canonical move) · **Flag:** none (bug fix)

## 0. One sentence

Pin `/record` to the app host (the same pattern `/signup` already uses), add `/record` to the post-auth redirect allowlist, and make compile failures visible — so both the signed-in compile-in-place path and the anonymous claim round-trip actually work.

## 1. The bug (log-proven, 2026-07-15 run — crm-log-export-2026-07-15T22-02-32.json)

Max (signed in on app.seldonframe.com) recorded on www.seldonframe.com/record → clicked "claim & compile" → `/signup?callbackUrl=%2Frecord%3Fsession…` → www→app host-pin (query preserved) → proxy's already-authed branch called `toInternalRedirectPath("/record?…")` → **`/record` is not in `SAFE_REDIRECT_PREFIXES` → null → fell through to /dashboard**. In parallel the compile POST fired on www with no visible session → 401 ×3 (by authz design). Net: no agent compiled, no error shown, dashboard dump.

Root causes, ranked:
1. Session cookie is host-only (deliberate — see §2), so www never sees an app login → signed-in users are mis-routed into the claim hop at all.
2. `/record` missing from `SAFE_REDIRECT_PREFIXES` (lib/auth/signup-redirect.ts) → the claim RETURN leg has been broken for anonymous signups too, since the feature shipped.
3. Compile failure is swallowed when navigation happens — Optimistic Path.

## 2. Decisions

| Decision | Choice | Why |
|---|---|---|
| Cross-host session visibility | **Host-pin /record to app host** via the exact `redirectToAppHostIfNeeded` pattern in `(auth)/signup/page.tsx:63-72` (query-preserving; localhost/127.0.0.1/*.vercel.app exempt) | Cookie-domain scoping to `.seldonframe.com` is REJECTED: two documented prod incidents (PKCE-cookie note in signup-redirect.ts header; 2026-07-04 Google OAuth `InvalidCheck` in signup/page.tsx:37-49) led this repo to deliberately choose host-only cookies + page pinning. Follow the house pattern. |
| Return leg | Add `/record` to `SAFE_REDIRECT_PREFIXES` with a dated comment (house style — every entry documents its flow) | Shared open-redirect policy stays single-source; query strings already survive validation (path-only prefix check). |
| SEO | Canonical + sitemap move to `https://app.seldonframe.com/record`; www 307s | **Max approved 2026-07-15.** Redirect preserves link equity; a working claim loop outranks canonical purity. |
| Helper reuse | Extract `redirectToAppHostIfNeeded` (+ its two host helpers) from signup/page.tsx into `lib/auth/app-host-redirect.ts`; signup AND record import it | Second occurrence of the identical host-pin (copy-paste-twice threshold met); policy drift between the two would recreate this bug class. Extraction is byte-behavior-preserving for signup. |
| Compile errors | No navigation while compile in flight; `!res.ok` renders an inline error + retry near the CTA; the claim anchor never renders for authed visitors (existing `isAuthed` prop) | Never-lies at the funnel's money moment. |

## 3. Changes

1. **New `packages/crm/src/lib/auth/app-host-redirect.ts`** — move `normalizeHost`, `isExemptHost`, `redirectToAppHostIfNeeded(path, search)` verbatim from `(auth)/signup/page.tsx`; signup imports from it (no behavior change — its existing comments move with it).
2. **`(public)/record/page.tsx`** — first statement of the page: `await redirectToAppHostIfNeeded("/record", search)` where `search` is rebuilt from the already-awaited `searchParams` (session/claimed/shared — preserve exactly, URL-encoded). Update `metadata.alternates.canonical` to the app-host URL.
3. **`lib/auth/signup-redirect.ts`** — `SAFE_REDIRECT_PREFIXES` gains `"/record"` with a dated comment naming this incident.
4. **`app/sitemap.ts`** — the `/record` entry emits the app-host absolute URL (read how `base` is derived first; if base is host-dependent, emit the app origin explicitly for this entry).
5. **`(public)/record/record-client.tsx`** — audit the compile failure path: `setMessage` result must render adjacent to the compile CTA with a retry button, and no code path may navigate away while `compiling` is true. Fix only what the audit finds; minimal diff.

## 4. Tests (node:test, judge by delta)

- `tests/unit/auth/app-host-redirect.spec.ts` (new): exempt hosts (localhost, 127.0.0.1, x.vercel.app, empty) → no redirect; app host → no redirect; www/apex → redirect to `${appOrigin}${path}${search}` with query intact (multi-param, URL-encoded values).
- `tests/unit/auth/signup-redirect.spec.ts` (extend): accepts `/record`, `/record?session=abc&claimed=1`; still rejects `/recordings`, `/recordx` (prefix must match segment boundary: `/record` exact or `/record/...`), `//record`, `/record/../oauth`.
- Existing `record-page-render.spec.ts` + full suite: zero new failures vs baseline.
- Signup pages: `tsc` + existing auth specs prove the extraction is import-only.

## 5. Rollout & smoke (no flag)

Merge → deploy → smoke: (a) `curl.exe -I https://www.seldonframe.com/record?session=x&claimed=1` → 307 to `https://app.seldonframe.com/record?session=x&claimed=1` (query byte-identical); (b) app-host /record → 200 + sentinel; (c) Max manual: signed-in run compiles in place with NO signup hop; (d) anonymous incognito run: record → claim → magic link → lands back on `/record?claimed=1` with recap restored → compile succeeds.

## 6. Out of scope

Slice 2 (interview one-question-at-a-time + recap palette/font) · any cookie-domain change · /record on workspace subdomains (stays unrouted there).
