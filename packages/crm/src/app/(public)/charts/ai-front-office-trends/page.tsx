// /charts/ai-front-office-trends — "The AI Front Office Chart": a
// levels.io/the-everything-chart-style subjective trend chart under founder
// Maxime Houle's name. It visualizes HIS beliefs about where every trend in
// local-business AI sits on its adoption curve. Explicitly subjective,
// explicitly a living document — the two disclaimers below the hero exist
// so nobody mistakes this for research.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { MarkdownPointer } from "@/components/seo/markdown-pointer";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { TrendChart } from "@/components/seo/trend-chart";
import { TREND_CHART_LAST_UPDATED } from "@/lib/seo/trend-chart-data";
import { buildOgUrl } from "@/lib/seo/og-card";

const TITLE = "The AI Front Office Chart — every trend in local-business AI, mapped by a founder building in it";
const DESCRIPTION =
  "One founder's subjective belief-map of where every trend in local-business AI sits on its adoption curve — voice AI, MCP, GHL-style platforms, per-seat pricing and more. Opinion, not research, updated monthly-ish.";
const CANONICAL_PATH = "/charts/ai-front-office-trends";

const OG_URL = buildOgUrl({ kind: "tool", name: "The AI Front Office Chart", hook: "Every trend in local-business AI, mapped" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: {
    canonical: CANONICAL_PATH,
    types: { "text/markdown": `${CANONICAL_PATH}.md` },
  },
  openGraph: { title: TITLE, description: DESCRIPTION, url: CANONICAL_PATH, type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

const FAQ = [
  {
    q: "Is this data or opinion?",
    a: "Opinion, loudly. This chart is not a research report, a survey, or a model of real adoption numbers — it's Maxime Houle's personal read on where each trend sits, visualized as a curve. Treat every line as a belief, not a measurement.",
  },
  {
    q: "How often is it updated?",
    a: "Monthly-ish. Max edits the underlying takes and curves whenever his thinking moves, not on a fixed schedule — check the \"updated\" date at the top for the last edit.",
  },
  {
    q: "What's the methodology?",
    a: "One founder's judgment, annotated with real events. The curves come from watching this market closely (and building in it) — the only \"data\" involved is that annotations are pinned to real, publicly verifiable dates (a model shipping, a regulation taking effect), never invented statistics.",
  },
  {
    q: "Can I suggest a trend to add?",
    a: "Yes — reply to Max on x.com/seldonframe with the trend and where you think it sits. He reads every one and updates the chart directly.",
  },
];

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

export default function AiFrontOfficeChartPage(): ReactElement {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripHtml(f.a) } })),
  };
  const articleJsonLd = articleLd({
    headline: TITLE,
    description: DESCRIPTION,
    canonicalPath: CANONICAL_PATH,
    dateModified: "2026-07",
  });

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <MarkdownPointer href={`${CANONICAL_PATH}.md`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "34px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 20 }}>
          <Link href="/charts" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Charts
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>AI front office trends</span>
        </nav>

        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
          {`One founder's opinion · updated ${TREND_CHART_LAST_UPDATED}`}
        </div>
        <h1 style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, maxWidth: 820 }}>
          The AI Front Office Chart
        </h1>
        <p style={{ margin: "16px 0 0", fontSize: 18, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 720 }}>
          Every trend in local-business AI, mapped on one chart — where I think it sits on its adoption curve right now,
          and where I think it's headed.
        </p>
        <AuthorByline checked={TREND_CHART_LAST_UPDATED} />

        {/* ── disclaimers, in Max's voice ── */}
        <div style={{ marginTop: 24, display: "grid", gap: 12, maxWidth: 780 }}>
          <div style={{ border: `1px solid ${MKT.ink10}`, borderLeftWidth: 3, borderLeftColor: MKT.green, borderRadius: 12, padding: "14px 18px", background: "rgba(31, 43, 36,0.05)" }}>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.8)" }}>
              <strong>This is completely subjective.</strong> Every line on this chart is my belief, not a research
              finding. I run a company in this space, so I'm biased — I'm telling you that up front instead of hiding
              it behind a methodology section.
            </p>
          </div>
          <div style={{ border: `1px solid ${MKT.ink10}`, borderLeftWidth: 3, borderLeftColor: "#B8860B", borderRadius: 12, padding: "14px 18px", background: "rgba(184,134,11,0.05)" }}>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.8)" }}>
              <strong>I'll keep updating this chart.</strong> As my thinking changes, the curves change — this is a
              living document, not a one-time snapshot. Check the "updated" date above for the last edit.
            </p>
          </div>
        </div>

        {/* ── chart ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <TrendChart />
        </section>

        {/* ── suggest a trend ── */}
        <section style={{ padding: "20px 0 8px" }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            Think I'm missing a trend, or wrong about where one sits? Tell me at{" "}
            <a href="https://x.com/seldonframe" rel="noopener" target="_blank" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              x.com/seldonframe
            </a>{" "}
            — I read every reply and update the chart directly.
          </p>
        </section>

        {/* ── FAQ ── */}
        <section style={{ padding: "34px 0 8px" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{f.a}</p>
            </details>
          ))}
        </section>

        {/* ── internal links ── */}
        <section style={{ padding: "20px 0 8px" }}>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            More opinion + tools:{" "}
            <Link href="/guides/one-person-company-os" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              the one-person company OS
            </Link>
            ,{" "}
            <Link href="/charts/crm-pricing-index" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              the CRM pricing index chart
            </Link>
            , or browse{" "}
            <Link href="/automations" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              our automations
            </Link>
            .
          </p>
        </section>

        {/* ── CTA ── */}
        <section style={{ marginTop: 30, border: `1px solid ${MKT.ink10}`, borderRadius: 20, padding: "34px 32px", background: MKT.dark, color: MKT.paper, textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>Building on the rising side of this chart</h2>
          <p style={{ margin: "10px auto 0", fontSize: 15.5, lineHeight: 1.6, color: "rgba(246,242,234,0.75)", maxWidth: 560 }}>
            SeldonFrame is my bet on voice AI, MCP, and flat pricing all winning. Paste a business's website and it
            builds the site, CRM, booking calendar and AI receptionist in about 3 minutes — free, before you sign up.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginTop: 22 }}>
            <a href="/#hero-form" style={{ background: MKT.green, color: "#fff", padding: "13px 26px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}>
              Start for free
            </a>
            <a
              href="https://app.seldonframe.com/book/seldonframes-workspace-7798/default"
              style={{ border: "1.5px solid rgba(246,242,234,0.3)", color: MKT.paper, padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15.5, textDecoration: "none" }}
            >
              Book a demo call
            </a>
          </div>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
