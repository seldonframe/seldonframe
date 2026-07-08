// /tools/missed-call-calculator — free tool (the PostPlanify free-tools SEO
// motion): server-rendered GEO copy + FAQ around a small client calculator
// island. Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { MissedCallCalculator } from "@/components/seo/missed-call-calculator";

const TITLE = "Missed Call Cost Calculator — how much revenue are missed calls costing you?";
const DESCRIPTION =
  "Free calculator: estimate the monthly revenue your business loses to missed calls, from your call volume, close rate and average job value — and what an AI receptionist recovers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/missed-call-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/missed-call-calculator", type: "website" },
};

const FAQ = [
  {
    q: "How much does a missed call actually cost a service business?",
    a: "Multiply your close rate by your average job value: a business that closes 30% of callers on $400 jobs loses about $120 in expected revenue every time the phone rings out. Industry studies consistently find a large share of callers won't leave a voicemail and simply call the next company.",
  },
  {
    q: "What percentage of missed callers call a competitor instead?",
    a: "Most callers who reach voicemail don't leave a message — they move down the search results. That's why speed-to-lead (answering instantly, or texting back within a minute) recovers so much revenue: you catch the buyer before the next dial.",
  },
  {
    q: "How does an AI receptionist recover this revenue?",
    a: "It answers every call 24/7, qualifies the caller, checks real availability and books the job directly into your calendar and CRM — and when a call can't be answered, it texts the caller back instantly so the conversation continues before they call a competitor.",
  },
];

export default function MissedCallCalculatorPage(): ReactElement {
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Missed call cost calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Missed Call Cost Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Every unanswered ring is a buyer choosing between leaving a voicemail and calling your competitor. Slide your real
          numbers below to see what missed calls cost your business — most owners underestimate it by a lot.
        </p>
        <MissedCallCalculator />
        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{f.a}</p>
            </details>
          ))}
          <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            Related: <Link href="/ai-agents/ai-receptionist" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>the AI receptionist</Link>{" "}
            that answers these calls, or see <Link href="/alternatives" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>how SeldonFrame compares</Link>{" "}
            to the tools you're evaluating.
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
