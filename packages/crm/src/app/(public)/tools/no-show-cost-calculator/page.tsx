// /tools/no-show-cost-calculator — free tool (the PostPlanify free-tools SEO
// motion): server-rendered GEO copy + FAQ around a small client calculator
// island. Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { NoShowCostCalculator } from "@/components/seo/no-show-cost-calculator";
import { buildOgUrl } from "@/lib/seo/og-card";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "No-Show Cost Calculator — how much revenue are no-shows costing your business?";
const DESCRIPTION =
  "Free no-show cost calculator: estimate the monthly and yearly revenue your med spa, salon or dental practice loses to no-shows — and how much automated reminders and AI confirmations can win back.";

const OG_URL = buildOgUrl({ kind: "tool", name: "No-Show Cost Calculator", hook: "What do no-shows cost you?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/no-show-cost-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/no-show-cost-calculator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "What is a normal no-show rate for a med spa, salon or dental practice?",
    a: "It genuinely varies by business, location and appointment type. Industry reports commonly cite roughly <strong>10–20%</strong> for booking-heavy local businesses, but yours could be higher or lower — that's why the calculator lets you dial in your own rate instead of assuming one.",
  },
  {
    q: "How much does a single no-show cost?",
    a: "Roughly the value of the slot it burned. A <strong>$150</strong> appointment that no-shows is about <strong>$150</strong> of revenue gone — and often the whole slot, since it's usually too late to rebook it. Multiply that by your no-shows each month and the number adds up fast.",
  },
  {
    q: "Do automated reminders and AI confirmations actually reduce no-shows?",
    a: "Reminders and confirmations generally help, but the amount they recover varies a lot between businesses, so we don't promise a fixed number. The calculator lets you set the reduction you'd realistically expect — an AI that texts, confirms and offers easy rescheduling keeps more of those slots filled.",
  },
];

export default function NoShowCostCalculatorPage(): ReactElement {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: stripHtml(f.a) } })),
  };
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "34px 32px 70px", width: "100%" }}>
        <nav aria-label="Breadcrumb" style={{ display: "flex", gap: 6, fontSize: 13.5, fontWeight: 600, color: "rgba(34,29,23,0.5)", marginBottom: 20 }}>
          <Link href="/tools" className="sf-link" style={{ color: "rgba(34,29,23,0.55)", textDecoration: "none" }}>
            Free tools
          </Link>
          <span style={{ color: "rgba(34,29,23,0.3)" }}>/</span>
          <span style={{ color: "rgba(34,29,23,0.7)" }}>No-show cost calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          No-Show Cost Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Every no-show is a booked slot that earned nothing. If you run a med spa, salon or dental practice, move the
          sliders below to see what those empty chairs cost you — and how much reminders and AI confirmations can win
          back.
        </p>
        <NoShowCostCalculator />
        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }} dangerouslySetInnerHTML={{ __html: f.a }} />
            </details>
          ))}
          <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            Related: browse the rest of our <Link href="/tools" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>free tools</Link>, or see{" "}
            <Link href="/ai-agents/ai-receptionist" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>the AI receptionist</Link>{" "}
            that confirms appointments, texts reminders and rebooks the cancellations for you.
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
