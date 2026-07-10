// Server-rendered template for a /guides/<slug> long-form article — the HTML
// twin of guide-markdown.ts. Renders on the MKT marketing palette, reuses the
// E-E-A-T author byline + Article/Person JSON-LD, and emits FAQPage JSON-LD.
// One template renders every Guide in the registry (data-driven, like BestPage).

import type { ReactElement, ReactNode } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AUTHOR, articleLd, authorPersonLd } from "@/components/seo/author-byline";
import { getGuide, LAST_UPDATED } from "@/lib/seo/guides";
import { monthYearToIso } from "@/lib/seo/month-iso";
import { GuideDiagramView, GuideDiagramStyles, faviconUrl } from "@/components/seo/guide-diagrams";
import type { GuideCallout } from "@/lib/seo/guides/types";
import { tokenizeInlineMarkup, stripInlineMarkup, startsWithKindOfLike } from "@/lib/seo/guide-inline";

/** Split a section body into paragraphs on blank lines. */
function paragraphs(body: string): string[] {
  return body.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
}

// ─── markdown-lite rendering ────────────────────────────────────────────────
// The tokenizer itself lives in lib/seo/guide-inline.ts (a pure module, no
// React/Next deps, so it's importable from a plain unit test). This function
// turns those tokens into React nodes; never dangerouslySetInnerHTML for
// body content.

/** Render markdown-lite text into React nodes (bold/italic/internal links). */
function renderInlineMarkup(text: string): ReactNode[] {
  return tokenizeInlineMarkup(text).map((token, i): ReactElement => {
    switch (token.kind) {
      case "bold":
        return <strong key={i}>{token.text}</strong>;
      case "italic":
        return <em key={i}>{token.text}</em>;
      case "link":
        if (token.internal) {
          return (
            <Link key={i} href={token.href} className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              {token.label}
            </Link>
          );
        }
        // Non-internal hrefs render as plain text per the markup contract.
        return <span key={i}>{token.label}</span>;
      case "text":
        return <span key={i}>{token.text}</span>;
    }
  });
}

// re-export so callers (and the spec) can import stripInlineMarkup from
// either this module or lib/seo/guide-inline.ts.
export { stripInlineMarkup };

const CALLOUT_META: Record<GuideCallout["kind"], { label: string; icon: string; bg: string; border: string }> = {
  analogy: { label: "Kind of like…", icon: "💡", bg: MKT.green10, border: "rgba(0,137,123,0.28)" },
  tip: { label: "Tip", icon: "✅", bg: "rgba(34,29,23,0.04)", border: MKT.ink10 },
  warning: { label: "Watch out", icon: "⚠️", bg: "rgba(196,132,30,0.10)", border: "rgba(196,132,30,0.32)" },
};

function CalloutBox({ callout }: { callout: GuideCallout }): ReactElement {
  const meta = CALLOUT_META[callout.kind];
  // Guard against "Kind of like…" doubling up when the analogy text itself
  // already opens with "kind of like" / "it's kind of like".
  const skipLabel = callout.kind === "analogy" && startsWithKindOfLike(callout.text);
  return (
    <div
      style={{
        marginTop: 18,
        marginBottom: 6,
        padding: "14px 18px",
        borderRadius: 12,
        border: `1.5px solid ${meta.border}`,
        background: meta.bg,
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
      }}
    >
      <span aria-hidden style={{ fontSize: 17, lineHeight: 1.5, flex: "0 0 auto" }}>
        {meta.icon}
      </span>
      <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.85)" }}>
        {!skipLabel && (
          <>
            <strong style={{ fontWeight: 800 }}>{meta.label}</strong>
            {callout.kind === "analogy" ? " " : ": "}
          </>
        )}
        {renderInlineMarkup(callout.text)}
      </p>
    </div>
  );
}

/** Extract a bare domain (for the favicon service) from a source URL. */
function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function GuidePage({ slug }: { slug: string }): ReactElement {
  const g = getGuide(slug);
  const canonical = `/guides/${g.slug}`;
  const iso = monthYearToIso(LAST_UPDATED);

  const articleJsonLd = articleLd({
    headline: stripInlineMarkup(g.title),
    description: stripInlineMarkup(g.description),
    canonicalPath: canonical,
    dateModified: iso,
  });
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: g.faq.map((f) => ({
      "@type": "Question",
      name: stripInlineMarkup(f.q),
      acceptedAnswer: { "@type": "Answer", text: stripInlineMarkup(f.a) },
    })),
  };

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <GuideDiagramStyles />
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

          <p style={{ margin: "22px 0 8px", fontSize: 18, lineHeight: 1.6, color: "rgba(34,29,23,0.78)", fontWeight: 500 }}>{renderInlineMarkup(g.dek)}</p>

          {g.sections.map((s) => (
            <section key={s.h2} style={{ marginTop: 30 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>{s.h2}</h2>
              {paragraphs(s.body).map((p, i) => (
                <p key={i} style={{ margin: "0 0 14px", fontSize: 16, lineHeight: 1.7, color: "rgba(34,29,23,0.82)" }}>
                  {renderInlineMarkup(p)}
                </p>
              ))}
              {s.callout && <CalloutBox callout={s.callout} />}
              {s.diagram && <GuideDiagramView d={s.diagram} />}
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

          {/* Demand->supply cross-promo — only for the agency-heavy GoHighLevel cluster. */}
          {g.cluster === "gohighlevel" && (
            <div style={{ marginTop: 28, border: `1px solid ${MKT.ink10}`, borderRadius: 16, padding: "24px 26px", background: "rgba(255,255,255,0.6)" }}>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Run an agency? Sell AI agents instead of renting software</div>
              <p style={{ margin: "8px 0 16px", fontSize: 15, lineHeight: 1.6, color: "rgba(34,29,23,0.7)" }}>
                Agencies reading GoHighLevel comparisons are often really pricing an agency stack. The other side of that
                decision is selling AI agents to clients at a flat platform cost instead of per-sub-account fees — this
                site's builder library covers pricing, white-labeling, and where to sell.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <Link href="/sell" className="sf-link" style={{ background: MKT.ink, color: "#F6F2EA", padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
                  Selling AI agents: the guides
                </Link>
                <Link href="/guides/white-label-ai-agents" className="sf-link" style={{ border: `1.5px solid ${MKT.ink10}`, color: MKT.ink, padding: "11px 22px", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
                  White-label AI agents
                </Link>
              </div>
            </div>
          )}

          <section style={{ marginTop: 40 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
            {g.faq.map((f) => (
              <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
                <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{renderInlineMarkup(f.q)}</summary>
                <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>{renderInlineMarkup(f.a)}</p>
              </details>
            ))}
          </section>

          {g.sources.length > 0 && (
            <section style={{ marginTop: 34 }}>
              <h2 style={{ margin: "0 0 12px", fontSize: 18, fontWeight: 800 }}>Sources</h2>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: "rgba(34,29,23,0.7)" }}>
                {g.sources.map((src) => {
                  const domain = domainFromUrl(src.url);
                  return (
                    <li key={src.url} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                      {domain && (
                        <img src={faviconUrl(domain)} width={16} height={16} loading="lazy" alt={`${domain} logo`} style={{ borderRadius: 3, flex: "0 0 auto" }} />
                      )}
                      <a href={src.url} target="_blank" rel="noopener noreferrer nofollow" className="sf-link" style={{ color: MKT.green, fontWeight: 600 }}>
                        {src.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {g.relatedChart && (
            <p style={{ margin: "28px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
              See the data behind this:{" "}
              <Link href={g.relatedChart.href} className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
                {g.relatedChart.label}
              </Link>
              .
            </p>
          )}

          {g.relatedBest && (
            <p style={{ margin: "12px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
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
  return { title: stripInlineMarkup(g.title), description: stripInlineMarkup(g.description), canonical: `/guides/${g.slug}` };
}

// re-export so the author node is available to callers that import from here.
export { authorPersonLd };
