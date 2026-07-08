// /tools/klaviyo-cost-calculator — free tool (the PostPlanify free-tools
// SEO motion): server-rendered GEO copy + FAQ around a small client
// cost-comparison island. Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { KlaviyoCostCalculator } from "@/components/seo/klaviyo-cost-calculator";
import { BuildWidget } from "@/components/seo/build-widget";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";
import { buildOgUrl } from "@/lib/seo/og-card";
import { getCompetitorPricing } from "@/lib/seo/competitor-pricing";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const KLAVIYO = getCompetitorPricing("klaviyo");

const TITLE = "Klaviyo Pricing Calculator — real monthly email + SMS cost";
const DESCRIPTION =
  "Free calculator: estimate Klaviyo's real monthly cost from your active profile count and SMS volume — including the gotcha most stores miss about suppressed profiles and how fast the bill grows as your list does.";

const OG_URL = buildOgUrl({ kind: "tool", name: "Klaviyo Pricing Calculator", hook: "What does Klaviyo really cost as your list grows?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/klaviyo-cost-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/klaviyo-cost-calculator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "How much does Klaviyo cost per month?",
    a: "Klaviyo's Free plan covers up to <strong>250 active profiles</strong>. The Email plan starts around <strong>$20/mo</strong> at 500 profiles and climbs from there — reported at roughly <strong>~$100/mo at 5,000 profiles</strong> and <strong>~$400/mo at 25,000 profiles</strong>. There's no flat ceiling; the price keeps climbing with your list.",
  },
  {
    q: "What counts as an 'active profile' for billing?",
    a: "Klaviyo bills on <strong>active</strong> profiles — people who are subscribed and engaged. Suppressed, unsubscribed, and inactive contacts typically don't count toward your bill, which is why your actual Klaviyo invoice can look smaller than your total contact list would suggest.",
  },
  {
    q: "How much does SMS cost on Klaviyo?",
    a: "SMS beyond your plan's included credits runs roughly <strong>$0.01-$0.015 per US message</strong> (MMS costs more), billed separately from your email plan.",
  },
  {
    q: "Does Klaviyo's price change automatically as my list grows?",
    a: "Yes. Klaviyo's pricing model bumps automatically as your active-profile count crosses each tier threshold — there's no way to lock in a flat rate as your store grows.",
  },
  {
    q: "How do I lower my Klaviyo bill?",
    a: "Regularly clean your list — suppress genuinely inactive profiles so they stop counting toward your active total, since that's the number Klaviyo bills on. Watch SMS volume separately, since it's metered on top. See our honest <a href=\"/compare/seldonframe-vs-klaviyo\">SeldonFrame vs Klaviyo</a> comparison and the full <a href=\"/klaviyo-pricing\">Klaviyo pricing breakdown</a> for what a flat-rate alternative looks like.",
  },
];

export default function KlaviyoCostCalculatorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Klaviyo pricing calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Klaviyo Pricing Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Enter your active profile count and SMS volume, and see what Klaviyo really costs — and how fast that bill
          grows as your list does.
        </p>
        <KlaviyoCostCalculator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            This calculator interpolates between Klaviyo's published price points and adds SMS on top:
          </p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>Email plan cost, interpolated between Klaviyo's published anchors ($0 → $20 → ~$100 → ~$400)</li>
            <li>SMS cost at a hedged per-message rate for anything beyond your included credits</li>
            <li>An optional adjustment for suppressed/inactive profiles, since Klaviyo only bills active ones</li>
            <li>A side-by-side view of your bill today vs. if your list doubled</li>
          </ul>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            The result is a monthly and yearly total, marked with "~" wherever the number is an estimate rather than
            a published figure.
          </p>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Your Klaviyo bill isn't a flat number — it's a <strong>moving target</strong> tied directly to how many
            active profiles you have. Growing your list, which is usually a good thing for your business, is also
            what quietly grows your bill every month.
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
            <a href={KLAVIYO.pricingUrl} target="_blank" rel="noopener noreferrer" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              Klaviyo's official pricing page
            </a>{" "}
            (verified {KLAVIYO.verified}). Related:{" "}
            <Link href="/tools/hubspot-pricing-calculator" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              HubSpot pricing calculator
            </Link>
            ,{" "}
            <Link href="/klaviyo-pricing" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              full Klaviyo pricing breakdown
            </Link>
            , and{" "}
            <Link href="/compare/seldonframe-vs-klaviyo" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              SeldonFrame vs Klaviyo
            </Link>
            .
          </p>
        </section>

        <BuildWidget ungatedBuildEnabled={isWebUngatedBuildOn({ SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD })} />
      </main>
      <MarketplaceFooter />
    </div>
  );
}
