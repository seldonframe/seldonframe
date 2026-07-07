// The "alternative to X" comparison-page template — PostPlanify-style layout
// on the SeldonFrame marketplace design system (MKT palette, marketplace
// chrome), fully server-rendered: hero → honest two-paragraph intro →
// row-by-row comparison table → "why they switch" cards → honest "when they
// win" note → FAQ (<details> + FAQPage JSON-LD) → cross-links → final CTA.
//
// Content comes entirely from lib/seo/alternative-pages.ts (the registry).
// No client islands, no DB — pure registry → static HTML, same contract as
// components/seo/agent-page.tsx.

import type { CSSProperties, ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import {
  COMPETITORS,
  COMPARISON_LABELS,
  SF_COLUMN,
  SHARED_FAQ,
  LAST_UPDATED,
  type Competitor,
} from "@/lib/seo/alternative-pages";

const START_HREF = "/signup";
const DEMO_HREF = "https://seldon-studio.app.seldonframe.com/book";

export function AlternativePage({ competitor }: { competitor: Competitor }): ReactElement {
  const c = competitor;
  const faq = [...c.faq, ...SHARED_FAQ];
  const others = COMPETITORS.filter((o) => o.slug !== c.slug);

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "SeldonFrame",
    applicationCategory: "BusinessApplication",
    description: `SeldonFrame — ${c.name} alternative for agencies & builders: AI receptionist, website, CRM and booking in one flat $29/mo platform.`,
    offers: { "@type": "Offer", price: "29", priceCurrency: "USD" },
    provider: { "@type": "Organization", name: "SeldonFrame", url: "https://seldonframe.com" },
  };

  return (
    <div
      className="sf-mkt sf-altpage"
      style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}
    >
      <MarketplaceStyles />
      <AltPageStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <MarketplaceNav />

      <main style={{ maxWidth: 920, margin: "0 auto", padding: "26px 32px 70px", width: "100%" }}>
        {/* breadcrumb */}
        <nav
          aria-label="Breadcrumb"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 22 }}
        >
          <Link href="/alternatives" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Compare
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>{c.name}</span>
        </nav>

        {/* ── HERO ── */}
        <header style={{ paddingBottom: 34, borderBottom: `1px solid ${MKT.ink10}` }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
            {c.name} alternative · {c.category}
          </div>
          <h1 className="sf-alt-h1" style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, maxWidth: 780 }}>
            The best {c.name} alternative for agencies &amp; builders
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 19, lineHeight: 1.5, color: "rgba(34,29,23,0.7)", maxWidth: 680 }}>{c.heroSub}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24, alignItems: "center" }}>
            <a
              href={START_HREF}
              style={{
                background: MKT.ink,
                color: MKT.paper,
                padding: "13px 26px",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15.5,
                textDecoration: "none",
              }}
            >
              Start free — build it in 3 minutes
            </a>
            <a
              href={DEMO_HREF}
              style={{
                border: `1.5px solid ${MKT.ink10}`,
                color: MKT.ink,
                padding: "12px 24px",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15.5,
                textDecoration: "none",
                background: "rgba(255,255,255,0.5)",
              }}
            >
              Book a 15-min demo
            </a>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: "rgba(34,29,23,0.55)",
                background: MKT.ink05,
                borderRadius: 999,
                padding: "6px 12px",
              }}
            >
              Last updated: {LAST_UPDATED}
            </span>
          </div>
        </header>

        {/* ── WHAT YOU NEED TO KNOW ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
            {c.name} vs SeldonFrame: what you need to know
          </h2>
          {c.intro.map((para, i) => (
            <p key={i} style={{ margin: "16px 0 0", fontSize: 16.5, lineHeight: 1.65, color: "rgba(34,29,23,0.78)", maxWidth: 760 }}>
              {para}
            </p>
          ))}
        </section>

        {/* ── COMPARISON TABLE ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
            SeldonFrame vs {c.name}: features &amp; pricing
          </h2>
          <p style={{ margin: "10px 0 20px", fontSize: 15.5, color: "rgba(34,29,23,0.6)" }}>
            A row-by-row breakdown of pricing, the AI receptionist, and the business system behind it.
          </p>
          <div style={{ overflowX: "auto", border: `1px solid ${MKT.ink10}`, borderRadius: 16, background: "rgba(255,255,255,0.55)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640, fontSize: 14.5 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: "24%" }}>Features</th>
                  <th style={{ ...TH, width: "38%" }}>{c.name}</th>
                  <th style={{ ...TH, width: "38%", background: MKT.green10, color: MKT.green }}>
                    <span style={{ fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 2 }}>
                      ★ Recommended
                    </span>
                    SeldonFrame
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_LABELS.map((row) => (
                  <tr key={row.key}>
                    <td style={{ ...TD, fontWeight: 700 }}>{row.label}</td>
                    <td style={{ ...TD, color: "rgba(34,29,23,0.66)" }}>{c.them[row.key]}</td>
                    <td style={{ ...TD, background: "rgba(0,137,123,0.05)", color: "rgba(34,29,23,0.85)", fontWeight: 500 }}>
                      {SF_COLUMN[row.key]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── WHY THEY SWITCH ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>
            Why agencies &amp; builders switch from {c.name}
          </h2>
          <div className="sf-alt-cards" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20 }}>
            {c.switchReasons.map((reason) => (
              <div
                key={reason.title}
                style={{
                  borderLeft: `3px solid ${MKT.green}`,
                  border: `1px solid ${MKT.ink10}`,
                  borderLeftWidth: 3,
                  borderLeftColor: MKT.green,
                  borderRadius: 14,
                  padding: "18px 20px",
                  background: "rgba(255,255,255,0.55)",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16.5, fontWeight: 800 }}>{reason.title}</h3>
                <p style={{ margin: "8px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.7)" }}>{reason.body}</p>
              </div>
            ))}
          </div>
          <p
            style={{
              margin: "20px 0 0",
              fontSize: 14.5,
              lineHeight: 1.6,
              color: "rgba(34,29,23,0.62)",
              background: MKT.ink05,
              borderRadius: 12,
              padding: "14px 18px",
              maxWidth: 760,
            }}
          >
            <strong style={{ color: "rgba(34,29,23,0.8)" }}>To be fair:</strong> {c.whenTheyWin}
          </p>
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: "38px 0 8px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 28, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {faq.map((item) => (
            <details
              key={item.q}
              style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}
            >
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{item.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{item.a}</p>
            </details>
          ))}
        </section>

        {/* ── MORE COMPARISONS (flywheel) ── */}
        <section style={{ padding: "30px 0 8px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 20, fontWeight: 800, letterSpacing: "-0.01em" }}>More comparisons</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {others.map((o) => (
              <Link
                key={o.slug}
                href={`/alternative-to-${o.slug}`}
                className="sf-link"
                style={{
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "rgba(34,29,23,0.7)",
                  border: `1px solid ${MKT.ink10}`,
                  borderRadius: 999,
                  padding: "7px 14px",
                  textDecoration: "none",
                  background: "rgba(255,255,255,0.5)",
                }}
              >
                Alternative to {o.name}
              </Link>
            ))}
          </div>
        </section>

        {/* ── FINAL CTA ── */}
        <section
          style={{
            marginTop: 40,
            border: `1px solid ${MKT.ink10}`,
            borderRadius: 20,
            padding: "34px 32px",
            background: MKT.dark,
            color: MKT.paper,
            textAlign: "center",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>
            See your client&apos;s AI front office before you pay anything
          </h2>
          <p style={{ margin: "10px auto 0", fontSize: 15.5, lineHeight: 1.6, color: "rgba(246,242,234,0.75)", maxWidth: 560 }}>
            Paste a business&apos;s website and SeldonFrame builds the site, CRM, booking calendar and AI receptionist in about 3 minutes —
            free, before you sign up. Then it&apos;s $29/mo flat for unlimited workspaces.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 22 }}>
            <a
              href={START_HREF}
              style={{ background: MKT.green, color: "#fff", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}
            >
              Start free
            </a>
            <a
              href={DEMO_HREF}
              style={{
                border: "1.5px solid rgba(246,242,234,0.3)",
                color: MKT.paper,
                padding: "12px 24px",
                borderRadius: 12,
                fontWeight: 700,
                fontSize: 15.5,
                textDecoration: "none",
              }}
            >
              Book a 15-min demo
            </a>
          </div>
        </section>
      </main>

      <MarketplaceFooter />
    </div>
  );
}

const TH: CSSProperties = {
  textAlign: "left",
  padding: "14px 18px",
  fontSize: 13,
  fontWeight: 800,
  letterSpacing: "0.02em",
  borderBottom: "1px solid rgba(34,29,23,0.10)",
};

const TD: CSSProperties = {
  padding: "13px 18px",
  verticalAlign: "top",
  lineHeight: 1.5,
  borderBottom: "1px solid rgba(34,29,23,0.07)",
};

/** Scoped responsive tweaks (inline styles can't express media queries). */
function AltPageStyles(): ReactElement {
  return (
    <style>{`
      @media (max-width: 720px) {
        .sf-altpage .sf-alt-h1 { font-size: 32px !important; }
        .sf-altpage .sf-alt-cards { grid-template-columns: 1fr !important; }
      }
    `}</style>
  );
}
