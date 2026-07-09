// Author byline + Person/Article JSON-LD for the SEO comparison surfaces —
// the E-E-A-T layer: a named human who stands behind the ranking, with the
// self-interest disclosed (never-lies applied to authorship). Rendered on
// /best, /compare/*, /alternative-to-*, and /<slug>-pricing pages.

import type { CSSProperties, ReactElement } from "react";

export const AUTHOR = {
  name: "Maxime Houle",
  role: "Founder, SeldonFrame",
  url: "https://www.seldonframe.com",
  sameAs: ["https://x.com/seldonframe", "https://github.com/seldonframe"],
} as const;

/** schema.org Person node — embed inside Article.author or standalone. */
export function authorPersonLd(): Record<string, unknown> {
  return {
    "@type": "Person",
    name: AUTHOR.name,
    jobTitle: AUTHOR.role,
    url: AUTHOR.url,
    sameAs: [...AUTHOR.sameAs],
  };
}

/** schema.org Article node for a comparison/listicle page. `datePublished` /
 *  `dateModified` are "YYYY-MM-DD"; pass the registry's verified date so the
 *  schema can never claim fresher than the facts. */
export function articleLd(opts: {
  headline: string;
  description: string;
  canonicalPath: string;
  dateModified: string;
  datePublished?: string;
}): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.headline.slice(0, 110),
    description: opts.description,
    mainEntityOfPage: `https://www.seldonframe.com${opts.canonicalPath}`,
    author: authorPersonLd(),
    publisher: {
      "@type": "Organization",
      name: "SeldonFrame",
      url: "https://www.seldonframe.com",
    },
    datePublished: opts.datePublished ?? opts.dateModified,
    dateModified: opts.dateModified,
  };
}

const WRAP: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 14,
  fontSize: 13.5,
  color: "rgba(34,29,23,0.62)",
};

/** The visible byline. `checked` is the human-readable verified date
 *  (e.g. "July 2026"). Keep the disclosure — it's the trust mechanism. */
export function AuthorByline({ checked }: { checked: string }): ReactElement {
  return (
    <div style={WRAP}>
      <span
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          background: "#00897B",
          color: "#F6F2EA",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 800,
          flex: "0 0 auto",
        }}
      >
        MH
      </span>
      <span>
        Reviewed by <strong style={{ color: "rgba(34,29,23,0.8)" }}>{AUTHOR.name}</strong>, {AUTHOR.role}. I build one
        of these tools — every ranking here says when the others win. Facts checked {checked}.
      </span>
    </div>
  );
}
