// Blog (long-form original article) registry types — the prose-first sibling
// of lib/seo/guides. Each BlogArticle is pure data (no React, no db) rendered
// by one server template + a Markdown twin, so it inherits the same
// citable-article machinery as guides: /blog/<slug> HTML, /blog/<slug>.md,
// sitemap + llms.txt registration, Article JSON-LD, the E-E-A-T author byline,
// and IndexNow (via the existing cron reading the whole sitemap).
//
// never-lies applies: every factual/statistical claim must be hedged or
// backed by a real entry in `sources`. The spec test enforces >=1 source.

import type { GuideDiagram, GuideCallout } from "../guides/types";

// Blog reuses the guides visual engine verbatim (diagrams + the callout
// shape) rather than re-declaring its own — one engine, two content
// registries. `BlogCallout` is kept as an alias so existing callers
// (blog-markdown.ts) keep working unchanged.
export type BlogCallout = GuideCallout;
export type BlogDiagram = GuideDiagram;

/** One <h2> section. `body` is markdown-lite paragraphs separated by blank
 *  lines (supports **bold**, *italic*, [label](/internal-path)); the HTML
 *  template renders each paragraph as a <p> with inline markup parsed, and
 *  the Markdown twin emits it verbatim (it already is Markdown). `diagram`
 *  and `callout` are optional, rendered after the section body — same as
 *  guides (GuideDiagramView + CalloutBox). */
export type BlogSection = { h2: string; body: string; diagram?: GuideDiagram; callout?: GuideCallout };

export type BlogFaq = { q: string; a: string };

/** A real, citable source for a claim in the article (never-lies). */
export type BlogSource = { label: string; url: string };

/** The YouTube (or other) primary source this article is built from. OPTIONAL —
 *  a build-log/POV post has none; a blog-loop founder-story article REQUIRES
 *  one (enforced by the loop, not the type). When present it's the citation +
 *  the information-gain signal. `thumbnail` is optional — if absent and the
 *  url is a YouTube watch link, the template derives the maxres thumbnail. */
export type BlogSourceVideo = { url: string; title: string; channel: string; timestamp?: string; thumbnail?: string };

export type BlogArticle = {
  /** URL slug: /blog/<slug>, url-safe. */
  slug: string;
  /** H1 + default <title>. */
  title: string;
  /** ~150 char SEO meta description. */
  description: string;
  /** 2-sentence direct summary rendered under the H1 (GEO). */
  dek: string;
  targetKeyword?: string;
  /** Defaults to AUTHOR.name (author-byline.tsx) when omitted. */
  author?: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  sourceVideo?: BlogSourceVideo;
  /** >=3 sections, markdown-lite, each optionally carrying a diagram/callout. */
  sections: BlogSection[];
  /** Optional (GEO boost); if present each q/a non-empty. */
  faq?: BlogFaq[];
  /** Optional, e.g. "/tools/...". */
  relatedTool?: string;
  /** Optional, e.g. "/guides/...". */
  relatedGuide?: string;
  /** >=1 real https source (never-lies); include sourceVideo.url when present. */
  sources: BlogSource[];
  /** Optional 2-4 item NumberTicker band rendered under the video hero. Each
   *  `value` must be finite; `display`/`label` are the formatted string shown
   *  (e.g. {value:1000, display:"$1,000/mo", label:"one workflow, one promise"}).
   *  Use ONLY numbers already stated in the article — no new claims. */
  heroStats?: { value: number; display: string; label: string }[];
};
