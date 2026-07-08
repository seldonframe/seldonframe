// /tools/ai-receptionist-cost-calculator — free tool (the PostPlanify
// free-tools SEO motion): server-rendered GEO copy + FAQ around a small
// client cost-comparison island. Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AiReceptionistCostCalculator } from "@/components/seo/ai-receptionist-cost-calculator";
import { buildOgUrl } from "@/lib/seo/og-card";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "AI Receptionist Cost Calculator — compare vs. human & answering service";
const DESCRIPTION =
  "Free calculator: compare the real monthly cost of a human receptionist, a live answering service, a per-minute AI phone service, and a flat-rate AI receptionist — based on your own call volume.";

const OG_URL = buildOgUrl({ kind: "tool", name: "AI Receptionist Cost Calculator", hook: "What do missed calls cost you?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/ai-receptionist-cost-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/ai-receptionist-cost-calculator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "How much does an AI receptionist cost compared to a human receptionist?",
    a: "A part-time human receptionist usually costs <strong>$700-$2,900+/month</strong>. Per-minute AI phone services usually cost <strong>$0.10-$0.50/minute</strong> — the more calls you get, the more you pay. Flat-rate platforms cost the same no matter how many calls come in.",
  },
  {
    q: "AI receptionist vs answering service — which is cheaper?",
    a: "Live answering services usually charge <strong>$1-$3 per call</strong>, which adds up fast. A per-minute AI service charges by call length instead. A flat-rate AI receptionist charges neither per call nor per minute — the price never changes.",
  },
  {
    q: "What hidden costs should I watch for?",
    a: "Watch for these: <strong>overage fees</strong> once you use up your included minutes, <strong>setup fees</strong>, <strong>per-seat charges</strong> for multiple locations, and <strong>rate hikes</strong> as your call volume grows.",
  },
  {
    q: "Is a cheaper option ever a worse deal?",
    a: "Yes. A cheap price means nothing if calls go unanswered or handled badly. One missed job often costs more than any of these options. Look at answer rate and booking accuracy too, not just price.",
  },
  {
    q: "How does SeldonFrame's pricing work?",
    a: "SeldonFrame is <strong>$29/month flat</strong> for the platform. You connect your own AI provider and Twilio account, so you pay them directly at their raw cost — usually a few cents per minute — with no markup on top.",
  },
];

export default function AiReceptionistCostCalculatorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>AI receptionist cost calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          AI Receptionist Cost Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Human receptionist, answering service, per-minute AI, or flat-rate AI. Enter your call volume and see what each
          one really costs you per month.
        </p>
        <AiReceptionistCostCalculator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            This calculator compares four ways to handle inbound calls, using your own call volume and average call
            length:
          </p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>A <strong>human receptionist&apos;s</strong> hourly cost, based on the coverage hours your call volume needs</li>
            <li>A <strong>live answering service</strong>, billed per call</li>
            <li>A <strong>per-minute AI service</strong>, billed by call length</li>
            <li>A <strong>flat-rate platform</strong>, priced the same every month</li>
          </ul>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            The result is one apples-to-apples monthly number for each option.
          </p>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Per-call and per-minute pricing both grow <strong>with your success</strong> — the busier you get, the more
            you pay. That makes budgeting hard. A <strong>flat monthly rate</strong> costs the same whether you get 50
            calls or 500, which matters most as your business grows.
          </p>
        </section>

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }} dangerouslySetInnerHTML={{ __html: f.a }} />
            </details>
          ))}
          <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            Related:{" "}
            <Link href="/tools/missed-call-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              missed call cost calculator
            </Link>{" "}
            and{" "}
            <Link href="/best/ai-receptionist-for-small-business" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              the best AI receptionist for small business
            </Link>
            .
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
