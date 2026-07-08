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

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

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
    a: "Multiply your close rate by your job value. Close <strong>30%</strong> of callers on <strong>$400</strong> jobs? You lose about <strong>$120</strong> every time the phone rings out. Most callers won't leave a voicemail — they just call the next company.",
  },
  {
    q: "What percentage of missed callers call a competitor instead?",
    a: "Most callers who hit voicemail hang up and keep searching. That's why speed matters: answering instantly, or texting back within a minute, catches the buyer before they dial the next company.",
  },
  {
    q: "How does an AI receptionist recover this revenue?",
    a: "It answers every call, <strong>24/7</strong>. It asks the right questions, checks real availability, and books the job into your calendar and CRM. If it can't answer, it texts the caller back right away — so they don't call a competitor.",
  },
];

export default function MissedCallCalculatorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Missed call cost calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Missed Call Cost Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Every missed call is a customer who might call someone else. Move the sliders below to see how much that costs
          you — most owners are surprised by the number.
        </p>
        <MissedCallCalculator />
        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }} dangerouslySetInnerHTML={{ __html: f.a }} />
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
