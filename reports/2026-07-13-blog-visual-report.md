# /blog visual redesign — build report (2026-07-13)

Worktree: `.claude/worktrees/blog-visual`, branch `feat/blog-visual-redesign`. Not committed (per instructions).

## Files changed

- `packages/crm/src/components/ui/hero-video-dialog.tsx` — NEW. Vendored Magic UI HeroVideoDialog, adapted with `useReducedMotion()` + `forceStatic` prop (skips the spring/scale entrance, opens instantly at end-state).
- `packages/crm/src/components/ui/highlighter.tsx` — NEW. Adapted from Magic UI's Highlighter. The upstream version depends on the `rough-notation` npm package, which is not installed in this repo and the worktree brief says deps are pinned/installed already — adding a new runtime dependency was out of scope, so this reproduces the same "marker sweep behind text" visual using only `motion/react` (already a dependency) + inline CSS, with the same `useReducedMotion`/`forceStatic` guardrail.
- `packages/crm/src/lib/seo/blog/types.ts` — EDITED. `BlogSection` now carries `diagram?: GuideDiagram` and `callout?: GuideCallout` (imported from `../guides/types`); `BlogCallout`/`BlogDiagram` kept as type aliases so `blog-markdown.ts` (untouched) keeps compiling. `BlogSourceVideo` gains `thumbnail?: string`. `BlogArticle` gains `heroStats?: { value: number; display: string; label: string }[]`.
- `packages/crm/tests/unit/seo/blog.spec.ts` — EDITED. Added a diagram-validation test (mirrors guides.spec.ts's diagram test verbatim, dispatched per diagram type) and a heroStats test (2-4 items, finite `value`, non-empty `display`/`label`).
- `packages/crm/src/components/seo/blog-page.tsx` — REWRITTEN. Light `sf-mkt`/MKT-palette theme (mirrors guide-page.tsx: `MarketplaceNav`/`Footer`, `MarketplaceStyles`, `GuideDiagramStyles`, `GuideDiagramView`, `CalloutBox`, `renderInlineMarkup`, `faviconUrl`, `AuthorByline`). All dark `#fafafa`/`#a1a1aa`/`#71717a` colors removed. Added: a `HeroVideoDialog` video hero (YouTube id parsed from `sourceVideo.url`, thumbnail defaults to the maxres YouTube thumbnail when `sourceVideo.thumbnail` is absent, embed src is the YouTube `/embed/<id>` URL) with a clickable "Source: <title> — <channel>" caption; a `heroStats` band rendered with `NumberTicker`; a `Highlighter` wrap on the first section's `<h2>` (subtle, one spot only — comprehension-first, not decoration). Kept Article + FAQPage JSON-LD (incl. `isBasedOn`) and stayed a server component (`HeroVideoDialog`/`NumberTicker`/`Highlighter` are the client leaves, imported not re-implemented).
- `packages/crm/src/lib/seo/blog/agents-are-the-new-saas.ts` — EDITED (content enrichment, no new claims). Added `sourceVideo.thumbnail` (derived maxres URL), `heroStats` (the $1,000/mo + $1,500 setup line at ~17:21, the 42/50 eval result at ~15:12, the 500-ticket outcome tier), a `tip` callout on shadowing the human (07:02), a `warning` callout on avoiding "agent slop" (09:21/11:39) plus a `stack` diagram of the four MUA types on the same section, and a `flow` diagram (Call comes in → Agent answers + qualifies → Books the job → Updates the CRM → Flags edge cases) on the distribution/teardown section (18:32). Every number/label traces to text already present in the article body — no new facts introduced.

Not touched: `packages/crm/src/components/seo/guide-page.tsx`, `guide-diagrams.tsx`, any file under `lib/seo/guides/`, the `/blog/[slug]/page.tsx` route (its `generateMetadata`/default export already just call `getBlogArticle`/`BlogArticlePage` — no signature changed, so it needed no edits), `packages/crm/src/lib/seo/blog-markdown.ts` (diagrams are intentionally skipped in the Markdown twin, same as guides — no crash, since the field is optional and unused there).

## Verify results

**`node --import tsx --test tests/unit/seo/blog.spec.ts`** — 31/31 pass:
```
ℹ tests 31
ℹ pass 31
ℹ fail 0
```

**`node --import tsx --test tests/unit/seo/guides.spec.ts`** — 861/861 pass (guides untouched, unaffected):
```
ℹ tests 861
ℹ pass 861
ℹ fail 0
```

**`npx tsc --noEmit -p tsconfig.json`** — one error, the pre-existing known one, no new errors:
```
src/app/api/copilot/turn/route.ts(315,9): error TS2353: Object literal may only specify known properties, and 'persist' does not exist in type '{ conversationId: string; userMessage: string; ... }'.
```

**`NODE_OPTIONS=--max-old-space-size=6144 pnpm build`** — completed, **exit code 0**. Full route manifest printed (static + dynamic pages incl. the dynamic `/blog/[slug]` segment); the captured log tail shows no "error"/"Failed to compile"/"Build error" strings anywhere in the output. The client leaves (HeroVideoDialog/NumberTicker/Highlighter) and the rewritten server component built cleanly.

## Deviations from spec

1. **Highlighter without `rough-notation`.** The spec said "fetch `https://magicui.design/r/highlighter.json`... adapt." I fetched it (verbatim source captured) and found its only implementation depends on the `rough-notation` package, absent from this repo's `package.json`/`node_modules`. Adding a new dependency wasn't authorized by the brief ("deps installed" — implying no new installs needed) and would have required a `pnpm install` + lockfile change outside the stated file scope. I re-implemented the same visual effect (a marker/highlight growing in behind a phrase) using only `motion/react` (already a dependency), preserving the component's public shape (`children`, `color`, `className`, plus the added `forceStatic`) and the reduced-motion guardrail. Functionally and visually equivalent for this use case; upstream fidelity (hand-drawn SVG stroke via `rough-notation`) was traded for zero new dependencies.
2. **Highlighter usage is intentionally minimal** — applied only to the first section's `<h2>`, not scattered through the prose, per the motion-initiative "comprehension-first, not decoration" rule and to keep the change reviewable.

## Open risks / follow-ups

- Vision-verify (rendered screenshot vs. the acceptance bar in the spec) was NOT run by this task — it's called out in the spec as the controller's follow-up step, not something to skip but something to hand back.
- `pnpm build`'s full stdout for the early alphabetical routes (including the literal `/blog/[slug]` line) fell outside the captured log's tail window; route presence is inferred from `exit code 0` + no error strings, not a visual confirmation of the exact route line. A quick `curl`/dev-server smoke of `/blog/agents-are-the-new-saas` would close this out.
- `packages/crm/src/lib/seo/blog-markdown.ts` was left as-is; it silently drops `diagram` content in the `.md` twin (same behavior guides had before `guide-markdown.ts` added `renderDiagramMarkdown` — guides DOES render diagrams in its Markdown twin, blog does not). Not in scope per the spec (which only asked for the blog.spec.ts / types.ts / blog-page.tsx / agents-are-the-new-saas.ts changes), but worth a follow-up if the blog Markdown twin should carry diagram content too.
