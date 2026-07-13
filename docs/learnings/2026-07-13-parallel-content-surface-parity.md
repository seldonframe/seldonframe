# Adding a new content surface with full SEO/GEO parity — reuse the engine, don't rebuild it

**Context (2026-07-13):** built a data-driven `/blog` article engine that had to
match the `/guides` engine's SEO/GEO best practices exactly (Article + FAQPage
JSON-LD, sitemap, llms.txt, `.md` twin, IndexNow, E-E-A-T byline). Merged + live
first try (`d35516fef`), build-green, smoke-green.

## The approach (reusable for the NEXT content surface)

1. **Scout the existing engine's integration points BEFORE writing anything.**
   A content surface isn't one file — it's ~7 wiring points. Map each with a
   file:line anchor: the registry (`types.ts` + `index.ts` + lookups), the
   markdown-lite tokenizer (`guide-inline.ts`), the HTML page component + its
   JSON-LD, the `.md` twin route pattern, the sitemap block, the llms.txt
   section, and IndexNow. Missing one = a silent parity gap.
2. **Reuse the shared helpers by IMPORT, never fork.** The tokenizer
   (`tokenizeInlineMarkup`/`stripInlineMarkup`), the JSON-LD builders
   (`author-byline.tsx`: `articleLd`/`authorPersonLd`/`AUTHOR`), and IndexNow all
   work verbatim for a new surface. IndexNow is free: the cron already pings the
   WHOLE sitemap, so a new surface is covered the moment its URLs are in
   `sitemap.ts` — zero new IndexNow code.
3. **Mirror, don't share, ONLY the render component** when the two surfaces have
   different visual chrome (guides = light marketing prose; blog = dark shell). A
   shared `renderInlineMarkup` would need a style-injection param; mirroring the
   ~20 lines is the lower-impact choice. Everything else is shared.
4. **The `.md` twin is per-slug static route folders**, not a dynamic
   `[slug].md`. `app/<surface>/<slug>.md/route.ts`, one per article, calling the
   surface's `render<Surface>Markdown`. This coexists with a dynamic
   `(group)/<surface>/[slug]/page.tsx` for HTML — Next resolves static segments
   (and the `.md` literal) ahead of the dynamic `[slug]`, so hand-coded posts and
   the dynamic registry route live together. **The proof is `next build`** — a
   parallel-route conflict only shows there, so a real build (not just tsc) is the
   gate for a new dynamic route in an existing route group.

## Judgment calls that mattered

- **"Full parity" means ALL the structured-data types, not just the headline
  one.** The first pass emitted Article JSON-LD but missed FAQPage (guides emit
  both). Code + specs + build were all green — the gap was invisible to every
  mechanical gate and only the review caught it. When the requirement is
  *parity*, explicitly DIFF the two surfaces' JSON-LD emission, don't assume the
  main type covers it.
- **Optional-where-guides-are-required is a legitimate divergence.** Guides
  require FAQ; a blog post may not have one. So FAQPage JSON-LD is emitted
  conditionally (`faq?.length`) — parity on the mechanism, not a forced identical
  shape. Same for `sourceVideo` (required for loop articles, absent on a
  hand-authored seed) — the TYPE stays optional; the LOOP enforces it.
- **One canonical author.** JSON-LD `author.name` must match the Person node's
  `url`/`sameAs`. A seed that hardcoded "Max Houle" while `AUTHOR.name` is
  "Maxime Houle" splits the identity — default to `AUTHOR.name` everywhere.
- **Honest citation over fabricated schema.** For a YouTube-sourced article, use
  Article `isBasedOn: <video-url>` (a field we can back), NOT a `VideoObject`
  with `contentUrl`/`uploadDate`/`thumbnailUrl` we don't have. Never emit
  structured data you can't substantiate.

## Rule for next time

New content surface with SEO parity = (1) scout the ~7 integration points of the
reference engine, (2) import every shared helper, mirror only the chrome-specific
renderer, (3) per-slug `.md` route folders + a dynamic `[slug]` HTML route, (4)
gate on a real `next build` (route coexistence) + a spec mirroring the reference
gate, and (5) when the ask is "parity," diff the structured-data emission
type-by-type — the mechanical gates won't catch a missing JSON-LD type.
