// /tools/claude-project-brief-generator — free tool (the PostPlanify
// free-tools SEO motion): server-rendered GEO copy + FAQ around a pure
// client-side brief assembler. Ends in the SF CTA ("…or let SeldonFrame build
// and maintain this automatically"). Additive: no DB, no LLM calls.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { ClaudeProjectBriefGenerator } from "@/components/seo/claude-project-brief-generator";

const TITLE = "Claude Project Brief Generator — free standing-instructions template for client work";
const DESCRIPTION =
  "Free tool: generate a ready-to-paste Claude Project instructions block (role, tasks, tone, assumptions, never-list) plus the knowledge-base checklist — the standing brief that makes Projects actually work for client work.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/tools/claude-project-brief-generator" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/tools/claude-project-brief-generator", type: "website" },
};

const FAQ = [
  {
    q: "What should Claude Project instructions actually contain?",
    a: "A complete standing brief written for a reader with zero history: the role Claude plays, who the audience is, the 2–3 tasks the project exists for, tone and format rules, the domain facts to assume in every response, and a hard NEVER list. One line worth adding every time: 'don't ask clarifying questions — make a reasonable assumption, state it, and proceed.'",
  },
  {
    q: "What belongs in the knowledge base vs the instructions?",
    a: "Behavior belongs in instructions; reference material belongs in knowledge. Keep each knowledge doc tight — one to three pages. A three-page voice guide beats a forty-page brand manual because retrieval surfaces dense signal, and loosely related bulk dilutes it.",
  },
  {
    q: "Do I need one Claude Project per client?",
    a: "Yes — one project per concern is the rule that keeps context clean, which means the setup and maintenance labor scales with your client count. That per-client labor is exactly what SeldonFrame automates: it generates the standing brief and grounded knowledge from the client's website, auto-tests retrieval, and attaches the website, CRM, booking and AI receptionist the brief can only describe.",
  },
];

export default function ClaudeProjectBriefGeneratorPage(): ReactElement {
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
          <span style={{ color: "rgba(34,29,23,0.7)" }}>Claude Project brief generator</span>
        </nav>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1, maxWidth: 720 }}>
          Claude Project Brief Generator
        </h1>
        <p style={{ margin: "14px 0 26px", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 680 }}>
          A Claude Project is only as good as its standing brief — and most people paste one vague line. Fill in the eight
          fields below and get the complete instructions block (role, tasks, tone, assumptions, never-list), ready to paste
          into your project settings, plus the knowledge-base checklist that makes retrieval actually work.
        </p>
        <ClaudeProjectBriefGenerator />
        <section style={{ padding: "40px 0 0" }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>Frequently asked questions</h2>
          {FAQ.map((f) => (
            <details key={f.q} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 12, padding: "14px 18px", marginBottom: 10, background: "rgba(255,255,255,0.55)" }}>
              <summary style={{ fontWeight: 700, fontSize: 15.5, cursor: "pointer" }}>{f.q}</summary>
              <p style={{ margin: "10px 0 2px", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{f.a}</p>
            </details>
          ))}
          <p style={{ margin: "22px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
            Related: <Link href="/alternative-to-claude-projects" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>Claude Projects vs SeldonFrame for client work</Link>{" "}
            — the honest comparison, or see <Link href="/alternatives" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>all comparisons</Link>.
          </p>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
