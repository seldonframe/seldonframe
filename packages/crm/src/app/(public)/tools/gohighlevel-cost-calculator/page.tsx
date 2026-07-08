// /tools/gohighlevel-cost-calculator — free tool (the wedge tool): server-
// rendered GEO copy + FAQ around a client cost-stacking calculator island.
// Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { GohighlevelCostCalculator } from "@/components/seo/gohighlevel-cost-calculator";
import { BuildWidget } from "@/components/seo/build-widget";
import { buildOgUrl } from "@/lib/seo/og-card";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "GoHighLevel Pricing Calculator — what it really costs an agency";
const DESCRIPTION =
  "Free calculator: see what GoHighLevel really costs your agency at N client sub-accounts — plan base, the AI Employee add-on, and rebilled SMS/email/voice usage, all stacked per client.";

const OG_URL = buildOgUrl({ kind: "tool", name: "GoHighLevel Cost Calculator", hook: "How much does GoHighLevel cost?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/gohighlevel-cost-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/gohighlevel-cost-calculator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "How much does GoHighLevel cost for an agency?",
    a: "GoHighLevel's plans run <strong>$97 to $497/month</strong>. But that's just the base plan — the AI Employee add-on costs <strong>$50-$97/month per client sub-account</strong>, and SMS/email/voice usage is rebilled on top at cost. A 10-client agency with the AI Employee on can easily pay well past $1,000/month.",
  },
  {
    q: "How much is the GoHighLevel AI Employee add-on?",
    a: "It's <strong>$50/month per sub-account</strong> on Starter-level plans, or <strong>$97/month per sub-account</strong> on the Unlimited plan and above. It is not included in any base plan price — it stacks per client.",
  },
  {
    q: "Does GoHighLevel charge for SMS, email, and voice minutes?",
    a: "Yes. GoHighLevel rebills phone, SMS, and email usage at cost through its underlying providers, on top of every plan. The exact per-unit rate isn't published on the pricing page, so busy clients can add up fast and unpredictably.",
  },
  {
    q: "Does the cost scale with the number of clients?",
    a: "The plan base price stays flat, but the AI Employee add-on and usage costs multiply by every client sub-account you add — so the per-client cost of running the platform doesn't shrink as you grow, it stacks.",
  },
  {
    q: "How does SeldonFrame's pricing compare?",
    a: "SeldonFrame is <strong>$29/month flat</strong> on the builder tier (agency tiers up to $299) with unlimited workspaces — no per-sub-account software fee. You connect your own AI provider and telephony account, so usage bills at raw provider cost with no markup.",
  },
];

export default function GohighlevelCostCalculatorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>GoHighLevel pricing calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          GoHighLevel Pricing Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          What GoHighLevel really costs an agency at N client sub-accounts — plan base, the AI Employee add-on, and
          rebilled usage, all stacked per client.
        </p>
        <GohighlevelCostCalculator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            This calculator adds up three cost lines using GoHighLevel's own published plan prices and add-on rates:
          </p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>The <strong>plan base</strong> price — flat, does not scale with client count</li>
            <li>The <strong>AI Employee add-on</strong>, charged per sub-account, plan-dependent</li>
            <li>Estimated <strong>SMS, email, and voice usage</strong>, rebilled per client</li>
          </ul>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            The result is a real total monthly bill and a per-client cost, plus a curve showing how the bill grows as
            you add clients.
          </p>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            GoHighLevel's headline price ($97-$497/mo) looks like the whole story, but the <strong>AI Employee add-on
            and usage rebilling scale with every client you add</strong> — so a growing agency's real bill climbs a lot
            faster than the plan price suggests.
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
            <Link href="/gohighlevel-pricing" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              full GoHighLevel pricing breakdown
            </Link>{" "}
            and{" "}
            <Link href="/compare/seldonframe-vs-gohighlevel" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              SeldonFrame vs GoHighLevel
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
