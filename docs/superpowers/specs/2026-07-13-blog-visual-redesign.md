# /blog Visual Redesign — Spec (2026-07-13)

**Problem (confirmed):** `blog-page.tsx` renders near-white text (`#fafafa`/`#a1a1aa`)
inside `MarketingShell`, whose `<main>` has NO background → the article shows on
the browser's default light background = **white-on-light, unreadable**. It also
has none of the guides visual engine (diagrams, callouts, favicon logos) and no
real video embed.

**Goal:** the /blog article page matches the /guides visual quality EXACTLY
(reuse, don't reinvent), embeds the source video prominently, and adds *purposeful*
motion (comprehension-first — the motion-initiative KILL RULE). Vision-verified.

## Reuse (import — do NOT re-create)
- `MKT` color object: `packages/crm/src/components/marketplace/marketplace-data.ts`
  (paper `#F6F2EA`, ink `#221D17`, green `#00897B`, `ink05/08/10`, `green10`, fonts).
- From `packages/crm/src/components/seo/guide-page.tsx`: the `sf-mkt` wrapper
  pattern (`<div className="sf-mkt" style={{ background: MKT.paper, color: MKT.ink }}>`),
  `MarketplaceStyles()`, `GuideDiagramStyles()`, the `CalloutBox` treatment, and
  `renderInlineMarkup`. From guide diagrams: `GuideDiagramView` + `faviconUrl(domain)`
  (`https://www.google.com/s2/favicons?domain=${d}&sz=64`). Confirm exact export
  names/paths by reading guide-page.tsx + guide-diagrams.tsx first.

## Vendor the missing Magic UI components (motion-initiative pattern)
Place in `packages/crm/src/components/ui/`, `"use client"`, `import … from "motion/react"`,
`cn` from `@/lib/utils`. Add the `useReducedMotion()` guardrail (when reduced, render
the static end-state — static IS the real design) and a `forceStatic?: boolean` prop.
1. **HeroVideoDialog** — source already captured; adapt to the above (it already uses
   `motion/react` + `cn`). Add `useReducedMotion`/`forceStatic` (skip the modal spring
   when reduced — still opens, just no scale animation).
2. **Highlighter** — fetch `https://magicui.design/r/highlighter.json`; a subtle
   marker-underline on a key phrase. Guardrail same.
(NumberTicker, BentoGrid, AnimatedList, TypingAnimation already exist — reuse.)

## Extend the BlogArticle type (`lib/seo/blog/types.ts`)
- `BlogSection` gains `diagram?: GuideDiagram` and `callout?: GuideCallout` — **import
  these two types from `../guides/types`** so blog reuses the guides engine verbatim.
- `BlogSourceVideo` gains `thumbnail?: string` (optional; if absent + it's a YouTube
  url, derive `https://img.youtube.com/vi/<id>/maxresdefault.jpg`).
- `BlogArticle` gains `heroStats?: { value: number; display: string; label: string }[]`
  (2–4 items) — rendered as a NumberTicker band under the video.
- Update `blog.spec.ts`: diagrams/callouts (if present) validate like the guides spec
  (non-empty labels, bars values finite+positive); heroStats (if present) each have a
  finite `value`, non-empty `display` + `label`. Keep all existing invariants.

## Rewrite `components/seo/blog-page.tsx` (server component; motion leaves are client)
Structure, in the `sf-mkt` light theme (MKT.paper bg, MKT.ink text — mirror guide-page):
1. Eyebrow: `DATE · AUTHOR` (MKT.ink @ ~0.5).
2. **H1** — MKT.ink, the serif display face, large (`clamp(32px,5vw,52px)`), tight tracking.
3. Dek — MKT.ink @ ~0.72, larger body.
4. **Source-video HERO** — if `sourceVideo`, render `HeroVideoDialog` (thumbnail =
   `sourceVideo.thumbnail` or derived YouTube maxres; `videoSrc` = the YouTube EMBED
   url `https://www.youtube.com/embed/<id>`). Caption below: "Source: <title> — <channel>"
   as a real link to the watch URL (this is the "no YouTube link" fix — prominent + clickable).
5. **heroStats band** — if present, a row of `NumberTicker` (big MKT.ink number + small
   MKT.ink@0.6 label), light `MKT.green10` divider.
6. Sections — h2 (MKT.ink) + `renderInlineMarkup(body)` + optional `GuideDiagramView(diagram)`
   + optional `CalloutBox(callout)` — identical to guide-page's section rendering.
7. Sources list + `AuthorByline`.
Keep the Article + FAQPage JSON-LD (+ `isBasedOn` the video). Keep `generateMetadata`.
Delete the dark `#fafafa/#a1a1aa/#71717a` colors entirely.

## Enrich `lib/seo/blog/agents-are-the-new-saas.ts` (keep every claim transcript-traced)
Add, using ONLY facts already in the article/transcript:
- `sourceVideo.thumbnail` derived (or set the maxres URL).
- `heroStats`: 3 tickers — e.g. `{value: 1000, display:"$1,000/mo", label:"one workflow, one promise"}`,
  the `$1,500` setup, and the eval `{value:42, display:"42 / 50", label:"routed correctly in the pilot eval"}`.
  Use ONLY numbers the article already states (17:21 pricing; 15:12 eval).
- A **flow diagram** in the "wrapper/teardown" or distribution section: the agent-way
  workflow — steps "Call comes in" → "Agent answers + qualifies" → "Books the job" →
  "Updates the CRM" → "Flags edge cases" (all from the 18:32 teardown).
- A **compare diagram** (old way vs agent way) OR the four MUA types as a `stack`/BentoGrid
  in the "smallest useful agent" section (draft-and-approve / triage / coordinator /
  bounded-action — from 09:21).
- Callouts: a `tip` on "shadow the human before you build" (07:02), a `warning` on
  "don't build agent slop / start as a workflow" (09:21/11:39).
No new claims. Diagrams/callouts paraphrase existing article content only.

## Verify (the gate — do NOT skip vision)
1. `node --import tsx --test tests/unit/seo/blog.spec.ts` — green (update spec for new fields).
2. `node --import tsx --test tests/unit/seo/guides.spec.ts` — still green (guides untouched).
3. `npx tsc --noEmit` — no NEW errors.
4. `pnpm build` — exits 0 (new client leaves + the dynamic route must build).
5. **VISION** (controller runs vision-verify after): the rendered page must read as
   dark-ink-on-parchment (NOT white-on-white), match guides' polish, show the video hero,
   the diagrams with favicon logos, callouts, and the number band. This is the acceptance bar.
Respect `useReducedMotion` throughout; mobile-responsive; keyboard focus on the video button.
