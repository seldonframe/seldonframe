# Plan — extraction-failed honesty + contact-page fallback

Spec: `docs/superpowers/specs/2026-07-14-extraction-failed-honesty-and-contact-fallback-design.md`
Worktree: `.claude/worktrees/extraction-fallback` · branch `feature/extraction-contact-fallback` (off `origin/main` @ `5a739dad9`)

Commit per task. TDD: write/extend the spec file first, watch it fail, implement, watch it pass.
Regression set: `node --test --import tsx` over `packages/crm/tests/unit/web-onboarding/*.spec.ts*` + `packages/crm/tests/unit/web-build-stream-route.spec.ts`.

## Task 1 — `contact-page-candidates.ts` (pure helper + spec)

New: `packages/crm/src/lib/web-onboarding/contact-page-candidates.ts`
New: `packages/crm/tests/unit/web-onboarding/contact-page-candidates.spec.ts`

```ts
export function findContactPageCandidates(markdown: string, baseUrl: string): string[]
```

Rules (from spec): harvest `[text](href)` links; resolve relative hrefs against
baseUrl; same-hostname only; pathname match
`/(contact|about|location|visit|find[-_]?us)/i`; rank contact-matching paths
before about/other; dedupe on origin+pathname; exclude baseUrl's own
origin+pathname; cap 2; when zero matches return
`[origin + "/contact", origin + "/contact-us"]`. Invalid baseUrl → `[]`
(defensive; callers pass a vetted URL). No IO. ~60-80 LOC prod.

## Task 2 — fallback inside `markdown-extractor.ts` (+ spec extensions)

Edit: `packages/crm/src/lib/web-onboarding/markdown-extractor.ts`
Edit: `packages/crm/tests/unit/web-onboarding/markdown-extractor.spec.ts`

- Extract existing steps 2+3 (Anthropic call w/ error mapping + pickText +
  parseExtraction + logging) into `runExtractionOnce({ client, model, md, url, attempt })`
  returning `ExtractedBusinessFacts` or throwing the same WebFetchErrors.
  Add `attempt` to the two warn-log payloads; keep every other field.
- Main flow: attempt 1 on homepage MD. Catch ONLY
  `WebFetchError` with reason `extraction_failed` thrown by the parse/empty-text
  path of attempt 1 (Anthropic 401/402/429/internal rethrow immediately — use a
  narrow flag from runExtractionOnce, e.g. it throws a `ParseFailed` marker
  subclass or returns a discriminated result, implementer's choice, keep it
  simple).
- Fallback: `findContactPageCandidates(homepageMd, scrape.finalUrl)` → up to 2
  `firecrawlScrape` calls via `Promise.allSettled` (reuse
  `params.firecrawlClient` seam); skip failures; log
  `markdown_extractor_contact_fallback` `{ url, candidates, scraped_ok }`
  (console.warn JSON, house style).
- If ≥1 ok: attempt 2 on
  `homepageMd + candidates.map(c => "\n\n--- Additional page: " + c.url + " ---\n" + c.md.slice(0, 20_000)).join("")`.
- Success (either attempt) → fall through to the EXISTING image-harvest block
  unchanged (it reads the homepage `scrape`), return facts.
- Both attempts failed / no candidates ok → throw
  `WebFetchError("extraction_failed", "The model returned no usable JSON.")`
  exactly as today.
- Tests per spec §Tests (4 new cases; keep the existing 5 green; mock
  firecrawlClient.scrape resolves different MD per URL).

## Task 3 — honest 422 message in the orchestrator (+ spec extension)

Edit: `packages/crm/src/lib/web-onboarding/run-create-from-url.ts` (step-5 catch)
Edit: `packages/crm/tests/unit/web-onboarding/route-create-from-url.spec.ts`

```ts
const reason = (err as { reason?: string }).reason ?? "extraction_failed";
sse.error(422, reason === "extraction_failed"
  ? { reason, message: "We read that site but couldn't find the basics we need — a business name, location, and phone number. Try a different URL, or describe your business instead." }
  : { reason });
```

Test: extraction_failed 422 frame contains `"message"`; a different reason
(e.g. `anthropic_unauthorized`) contains no message.

## Task 4 — `/try` error panel honesty

Edit: `packages/crm/src/app/(public)/try/try-client.tsx`

- Error listener: parse `reason` (`data as { code?; reason?; message? }`),
  add `const [extractionFailed, setExtractionFailed] = useState(false)`.
- Render (error panel, `phase === "error"`):
  - `rateLimited` branch unchanged.
  - `extractionFailed` branch: message text; row with
    "Try a different URL" button → `reset()` (secondary style:
    `rounded-[11px] border border-[rgba(34,29,23,.16)] bg-[#FFFDFA] …`) and
    "Describe your business instead" link → `/signup` (primary style:
    `rounded-[11px] bg-[#1F2B24] text-[#FFFDFA] …` — match main's forest
    tokens, NOT the stale #00897B).
  - else: existing Try again button.
- `reset()` already clears state; keep `url` in the input so "Try a different
  URL" lets them edit.
- No new spec file (no DOM harness for this component today); tsc covers types.

## Task 5 — docs commit hygiene

Spec + plan committed as the first commit (already staged before Task 1).
File-header comment in try-client.tsx: update the "URL builds only" doc note
if touched lines make it stale. CHANGELOG not used in this repo — skip.

## Verify

`verify-runner` in this worktree: unit tests + `tsc --noEmit` (stash-delta
method per memory: judge by delta vs baseline, junctioned node_modules from
guardian) + check-use-server + migration-journal (no-op — no migrations) +
regression grep. Then GATE 2 (Max merges).
