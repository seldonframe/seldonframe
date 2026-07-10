// /charts/missed-revenue-decay — "The Lead Decay Curve": the interactive
// visual companion to the speed-to-lead cluster (lib/seo/guides/what-is-speed-to-lead.ts,
// average-lead-response-time-by-industry.ts, the-5-minute-rule-for-lead-response.ts).
// Server-rendered GEO copy + FAQ around a client chart island. Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { LeadDecayChart } from "@/components/seo/lead-decay-chart";
import { AuthorByline, articleLd } from "@/components/seo/author-byline";
import { buildOgUrl } from "@/lib/seo/og-card";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "The Lead Decay Curve — What Happens to a Lead While You Don't Reply";
const DESCRIPTION =
  "An interactive chart of what slow follow-up costs a service business, minute by minute — sourced from lead-response research, with an industry marker and a revenue-at-risk calculator.";
const CANONICAL = "/charts/missed-revenue-decay";
const LAST_UPDATED = "2026-07-09";

const OG_URL = buildOgUrl({ kind: "tool", name: "The Lead Decay Curve", hook: "What does a lead cost you while it sits unanswered?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL, types: { "text/markdown": `${CANONICAL}.md` } },
  openGraph: { title: TITLE, description: DESCRIPTION, url: CANONICAL, type: "article", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "Is the 5-minute rule real?",
    a: "It's a real, widely-repeated finding from lead-response research — but it's not a precise law. The most-cited source is a study of ~15,000 leads across six companies (publicly summarized at the Lead Response Management site), whose data collection predates a 2011 <em>Harvard Business Review</em> analysis by the same researcher. Both are old, and the exact multipliers (like &ldquo;21x&rdquo;) come from one vendor-hosted study, not a peer-reviewed, replicated result. The direction — odds of reaching and qualifying a lead drop sharply as time passes — is the part worth trusting.",
  },
  {
    q: "What should I do about it?",
    a: "Route every channel (calls, forms, texts, chat) into one place, reply first and qualify second, and cover the after-hours and mid-job gaps where most slow responses happen. Our <a href=\"/tools/speed-to-lead-calculator\">speed-to-lead calculator</a> puts a number on your own gap.",
  },
  {
    q: "Why does the chart have dashed sections?",
    a: "Because the literature doesn't give us a data point at every minute — it gives discrete comparisons (like &ldquo;5 minutes vs. 30 minutes&rdquo;). Where there's a real gap in the sourced data, we draw a dashed, differently-colored line instead of a smooth curve, so the chart never implies precision the research doesn't have.",
  },
  {
    q: "Where do the industry markers come from?",
    a: "They're an illustrative placement, not a sourced per-industry benchmark. Our own <a href=\"/guides/average-lead-response-time-by-industry\">guide on lead response time by industry</a> found no trustworthy numeric breakdown exists — most of what circulates online is old, unverifiable, or measuring different things. The marker shows roughly where a typical business in that trade might land, not a cited average.",
  },
];

export default function MissedRevenueDecayPage(): ReactElement {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripHtml(f.a) } })),
  };
  const artLd = articleLd({
    headline: TITLE,
    description: DESCRIPTION,
    canonicalPath: CANONICAL,
    dateModified: LAST_UPDATED,
  });
  const ungatedBuildEnabled = isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD });

  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(artLd) }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "34px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 20 }}>
          <Link href="/charts" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Charts
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>The Lead Decay Curve</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 760 }}>
          The Lead Decay Curve
        </h1>
        <p style={{ margin: "14px 0 6px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 700 }}>
          What happens to a lead while you don&rsquo;t reply. Every point below is a real, sourced comparison from lead-response research — not a
          smoothed guess. Pick your industry and your numbers to see what slow follow-up is quietly costing you.
        </p>
        <AuthorByline checked="July 2026" />

        <div style={{ marginTop: 24 }}>
          <LeadDecayChart />
        </div>

        {/* ── Plain-language walkthrough ── */}
        <section style={{ padding: "40px 0 0", maxWidth: 760 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>What this chart actually shows</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15.5, lineHeight: 1.8, color: "rgba(34,29,23,0.78)" }}>
            <li>
              A new lead who reaches out — a call, a form, a text — is <strong>usually reaching out to more than one business</strong> at the same
              time.
            </li>
            <li>
              Research on thousands of real leads keeps finding the same pattern: your odds of actually <strong>reaching and qualifying</strong>{" "}
              that lead are highest right away, and <strong>fall off fast</strong> the longer you wait.
            </li>
            <li>
              One widely-cited study found the odds of qualifying a lead dropped <strong>fourfold</strong> between 5 and 10 minutes, and{" "}
              <strong>21-fold</strong> between 5 and 30 minutes. Those exact numbers are old and come from one study — trust the direction more than
              the decimal point.
            </li>
            <li>
              The <strong>dashed line</strong> on the chart means there&rsquo;s no sourced data point in that gap — we don&rsquo;t pretend to know
              exactly how the curve behaves between 30 minutes and 24 hours, so we don&rsquo;t draw it like we do. (The same study
              separately notes qualification success fell &ldquo;over sixfold&rdquo; within the first hour overall — a coarser, differently-scoped
              stat than the 30-minute point, which is why it&rsquo;s not plotted as its own point on this curve.)
            </li>
            <li>
              Move the sliders to put a <strong>rough dollar figure</strong> on your own gap — the same honest, transparent math as our other free
              calculators.
            </li>
          </ul>
        </section>

        <section style={{ padding: "36px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }} dangerouslySetInnerHTML={{ __html: f.q }} />
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }} dangerouslySetInnerHTML={{ __html: f.a }} />
            </details>
          ))}
          <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            Related: the{" "}
            <Link href="/guides/what-is-speed-to-lead" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              what-is-speed-to-lead guide
            </Link>
            , the{" "}
            <Link href="/tools/missed-call-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              missed-call cost calculator
            </Link>
            , or{" "}
            <Link href="/tools/speed-to-lead-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              run your own speed-to-lead numbers
            </Link>
            .{" "}
            {ungatedBuildEnabled && (
              <>
                Or skip straight to it —{" "}
                <Link href="/try" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
                  build a free AI front office that answers instantly
                </Link>
                .
              </>
            )}
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
