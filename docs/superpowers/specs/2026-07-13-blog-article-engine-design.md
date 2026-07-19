# /blog Article Engine — Design Spec (2026-07-13)

**Goal (Max-approved):** a data-driven `/blog` long-form article engine with FULL
parity to the `/guides` engine's SEO/GEO best practices — reusing the same
markdown-lite renderer, `.md` twin, sitemap + llms.txt registration, Article
JSON-LD + E-E-A-T byline, and IndexNow — so the daily `blog-loop` can publish
YouTube-sourced founder-story articles safely (not hand-coded React).

**Reuse, don't rebuild** (exact anchors from recon; import these, don't copy):
- `packages/crm/src/lib/seo/guide-inline.ts` — `tokenizeInlineMarkup()` (L19-43),
  `stripInlineMarkup()` (L47-52), `startsWithKindOfLike()` (L57-59). The
  markdown-lite parser. Blog reuses it verbatim.
- `packages/crm/src/components/seo/author-byline.tsx` — `AUTHOR`, `authorPersonLd()`
  (L17-26), `articleLd()` (L31-53), `AuthorByline` (L66-83). Blog reuses these for
  JSON-LD + the visible byline (same author, all surfaces).
- `packages/crm/src/lib/seo/indexnow.ts` — `submitToIndexNow()` (L22-53). Already
  pulls the full sitemap in `app/api/cron/indexnow/route.ts`, so blog URLs get
  pinged automatically once they're in the sitemap — NO new IndexNow code needed.
- `renderInlineMarkup()` pattern in `components/seo/guide-page.tsx` (L30-51):
  tokenizer output → React `<strong>/<em>/<Link>`. Blog's page component mirrors
  this (or extracts a shared helper if trivial — prefer a tiny shared
  `renderInlineMarkup` in a new `components/seo/inline-markup.tsx` that BOTH import,
  but only if the extraction is clean; otherwise mirror to avoid touching the live
  guide page).

## Files to create

### 1. `packages/crm/src/lib/seo/blog/types.ts`
```ts
export type BlogSection = { h2: string; body: string; callout?: BlogCallout };
export type BlogCallout = { kind: "analogy" | "tip" | "warning"; text: string };
export type BlogFaq = { q: string; a: string };
export type BlogSource = { label: string; url: string };
/** The YouTube (or other) primary source this article is built from. OPTIONAL —
 *  a build-log post has none; a blog-loop founder-story article REQUIRES one
 *  (enforced by the loop, not the type). When present it's the citation + the
 *  information-gain signal. */
export type BlogSourceVideo = { url: string; title: string; channel: string; timestamp?: string };
export type BlogArticle = {
  slug: string;                 // /blog/<slug>, url-safe
  title: string;
  description: string;          // ~150 char meta
  dek: string;                  // 2-sentence direct summary (GEO)
  targetKeyword?: string;
  author?: string;              // defaults to AUTHOR.name
  date: string;                 // ISO yyyy-mm-dd
  sourceVideo?: BlogSourceVideo;
  sections: BlogSection[];      // >=3, prose markdown-lite (NO diagram scaffolding — blog is prose-first)
  faq?: BlogFaq[];              // optional (GEO boost); if present each q/a non-empty
  relatedTool?: string;         // "/tools/..." optional
  relatedGuide?: string;        // "/guides/..." optional
  sources: BlogSource[];        // >=1 real https (never-lies); include sourceVideo.url when present
};
```

### 2. `packages/crm/src/lib/seo/blog/index.ts`
Mirror `guides/index.ts`: `import { article as … } from "./<slug>"`, `export const
BLOG_ARTICLES: BlogArticle[] = [ … ]`, plus `getBlogArticle(slug)` (throws on
unknown), `allBlogSlugs()`, and `blogArticlesByTag`/date-sorted helper
(`articlesNewestFirst()`). Keep pure (no React/db).

### 3. `packages/crm/src/lib/seo/blog-markdown.ts`
`renderBlogMarkdown(slug): string` — mirror `guide-markdown.ts`: H1, dek, the
source-video line ("Source: [title](url) — channel"), each section (`## h2` +
body passed through verbatim — it's already markdown), FAQ as `### q` + a,
sources list, author line. Uses the SAME inline tokenizer for any strip needs.
Must never emit `undefined`/`null`.

### 4. `packages/crm/src/app/(marketing)/blog/[slug]/page.tsx`
Dynamic route — the existing static `(marketing)/blog/why-mcp/page.tsx` keeps
precedence (Next static > dynamic), so registry articles render here and hand-coded
posts are untouched. `generateStaticParams()` → `allBlogSlugs()`.
`generateMetadata()` → title/description/canonical `/blog/<slug>` + OG (mirror the
guide's `buildOgUrl` call). Default export renders `<BlogArticlePage slug={slug} />`.

### 5. `packages/crm/src/components/seo/blog-page.tsx`
`BlogArticlePage({ slug })` (server component). Renders inside `MarketingShell`
(match the existing `blog/why-mcp/page.tsx` shell + `<article className="max-w-[720px]…">`
container so it visually matches the current blog). Renders: the byline
(`AuthorByline`), date, dek, the **embedded source video** (a plain link + the
`mm:ss` note when `sourceVideo` present), sections (h2 + `renderInlineMarkup(body)`),
optional callouts + FAQ, and a sources list. Emits **Article JSON-LD** via
`articleLd({ headline: title, description, url, datePublished: date, … })` +
`authorPersonLd()`, and when `sourceVideo` present add `isBasedOn: sourceVideo.url`
to the Article node (the honest citation — do NOT fabricate a VideoObject with
fields we don't have). JSON-LD via `<script type="application/ld+json"
dangerouslySetInnerHTML>` exactly like the guide page.

### 6. `packages/crm/src/app/blog/<slug>.md/route.ts` (per seed article)
Mirror `app/guides/<slug>.md/route.ts` exactly (comment, `logMarkdownFetch` path
`/blog/<slug>.md`, `renderBlogMarkdown(slug)`, the `Link: <html>; rel="alternate"`
header, `Cache-Control`). One folder per article slug.

### 7. `packages/crm/tests/unit/seo/blog.spec.ts`
Mirror `guides.spec.ts`: unique + url-safe slugs; `getBlogArticle` resolves all +
throws unknown; per-article title/description(>20)/dek(>20); >=3 sections each
h2 + body>40, NO raw HTML, balanced `**`, balanced `*`; `stripInlineMarkup` leaves
no tokens; callouts (if any) non-empty + analogy not starting "kind of like";
faq (if any) >=1 with non-empty q/a; >=1 https source; `relatedTool`/`relatedGuide`
(if set) start with the right prefix; `sourceVideo` (if set) has https url + title
+ channel; `renderBlogMarkdown` renders every article (>200 chars, has `# `, no
undefined/null).

### 8. ONE seed article `packages/crm/src/lib/seo/blog/why-original-content-wins-seo.ts`
A real, blog-appropriate POV post (NOT a how-to guide, NOT a fabricated founder
story) so the engine has honest content to render + test: "Why original content
wins SEO now (and AI slop loses)". Prose sections on Google's helpful-content /
scaled-content-abuse direction and the information-gain idea. **never-lies:**
WebFetch + cite Google's real "scaled content abuse" / "helpful content" guidance
(developers.google.com/search/…); ZERO fabricated statistics. `sourceVideo`
omitted (this one isn't video-sourced — proves the type handles both). Author
Max Houle. This demonstrates the engine; the blog-loop adds video-sourced articles.

## Files to update
- `packages/crm/src/app/(marketing)/blog/page.tsx` — the index currently has a
  hardcoded `POSTS` array. Merge in the registry: list `articlesNewestFirst()`
  alongside the existing hand-coded posts (dedupe by slug), each linking to
  `/blog/<slug>`. Keep the existing posts.
- `packages/crm/src/app/sitemap.ts` (after the guides block ~L201) — add the
  `/blog` hub entry + `for (const slug of allBlogSlugs()) entries.push({ url:
  `${base}/blog/${slug}`, …, priority: 0.6 })`, same shape as guides.
- `packages/crm/src/app/llms.txt/route.ts` (after the guides section ~L195) — add
  `lines.push("## Blog (original, sourced articles)")` + the same per-article loop
  using `getBlogArticle`.
- `docs/ops/agents/blog-loop.md` Step 5 — update: the loop now publishes a
  `BlogArticle` registry entry (`lib/seo/blog/<slug>.ts` + the `.md` twin route +
  wire into `blog/index.ts`) instead of a bare markdown draft, opens the PR
  (still draft-first — do NOT auto-merge). Keep the "live-on-site" note removed
  (it's now live via the engine). sourceVideo REQUIRED for loop articles.

## Non-goals
Migrating the existing hand-coded `why-mcp` post (leave it live + untouched — the
index just lists both). No blog "clusters" taxonomy v1 (a flat date-sorted list +
optional tags is enough). No VideoObject JSON-LD (we don't have its required
fields; `isBasedOn` the video URL is the honest citation).

## Verification (the gate)
- `packages/crm/tests/unit/seo/blog.spec.ts` all-green (mirror the guides gate).
- `packages/crm/tests/unit/seo/guides.spec.ts` still green (untouched).
- `npx tsc --noEmit` — no NEW errors beyond the known `copilot/turn/route.ts:315`.
- `pnpm build` exits 0 (the real gate for a new dynamic route + route-group
  coexistence with the static why-mcp post — this is the one that catches a
  parallel-route conflict).
- Independent review (rendering + route-group + JSON-LD + sitemap/llms wiring).
Present at the merge gate — do NOT auto-merge.
