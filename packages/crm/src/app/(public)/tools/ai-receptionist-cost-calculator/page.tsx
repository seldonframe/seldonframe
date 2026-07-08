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

const TITLE = "AI Receptionist Cost Calculator — compare vs. human & answering service";
const DESCRIPTION =
  "Free calculator: compare the real monthly cost of a human receptionist, a live answering service, a per-minute AI phone service, and a flat-rate AI receptionist — based on your own call volume.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/ai-receptionist-cost-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/ai-receptionist-cost-calculator", type: "website" },
};

const FAQ = [
  {
    q: "How much does an AI receptionist cost compared to a human receptionist?",
    a: "A part-time human receptionist typically runs $700-$2,900+/month depending on hours and wage. Per-minute AI phone services usually land between $0.10-$0.50/minute, which scales with call volume. Flat-rate platforms decouple cost from volume entirely.",
  },
  {
    q: "AI receptionist vs answering service — which is cheaper?",
    a: "Live answering services typically charge $1-$3 per call, which adds up fast at higher volumes. A per-minute AI service instead charges by call length. A flat-rate AI receptionist charges neither per call nor per minute — cost stays the same regardless of volume.",
  },
  {
    q: "What hidden costs should I watch for?",
    a: "Overage fees past a plan's included minutes, setup/onboarding fees, per-seat charges for multiple locations, and rate increases tied to call volume are the most common hidden costs in both answering services and metered AI plans.",
  },
  {
    q: "Is a cheaper option ever a worse deal?",
    a: "Yes — cost per call means nothing if calls go unanswered or mishandled. A missed call that would have booked a job often costs far more than any of the options above. Weigh answer rate and booking accuracy alongside price.",
  },
  {
    q: "How does SeldonFrame's pricing work?",
    a: "SeldonFrame is $29/month flat for the platform. You connect your own AI provider and Twilio account, so usage is billed to you directly at raw provider rates — typically a few cents per minute — instead of a markup layered on top.",
  },
];

export default function AiReceptionistCostCalculatorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>AI receptionist cost calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          AI Receptionist Cost Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Human receptionist, live answering service, per-minute AI, or flat-rate AI — plug in your call volume and see
          what each option actually costs per month.
        </p>
        <AiReceptionistCostCalculator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            This calculator estimates four common ways businesses handle inbound calls, using your own call volume and
            average call length: a human receptionist's coverage-hour cost, a live answering service billed per call, an
            AI phone service billed per minute, and a flat-rate platform. The goal is an apples-to-apples monthly number
            you can compare directly.
          </p>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Per-call and per-minute pricing both scale with your success — the busier you get, the more you pay, which
            makes budgeting unpredictable. A flat monthly rate means your phone-answering cost doesn't change whether you
            get 50 calls or 500, which matters most for growing service businesses.
          </p>
        </section>

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{f.a}</p>
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
