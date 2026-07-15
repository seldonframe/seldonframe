# Extraction-failed honesty + contact-page fallback — design

**Date:** 2026-07-14 · **Branch:** `feature/extraction-contact-fallback` · **Status:** approved (Max, in-chat 2026-07-14)

## Problem (observed in prod, Vercel log export 2026-07-14)

`seldonframe.com/try?url=https://medspabybeautybar.com/` failed twice with
`markdown_extractor_parse_failed … text_preview: {"_error": "extraction_failed"}`.

Ground truth (verified by fetching the site): the homepage has business name,
city/state (footer), and services — but **no phone number anywhere** (no `tel:`
links, no phone-shaped digits; the site runs CleanTalk contact obfuscation and
the number lives on its `/contact` page). `phone` is one of the six REQUIRED
extraction fields, so Opus correctly obeyed extraction-prompt rule 4
("NEVER invent → emit `{"_error": "extraction_failed"}`").

Two product defects fall out:

1. **Dishonest UI.** `run-create-from-url.ts` step 5 emits
   `sse.error(422, { reason: "extraction_failed" })` with no `message`, so
   `/try`'s error listener falls back to *"Something broke on our end. Give it
   another try."* + a **Try again** button. The condition is permanent for that
   URL — retrying can never succeed and burns the visitor's 3-builds/24h rate
   limit. This violates never-lies at the exact moment we're selling it.
2. **Single-page scrape misses contact pages.** Facts that live on `/contact`
   or `/about` are invisible, so a whole class of legitimate SMB sites can't
   build.

## Fix 1 — honest `extraction_failed` surface

- `run-create-from-url.ts` step-5 catch: when the mapped `reason` is
  `"extraction_failed"`, include a `message` in the 422 SSE error body:

  > "We read that site but couldn't find the basics we need — a business name,
  > location, and phone number. Try a different URL, or describe your business
  > instead."

  Other reasons (`anthropic_unauthorized`, `credits_exhausted`,
  `internal_error`) are untouched (Minimal Impact). `run-create-from-paste.ts`
  untouched (different failure semantics, out of scope).
- `try-client.tsx` error listener: also parse `reason` from the SSE error
  payload. When `reason === "extraction_failed"`:
  - show the server `message` (fallback to equivalent local copy),
  - **hide "Try again"** (futile); instead render two actions styled with the
    current forest tokens (`#1F2B24`, `rounded-[11px]`):
    - **"Try a different URL"** → `reset()` (back to idle with the input),
    - **"Describe your business instead"** → link to `/signup` (the paste/
      describe build path is authed-only today — documented deviation in the
      file header; we are NOT creating a public paste route).
  - all other errors keep today's behavior (rate-limited → signup CTA;
    generic → Try again).
- `/clients/new` (`clients-new-form.tsx`) already shows honest copy for
  extraction_failed — untouched.

## Fix 2 — contact-page fallback in the extractor

Seam: `packages/crm/src/lib/web-onboarding/markdown-extractor.ts`
(`extractBusinessFactsFromUrl`) so BOTH routes (public `/try` + authed
`/clients/new`) benefit with zero route changes.

New pure helper `packages/crm/src/lib/web-onboarding/contact-page-candidates.ts`:

```
findContactPageCandidates(markdown: string, baseUrl: string): string[]
```

- Harvest markdown links (`[text](href)`, absolute or relative), resolve
  against `baseUrl`.
- Keep **same-host only** (exact hostname match — the base URL was already
  SSRF-vetted at the route boundary; same-host paths can't change the target).
- Keep links whose pathname matches `/(contact|about|location|visit|find[-_]?us)/i`.
- Rank: contact > about > everything else; dedupe on origin+pathname (strip
  query/hash); exclude the base page itself; **cap at 2**.
- If zero candidates found, fall back to guesses
  `[origin + "/contact", origin + "/contact-us"]` (Firecrawl failure on a 404
  guess is handled gracefully below).

`markdown-extractor.ts` flow change (behavior on main, which already includes
the PR #70/#71 image-harvest merge, is preserved):

1. Scrape homepage (unchanged, including html/ogImage/favicon capture).
2. Refactor the Anthropic call + error mapping + parse into an internal
   `runExtractionOnce(md)` helper (pure refactor of existing code — the
   401/402/429 mapping and the `markdown_extractor_parse_failed` /
   `markdown_extractor_empty_text` logging keep their exact shapes, with an
   added `attempt` field).
3. On FIRST parse failure (`parseExtraction` not ok — covers both the
   `_error` sentinel and malformed JSON; NOT Anthropic API errors, which
   throw immediately as today):
   - `findContactPageCandidates(homepageMd, finalUrl)`,
   - scrape up to 2 candidates via `firecrawlScrape` (`Promise.allSettled`;
     a failed/thin candidate is skipped, never fatal),
   - log `markdown_extractor_contact_fallback`
     `{ url, candidates, scraped_ok }`,
   - if ≥1 candidate scraped ok: re-run `runExtractionOnce` ONCE on
     `homepageMd + "\n\n--- Additional page: <url> ---\n" + candidateMd`
     (each candidate MD truncated to 20 000 chars),
   - if the second attempt succeeds → continue to the image-harvest block
     exactly as today (harvest still reads the HOMEPAGE scrape's html —
     contact-page image harvest is out of scope).
4. If no candidate scraped ok, or the second attempt also fails → throw
   `WebFetchError("extraction_failed", …)` as today.

Cost ceiling: worst case +2 Firecrawl scrapes + 1 Opus call, only on the
previously-dead extraction-failure path. Success results are already cached
per-URL on the public route (`withUrlExtractionCache` — failures are never
cached, verified).

## Tests (node:test + tsx, DI seams already exist)

- `contact-page-candidates.spec.ts` (new, pure): absolute/relative resolution,
  cross-host exclusion, ranking, dedupe, cap 2, self-exclusion, guess
  fallback.
- `markdown-extractor.spec.ts` (extend, mocked Firecrawl + Anthropic):
  1. first attempt `_error` → candidate scraped → second attempt succeeds →
     facts returned; second LLM message contains both MDs; Firecrawl called
     with the candidate URL.
  2. fallback also fails → `WebFetchError(extraction_failed)`; LLM called
     exactly twice.
  3. no candidates in MD + guess scrapes fail → throws; LLM called once.
  4. Anthropic 401 on first attempt → NO fallback (immediate
     `anthropic_unauthorized`).
  5. existing 5 tests keep passing unchanged.
- `route-create-from-url.spec.ts` (extend): extraction_failed 422 event now
  carries `message` + `reason`.
- `try-client` error-panel states are covered by eyeball + the existing
  clients-new-form patterns; no new DOM spec (the component has no spec today
  and the logic delta is a conditional render).

## Out of scope (explicitly)

- Public anonymous paste/describe route.
- `run-create-from-paste.ts` message copy.
- Contact-page image harvesting.
- Firecrawl-level caching behavior (their default scrape cache may serve the
  same content on quick retries — orthogonal).

## Verification

- `/verify-build` via `verify-runner` in this worktree (unit tests + tsc +
  check-use-server + migration-journal + regression grep). No migrations, no
  new deps, no env changes.
- Post-merge live smoke: rebuild `https://medspabybeautybar.com/` on /try —
  expect either a successful build (phone found on /contact) or the honest
  message with the two CTAs. This is the staging-verified claim (L-06);
  everything before it is code-correct only.
