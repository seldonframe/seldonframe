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
  | "ai-agents"
  | "gohighlevel"
  | "sell-agents";

export type GuideIntent = "informational" | "commercial" | "transactional";

/** Inline markup allowed in body/dek/FAQ answers: **bold**, *italic*,
 *  [label](/internal-path). No raw HTML ever — the HTML template parses this
 *  markdown-lite into React nodes and the Markdown twin passes it through
 *  verbatim (it already is Markdown). */
export type GuideCallout = { kind: "analogy" | "tip" | "warning"; text: string };

/** One item in a diagram (a step, layer, or bar). `domain` (e.g. "twilio.com")
 *  renders a small favicon logo next to the label. */
export type GuideDiagramItem = { label: string; sub?: string; domain?: string };

/** A typed, hand-authored SVG diagram rendered by <GuideDiagramView>. */
export type GuideDiagram =
  | { type: "flow"; title?: string; steps: GuideDiagramItem[] } // left→right workflow
  | { type: "loop"; title?: string; steps: string[] } // circular cycle
  | {
      type: "compare";
      title?: string;
      left: { heading: string; items: string[] };
      right: { heading: string; items: string[] };
    }
  | {
      type: "bars";
      title?: string;
      unit?: string;
      items: { label: string; value: number; display: string; domain?: string }[];
      note?: string;
    }
  | { type: "stack"; title?: string; layers: GuideDiagramItem[] }; // top-down layers

/** One <h2> section. `body` is markdown-lite paragraphs separated by blank
 *  lines (supports **bold**, *italic*, [label](/internal-path)); the HTML
 *  template renders each paragraph as a <p> with inline markup parsed, and
 *  the Markdown twin emits it verbatim (it already is Markdown). Keep prose
 *  free of raw HTML — inline links otherwise live in `relatedTool`/sources.
 *  `diagram` and `callout` are optional, rendered after the section body. */
export type GuideSection = { h2: string; body: string; diagram?: GuideDiagram; callout?: GuideCallout };

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
  /** Optional link to a /charts data page whose story backs this guide's claims,
   *  e.g. "/charts/missed-revenue-decay" or "/charts/ai-recommendation-index". */
  relatedChart?: { href: string; label: string };
  /** One-paragraph intro rendered under the H1. */
  dek: string;
  /** >=3 body sections. */
  sections: GuideSection[];
  /** >=2 FAQ entries (also emitted as FAQPage JSON-LD). */
  faq: GuideFaq[];
  /** >=1 real source (never-lies). */
  sources: GuideSource[];
};
