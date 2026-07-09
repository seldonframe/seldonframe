// /tools/service-business-faq-generator — free tool (the SeldonFrame
// free-tools SEO motion): server-rendered GEO copy + FAQ around a small
// client template generator island. Additive: no DB, no AI calls —
// hand-written honest templates the owner fills in. The generated FAQ
// doubles as the Knowledge base for a SeldonFrame AI agent.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { ServiceBusinessFaqGenerator } from "@/components/seo/service-business-faq-generator";
import { buildOgUrl } from "@/lib/seo/og-card";

/** FAQ answers use a few <strong> tags for readability; JSON-LD wants plain
 *  text, so strip tags before embedding in the schema. */
function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

const TITLE = "Service Business FAQ Generator — free, no signup";
const DESCRIPTION =
  "Free FAQ generator for service businesses: pick your trade, area, pricing, and booking method, and get a full set of honest, ready-to-post customer FAQ answers — no AI, no signup, and it doubles as your AI agent's knowledge base.";

const OG_URL = buildOgUrl({ kind: "tool", name: "Service Business FAQ Generator", hook: "Ready-to-post FAQ for any trade" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/service-business-faq-generator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/service-business-faq-generator", type: "website", images: [{ url: OG_URL, width: 1200, height: 630 }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: [OG_URL] },
};

// FAQ strings render via dangerouslySetInnerHTML (inline <strong> only).
// INVARIANT: keep these literal constants — never interpolate user/dynamic input.
const FAQ = [
  {
    q: "Does this FAQ generator use AI?",
    a: "No. Every question and answer comes from <strong>hand-written templates</strong> chosen by your trade, service area, pricing model, and booking method. Nothing is sent to a server or AI model — it all happens in your browser.",
  },
  {
    q: "Why are there placeholders like [your hours] in the answers?",
    a: "Because we won't invent facts about your business. We can't know your real hours, prices, guarantees, or license number — so we leave an <strong>obvious placeholder</strong> for you to fill in. That way every answer a customer reads is genuinely true, not a made-up specific.",
  },
  {
    q: "How does this connect to a SeldonFrame AI agent?",
    a: "A good AI front desk needs a <strong>knowledge base</strong> to answer from. This FAQ is exactly that. Import it into your SeldonFrame workspace as your agent's Knowledge, and it answers customers by phone, web chat, or text — grounded in your real answers, never inventing one.",
  },
];

export default function ServiceBusinessFaqGeneratorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Service business FAQ generator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 700 }}>
          Service Business FAQ Generator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Pick your trade, service area, pricing, and how customers book. Get a ready set of honest
          customer FAQ answers you can copy onto your website, Google profile, or booking page — and
          reuse as your AI agent&apos;s knowledge base. No AI, no signup.
        </p>
        <ServiceBusinessFaqGenerator />

        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>How it works</h2>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.7, color: "rgba(34,29,23,0.72)" }}>
            <li>Every trade gets <strong>hand-written</strong> questions covering hours, area, pricing, booking, emergencies, guarantees, payment, and what to expect</li>
            <li>Your service area and choices tailor the wording — the rest stays as <strong>[bracketed placeholders]</strong> you fill in with your real details</li>
            <li>Copy the whole set or download it as a .txt file</li>
            <li>Nothing is invented on your behalf — so every answer you post is true</li>
          </ul>
        </section>

        <section style={{ padding: "20px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Why it matters</h2>
          <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.65, color: "rgba(34,29,23,0.72)" }}>
            Most service businesses lose jobs to the same unanswered questions — do you cover my area,
            what does it cost, how do I book, can you come today. A clear FAQ answers them before a
            customer ever calls. And the <strong>same FAQ</strong> is exactly what an AI front desk
            needs to be grounded, so it can answer 24/7 using only your real answers — never a made-up
            one.
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
            Want more free tools for your front office? Browse{" "}
            <Link href="/tools" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
              all free tools
            </Link>
            . Comparing your options? Read{" "}
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
