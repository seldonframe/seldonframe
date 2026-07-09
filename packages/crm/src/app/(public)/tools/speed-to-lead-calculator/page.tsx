// /tools/speed-to-lead-calculator — free tool (the free-tools SEO motion):
// server-rendered GEO copy + FAQ around a small client calculator island.
// Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { SpeedToLeadCalculator } from "@/components/seo/speed-to-lead-calculator";
import { buildOgUrl } from "@/lib/seo/og-card";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "Speed-to-Lead Calculator — how much revenue does slow follow-up cost you?";
const DESCRIPTION =
  "Free calculator: estimate the revenue you lose by replying to new leads too slowly, from your lead volume, response time, close rate and deal value — and what instant AI response recovers.";

const OG_URL = buildOgUrl({ kind: "tool", name: "Speed-to-Lead Calculator", hook: "What does slow follow-up cost you?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/speed-to-lead-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/speed-to-lead-calculator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "What is speed-to-lead, and why does it matter so much?",
    a: "Speed-to-lead is how long it takes you to respond after someone reaches out. Lead-response research keeps finding the same pattern — the <strong>&ldquo;5-minute rule&rdquo;</strong>: the odds of actually reaching and qualifying a lead drop sharply the longer you wait, because they're also contacting your competitors.",
  },
  {
    q: "How is the lost revenue estimated?",
    a: "It's a simple, transparent model: your close rate when you reply fast, multiplied by a <strong>reach-and-qualify factor</strong> that falls as your response time grows. The gap between replying instantly and replying at your current speed is the revenue left on the table. The factors are a conservative estimate, not a specific study's numbers — your real results will vary.",
  },
  {
    q: "How does an AI agent fix slow follow-up?",
    a: "It responds the <strong>instant</strong> a lead comes in — call, text, form or chat — 24/7, asks the qualifying questions, and books the appointment before the lead moves on. No lead sits in an inbox waiting for someone to get to it.",
  },
];

export default function SpeedToLeadCalculatorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Speed-to-lead calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Speed-to-Lead Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          The lead who reaches out is also reaching out to your competitors. Move the sliders to see how much revenue slow
          follow-up quietly costs you — and what answering instantly recovers.
        </p>
        <SpeedToLeadCalculator />
        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }} dangerouslySetInnerHTML={{ __html: f.a }} />
            </details>
          ))}
          <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            Related: the <Link href="/ai-agents/ai-receptionist" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>AI receptionist</Link>{" "}
            that answers instantly, the <Link href="/tools/missed-call-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>missed-call cost calculator</Link>,{" "}
            or <Link href="/alternatives" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>how SeldonFrame compares</Link>.
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
