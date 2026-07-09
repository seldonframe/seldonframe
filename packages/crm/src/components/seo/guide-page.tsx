// Server-rendered template for a /guides/<slug> long-form article — the HTML
// twin of guide-markdown.ts. Renders on the MKT marketing palette, reuses the
// E-E-A-T author byline + Article/Person JSON-LD, and emits FAQPage JSON-LD.
// One template renders every Guide in the registry (data-driven, like BestPage).

import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AUTHOR, articleLd, authorPersonLd } from "@/components/seo/author-byline";
import { getGuide, LAST_UPDATED } from "@/lib/seo/guides";
import { monthYearToIso } from "@/lib/seo/month-iso";

/** Split a section body into paragraphs on blank lines. */
function paragraphs(body: string): string[] {
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
}

export function GuidePage({ slug }: { slug: string }): ReactElement {
  const g = getGuide(slug);
  const canonical = `/guides/${g.slug}`;
  const iso = monthYearToIso(LAST_UPDATED);

  const articleJsonLd = articleLd({
    headline: g.title,
    description: g.description,
    canonicalPath: canonical,
    dateModified: iso,
  });
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "34px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 20 }}>
          <Link href="/guides" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Guides
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>{g.title}</span>
        </nav>

        <article>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12 }}>{g.title}</h1>

          {/* E-E-A-T byline (accurate for articles; Person node also in JSON-LD). */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, fontSize: 13.5, color: "rgba(34,29,23,0.62)" }}>
            <span aria-hidden style={{ width: 26, height: 26, borderRadius: "50%", background: MKT.green, color: "#F6F2EA", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flex: "0 0 auto" }}>
              MH
            </span>
            <span>
              By <strong style={{ color: "rgba(34,29,23,0.8)" }}>{AUTHOR.name}</strong>, {AUTHOR.role}. Facts checked {LAST_UPDATED}.
            </span>
          </div>

          <p style={{ margin: "22px 0 8px", fontSize: 18, lineHeight: 1.6, color: "rgba(34,29,23,0.78)", fontWeight: 500 }}>{g.dek}</p>

          {g.sections.map((s) => (
            <section key={s.h2} style={{ marginTop: 30 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>{s.h2}</h2>
              {paragraphs(s.body).map((p, i) => (
                <p key={i} style={{ margin: "0 0 14px", fontSize: 16, lineHeight: 1.7, color: "rgba(34,29,23,0.82)" }}>
                  {p}
                </p>
              ))}
            </section>
          ))}

          {/* Tool CTA — the pillar this article supports. */}
          <div style={{ marginTop: 36, border: `1px solid ${MKT.ink10}`, borderRadius: 16, padding: "24px 26px", background: "rgba(255,255,255,0.6)" }}>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Put a number on it</div>
            <p style={{ margin: "8px 0 16px", fontSize: 15, lineHeight: 1.6, color: "rgba(34,29,23,0.7)" }}>
              Use the free tool that pairs with this guide — no signup required — then build the AI front office that handles it for you.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Link href={g.relatedTool} className="sf-link" style={{ background: MKT.ink, color: "#F6F2EA", padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
                Open the free tool
              </Link>
              <Link href="/signup" className="sf-link" style={{ border: `1.5px solid ${MKT.ink10}`, color: MKT.ink, padding: "11px 22px", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
                Build free
              </Link>
            </div>
          </div>

          <section style={{ marginTop: 40 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
            {g.faq.map((f) => (
              <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
                <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
                <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>{f.a}</p>
              </details>
            ))}
          </section>

          {g.sources.length > 0 && (
            <section style={{ marginTop: 34 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Sources</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: "rgba(34,29,23,0.7)" }}>
                {g.sources.map((src) => (
                  <li key={src.url}>
                    <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="sf-link" style={{ color: MKT.green, fontWeight: 600 }}>
                      {src.label}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {g.relatedBest && (
            <p style={{ margin: "28px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
              Related: <Link href={g.relatedBest} className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>go deeper</Link>, or browse{" "}
              <Link href="/guides" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>all guides</Link>.
            </p>
          )}
        </article>
      </main>
      <MarketplaceFooter />
    </div>
  );
}

/** Metadata helper shared with the route's generateMetadata. */
export function guideMetaFor(slug: string): { title: string; description: string; canonical: string } {
  const g = getGuide(slug);
  return { title: g.title, description: g.description, canonical: `/guides/${g.slug}` };
}

// re-export so the author node is available to callers that import from here.
export { authorPersonLd };
