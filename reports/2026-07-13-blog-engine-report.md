# /blog Article Engine — Build Report (2026-07-13)

## Files changed

**Created:**
- `packages/crm/src/lib/seo/blog/types.ts` — `BlogArticle`/`BlogSection`/`BlogCallout`/`BlogFaq`/`BlogSource`/`BlogSourceVideo` types.
- `packages/crm/src/lib/seo/blog/why-original-content-wins-seo.ts` — the seed `BlogArticle` (POV piece, no `sourceVideo`).
- `packages/crm/src/lib/seo/blog/index.ts` — `BLOG_ARTICLES` registry + `getBlogArticle`/`allBlogSlugs`/`articlesNewestFirst`.
- `packages/crm/src/lib/seo/blog-markdown.ts` — `renderBlogMarkdown(slug)`, mirrors `guide-markdown.ts`.
- `packages/crm/src/components/seo/blog-page.tsx` — `BlogArticlePage` server component (dark `MarketingShell` chrome, `.marketing-prose` rhythm matching `why-mcp`), + `blogMetaFor`.
- `packages/crm/src/app/(marketing)/blog/[slug]/page.tsx` — dynamic route (`generateStaticParams`/`generateMetadata`/default export).
- `packages/crm/src/app/blog/why-original-content-wins-seo.md/route.ts` — the `.md` twin for the seed article.
- `packages/crm/tests/unit/seo/blog.spec.ts` — 17 tests mirroring `guides.spec.ts`'s structural/never-lies gate, adapted for `BlogArticle`'s optional `faq`/`sourceVideo`/`relatedTool`/`relatedGuide`.

**Updated:**
- `packages/crm/src/app/(marketing)/blog/page.tsx` — renamed `POSTS` → `HAND_CODED_POSTS`, added `registryPosts()` (maps `articlesNewestFirst()` into the same `Post` shape, deduped by slug against hand-coded posts), `POSTS = [...HAND_CODED_POSTS, ...registryPosts()]`. `why-mcp` untouched and still renders from its own static route.
- `packages/crm/src/app/sitemap.ts` — added `import { allBlogSlugs } from "@/lib/seo/blog"` + a Blog block after the Guides block: `/blog` hub (priority 0.6, weekly) + one entry per `allBlogSlugs()` (priority 0.6, monthly) — same shape as guides.
- `packages/crm/src/app/llms.txt/route.ts` — added `import { allBlogSlugs, getBlogArticle } from "@/lib/seo/blog"` + a `## Blog (original, sourced articles)` section after the Guides section, same per-article loop pattern.
- `docs/ops/agents/blog-loop.md` Step 5 — rewritten: the loop now publishes a `BlogArticle` registry entry (`lib/seo/blog/<slug>.ts` + `.md` twin route + wire into `blog/index.ts`) instead of a bare markdown draft; `sourceVideo` now called out as REQUIRED for loop articles; removed the stale "live-on-site note" (the engine is live now); kept the draft-first PR gate and auto-merge-flip note verbatim.

No other files were touched. `guide-inline.ts`, `author-byline.tsx`, `guide-markdown.ts`, `guide-page.tsx`, `guides/index.ts`, `guides/types.ts` are all imported-from, never modified.

## Reuse (per the spec's anchors)

- `tokenizeInlineMarkup`/`stripInlineMarkup`/`startsWithKindOfLike` imported directly from `lib/seo/guide-inline.ts` — no fork, no copy. Used in both `blog-page.tsx` (React rendering, restyled for the dark chrome) and `blog-markdown.ts` (twin + callout degrade).
- `AUTHOR`/`authorPersonLd`/`articleLd` imported directly from `components/seo/author-byline.tsx` — same author, same JSON-LD builder, on every blog article.
- No new IndexNow code — `app/api/cron/indexnow/route.ts` already reads the whole sitemap, and blog URLs are now in it via `sitemap.ts`.
- `logMarkdownFetch`'s `MarkdownSurface` union does not have a `"blog"` member (only `"guide"` exists for long-form-article twins). Rather than touch `lib/marketplace/md-analytics.ts` (out of the plan's file list), the `.md` route reuses the existing `"guide"` surface literal — it's type-valid and groups blog fetches with the other long-form-article twin, which is a reasonable interim label. Flagged here as a deviation, not silently done.
- `renderInlineMarkup` was mirrored into `blog-page.tsx` (not extracted into a shared `components/seo/inline-markup.tsx`) per the spec's own fallback instruction ("mirror to avoid touching the live guide page") — the two callers render into visually different chromes (light MKT vs. dark Tailwind), so a shared helper would need a style-injection parameter; mirroring stayed the minimal-impact choice.

## Seed article — WebFetch-verified sources

Both sources were fetched live via WebFetch during this build (not from training-data memory):
1. `https://developers.google.com/search/docs/essentials/spam-policies` — verified the exact "scaled content abuse" definition ("many pages are generated for the primary purpose of manipulating search rankings and not helping users") and its example list (AI-generated pages without added value, scraped/combined content, thin keyword-capture pages).
2. `https://developers.google.com/search/docs/fundamentals/creating-helpful-content` — verified the "who, how, why" framework and the exact quotes used in the article ("perhaps the most important question", "extensive automation to produce content on many topics").

No statistics are invented anywhere in the article — every quoted phrase traces to one of these two pages, cited in `sources`. `sourceVideo` is intentionally omitted (this is the non-video-sourced case the type must also support).

## Test results

`node --import tsx --test tests/unit/seo/blog.spec.ts`:
```
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

`node --import tsx --test tests/unit/seo/guides.spec.ts` (untouched, still green):
```
ℹ tests 861
ℹ pass 861
ℹ fail 0
```

Combined run (`blog.spec.ts tests/unit/seo/guides.spec.ts`): 878 tests, 878 pass, 0 fail.

## tsc

`npx tsc --noEmit -p tsconfig.json` — one error, the pre-existing known one:
```
src/app/api/copilot/turn/route.ts(315,9): error TS2353: ... 'persist' does not exist ...
```
No new errors introduced by this slice.

## pnpm build

`NODE_OPTIONS=--max-old-space-size=6144 pnpm build` completed successfully (full route manifest printed, no error output). Confirmed via `.next/server/app` output:
- `(marketing)/blog/page` (index) — builds.
- `(marketing)/blog/why-mcp/page` (static hand-coded post) — builds, untouched.
- `(marketing)/blog/[slug]/page` (new dynamic registry route) — builds, coexists with `why-mcp` with no parallel-route conflict (Next static > dynamic precedence holds, as the spec predicted).
- `app/blog/why-original-content-wins-seo.md/route` (the `.md` twin) — builds.

`pnpm check:use-server` also run (not explicitly required by the task's verify list but part of the standing SeldonFrame gate): `✓ All 'use server' files export only async functions / types.`

## Deviations from spec

1. `MarkdownSurface` reuse — see "Reuse" section above; used `"guide"` instead of adding a new `"blog"` literal to `lib/marketplace/md-analytics.ts`, to avoid touching a file outside the plan's list. If Max wants blog fetches tracked as their own analytics bucket, that's a one-line follow-up (add `"blog"` to the union + update the `.md` route + this note).
2. `renderInlineMarkup` was mirrored, not extracted to a shared module — per the spec's own conditional instruction, since the two page components render into different visual chromes.
3. Blog index ordering: `HAND_CODED_POSTS` (why-mcp live + 2 "coming soon" stubs) render first, then registry articles newest-first. The spec only required "list `articlesNewestFirst()` alongside the existing hand-coded posts (dedupe by slug)" without specifying interleave order; this was the minimal-diff choice (append, don't reshuffle the existing array).

## Open risks

- The `MarkdownSurface` "guide" reuse for blog `.md` fetches (item 1 above) is a labeling compromise Max may want revisited if blog analytics need their own bucket.
- The blog-loop.md Step 5 rewrite is a doc-only change; it hasn't been exercised by an actual loop run yet — the next real loop invocation will be the first live test of the new registry-entry publish flow.
