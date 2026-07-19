// /tools/agency-margin-calculator — free tool (the whitelabel pitch as a
// tool): server-rendered GEO copy + FAQ around a client profit-margin
// calculator island. Additive: no DB.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { AgencyMarginCalculator } from "@/components/seo/agency-margin-calculator";
import { BuildWidget } from "@/components/seo/build-widget";
import { ChatGptCtaCard } from "@/components/seo/chatgpt-cta";
import { buildOgUrl } from "@/lib/seo/og-card";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "Agency Profit Margin Calculator — retainers, tool stack & labor";
const DESCRIPTION =
  "Free calculator: work out your agency's real profit margin per client — retainer minus tool-stack cost minus labor — and compare it against a GHL-style stack, a typical SaaS stack, and a flat-rate stack.";

const OG_URL = buildOgUrl({ kind: "tool", name: "Agency Margin Calculator", hook: "What's your real profit margin?" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/agency-margin-calculator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/agency-margin-calculator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "How do I calculate my agency's profit margin?",
    a: "Margin % = (revenue − costs) ÷ revenue × 100. Revenue is your retainer times your client count. Costs are your tool-stack cost per client plus your labor cost per client (hours × hourly rate), both multiplied by client count.",
  },
  {
    q: "What's a good agency profit margin?",
    a: "Most healthy service agencies aim for a <strong>40-60% margin</strong> after tool and labor costs. Below 20-30% leaves little room for error — a slow month, a price hike from a vendor, or one client that needs extra hours can wipe out the profit entirely.",
  },
  {
    q: "Why does my tool stack matter so much to margin?",
    a: "Per-client software fees multiply by every client you run. A stack that costs $150/client instead of $10/client eats <strong>$140 more per client</strong> straight out of your margin, every single month — and it doesn't shrink as you scale.",
  },
  {
    q: "Can a retainer actually lose money?",
    a: "Yes. If tool cost plus labor cost per client exceeds the retainer, every client you add makes you poorer, not richer. This calculator flags that case explicitly and shows the margin percentage instead of a (negative) profit number.",
  },
  {
    q: "How does SeldonFrame change the math?",
    a: "SeldonFrame is a flat platform fee ($29/month builder, up to $299/month agency), amortized across all your clients, plus raw BYOK usage (you pay your AI and telephony provider directly, at cost). That per-client software cost <strong>shrinks as you add clients</strong> instead of multiplying.",
  },
];

export default function AgencyMarginCalculatorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Agency profit margin calculator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Agency Profit Margin Calculator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Retainer, tool-stack cost, and labor — see your real profit margin per client, and how it changes across
          three different cost structures.
        </p>
        <AgencyMarginCalculator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            This calculator works out your monthly profit and margin percentage from four inputs:
          </p>
          <ul style={{ margin: "0 0 10px", paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>Your <strong>monthly retainer</strong> per client</li>
            <li>Your <strong>number of clients</strong></li>
            <li>Your <strong>tool-stack cost</strong> per client, per month</li>
            <li>Your <strong>labor</strong> — hours per client times your hourly rate</li>
          </ul>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            It then compares your margin across three cost-stack scenarios so you can see exactly how much software
            choice affects your bottom line.
          </p>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Agencies rarely track per-client software cost separately from labor — but a per-client software fee <strong>
            multiplies with every client you add</strong>, while a flat platform fee amortized across clients <strong>
            shrinks</strong> as you grow. Over 10-50 clients, that difference is often bigger than a full month of
            labor.
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
        <ChatGptCtaCard />
      </main>
      <MarketplaceFooter />
    </div>
  );
}
