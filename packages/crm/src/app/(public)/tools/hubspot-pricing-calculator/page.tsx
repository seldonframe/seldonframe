// /tools/hubspot-pricing-calculator — free tool (the PostPlanify free-tools
// SEO motion): server-rendered GEO copy + FAQ around a small client
// cost-comparison island. Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { HubspotPricingCalculator } from "@/components/seo/hubspot-pricing-calculator";
import { BuildWidget } from "@/components/seo/build-widget";
import { ChatGptCtaCard } from "@/components/seo/chatgpt-cta";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { buildOgUrl } from "@/lib/seo/og-card";
import { getCompetitorPricing } from "@/lib/seo/competitor-pricing";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const HUBSPOT = getCompetitorPricing("hubspot");

const TITLE = "HubSpot Pricing Calculator — real monthly & first-year cost";
const DESCRIPTION =
  "Free calculator: estimate HubSpot's real monthly and first-year cost by tier, contacts, and seats — including the mandatory Professional/Enterprise onboarding fee HubSpot doesn't put front and center.";

const OG_URL = buildOgUrl({ kind: "tool", name: "HubSpot Pricing Calculator", hook: "What does HubSpot really cost you?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/hubspot-pricing-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/hubspot-pricing-calculator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "How much does HubSpot really cost?",
    a: "HubSpot's Free tools are genuinely free. Marketing Hub Starter runs <strong>$15/seat/mo</strong> (annual billing). Professional jumps to <strong>$800/mo</strong> for 3 seats, plus a <strong>required $3,000 one-time onboarding fee</strong>. Enterprise starts at <strong>$3,600/mo</strong> plus a <strong>required $7,000 onboarding fee</strong>.",
  },
  {
    q: "Is HubSpot's onboarding fee optional?",
    a: "No. HubSpot's Professional and Enterprise Marketing Hub tiers both require a one-time onboarding fee ($3,000 and $7,000) as part of signing up — it's not a nice-to-have add-on, and it's charged on top of the first month's subscription.",
  },
  {
    q: "How does HubSpot price extra contacts?",
    a: "Each tier includes a set number of marketing contacts (1,000 on Starter, 2,000 on Professional, 10,000 on Enterprise). Contacts beyond that are <strong>sold in blocks</strong> at a rate HubSpot doesn't publish clearly — this calculator uses a <strong>hedged (~) estimate</strong> for that overage, not an official number.",
  },
  {
    q: "Does HubSpot charge extra for AI features?",
    a: "Yes. HubSpot's AI features (Breeze) are <strong>credits-metered</strong> on top of your subscription tier and aren't included in the base monthly price shown here.",
  },
  {
    q: "How do I lower my HubSpot bill?",
    a: "The two biggest levers are seats and onboarding: stay on Starter as long as possible, negotiate or DIY the onboarding where allowed, and watch your marketing-contact count closely since crossing a tier threshold is often what triggers the next price jump. See our honest <a href=\"/compare/seldonframe-vs-hubspot\">SeldonFrame vs HubSpot</a> comparison and the full <a href=\"/hubspot-pricing\">HubSpot pricing breakdown</a> for what a flat-rate alternative looks like.",
  },
];

export default function HubspotPricingCalculatorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>HubSpot pricing calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          HubSpot Pricing Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Pick a tier, set your contacts and seats, and see what HubSpot really costs per month and in year one —
          onboarding fee included.
        </p>
        <HubspotPricingCalculator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            This calculator uses HubSpot's own published tier pricing for Starter, Professional, and Enterprise
            Marketing Hub:
          </p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>Base price per tier, including bundled seats where applicable</li>
            <li>Extra seats beyond what's bundled, billed per seat</li>
            <li>Extra marketing contacts beyond your tier's included band (hedged estimate)</li>
            <li>The mandatory one-time onboarding fee, shown separately from the monthly number</li>
          </ul>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            The result is a monthly cost and a first-year total that includes the onboarding fee.
          </p>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            The number most people see first — <strong>{HUBSPOT.plans[2]?.price ?? "$800/mo"}</strong> — isn't the real
            first-year cost. A required onboarding fee, extra seats, and extra-contact overages all stack on top of
            that sticker price before you've used the product for a month.
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
            Source:{" "}
            <a href={HUBSPOT.pricingUrl} target="_blank" rel="noopener noreferrer" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              HubSpot's official pricing page
            </a>{" "}
            (verified {HUBSPOT.verified}). Related:{" "}
            <Link href="/tools/klaviyo-cost-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              Klaviyo cost calculator
            </Link>
            ,{" "}
            <Link href="/hubspot-pricing" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              full HubSpot pricing breakdown
            </Link>
            , and{" "}
            <Link href="/compare/seldonframe-vs-hubspot" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              SeldonFrame vs HubSpot
            </Link>
            . Zoom out: see the full market on one chart —{" "}
            <Link href="/charts/crm-pricing-index" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              CRM Pricing Index →
            </Link>
          </p>
        </section>

        <BuildWidget ungatedBuildEnabled={isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD })} />
        <ChatGptCtaCard />
      </main>
      <MarketplaceFooter />
    </div>
  );
}
