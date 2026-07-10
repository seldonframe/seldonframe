// Guide (long-form article) registry types — the "content engine" surface that
// sits alongside best-pages.ts / alternative-pages.ts. Each Guide is pure data
// (no React, no db) rendered by one server template + a Markdown twin, so it
// inherits the citable-listicle machinery: /guides/<slug> HTML, /guides/<slug>.md,
// sitemap + llms.txt registration, Article + FAQPage JSON-LD, the E-E-A-T author
// byline, and IndexNow. See docs/strategy/2026-07-09-content-engine.md.
//
// never-lies applies to articles: every factual/statistical claim must be hedged
// or backed by a real entry in `sources`. The spec test enforces >=1 source.

/** A topic cluster — the pillar (a free tool) each article group supports. */
export type GuideCluster =
  | "speed-to-lead"
  | "no-shows"
  | "ai-receptionist"
  | "service-faq"
  | "booking"
  | "ai-visibility"
  | "reviews"
  | "ai-agents";

export type GuideIntent = "informational" | "commercial" | "transactional";

/** One <h2> section. `body` is plain paragraphs separated by blank lines; the
 *  HTML template renders each as a <p>, the Markdown twin emits it verbatim.
 *  Keep prose plain (no raw HTML) — inline links live in `relatedTool`/sources. */
export type GuideSection = { h2: string; body: string };

export type GuideFaq = { q: string; a: string };

/** A real, citable source for a claim in the article (never-lies). */
export type GuideSource = { label: string; url: string };

export type Guide = {
  /** URL slug: /guides/<slug>. Unique across the registry. */
  slug: string;
  /** H1 + default <title>. */
  title: string;
  /** SEO meta description (~150 chars). */
  description: string;
  /** The primary query this article targets. */
  targetKeyword: string;
  intent: GuideIntent;
  cluster: GuideCluster;
  /** The tool this article funnels to, e.g. "/tools/speed-to-lead-calculator". */
  relatedTool: string;
  /** Optional deeper link, e.g. "/best/ai-agent-for-small-business" or an /ai-agents page. */
  relatedBest?: string;
  /** One-paragraph intro rendered under the H1. */
  dek: string;
  /** >=3 body sections. */
  sections: GuideSection[];
  /** >=2 FAQ entries (also emitted as FAQPage JSON-LD). */
  faq: GuideFaq[];
  /** >=1 real source (never-lies). */
  sources: GuideSource[];
};
