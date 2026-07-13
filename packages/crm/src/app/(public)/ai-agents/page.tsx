// /ai-agents — the index hub for the programmatic agent pages. Public, no auth.
// Lists every agent "job" with its one-liner + cited stat teaser, each linking
// to its Tier-1 page. This is the human entry point AND the internal-linking
// root that ties the whole /ai-agents/* tree together (the breadcrumb on every
// agent page links back here).
//
// Statically rendered from the registry — no DB, no migration.

import type { Metadata } from "next";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MarketplaceIcon } from "@/components/marketplace/marketplace-icons";
import { MKT, SURFACE_META } from "@/components/marketplace/marketplace-data";
import { AGENT_JOBS } from "@/lib/seo/agent-pages";
import { MarkdownPointer } from "@/components/seo/markdown-pointer";

export const metadata: Metadata = {
  title: "AI Agents for local business — deploy a working one in 60 seconds | SeldonFrame",
  description:
    "Receptionists, review chasers, missed-call text-back, speed-to-lead, lead qualifiers, booking, quoting, win-back, social, and website chat — each deploys a real working agent into your own hosted workspace.",
  // canonical + the Markdown twin (rel="alternate" type="text/markdown") so
  // DOM-parsing crawlers can discover the agent-legible version of this page.
  alternates: { canonical: "/ai-agents", types: { "text/markdown": "/ai-agents.md" } },
  openGraph: {
    title: "AI Agents that work 24/7 for your business | SeldonFrame",
    description:
      "Browse AI agents for local service businesses. Each one deploys into your own hosted workspace in about a minute — or rent it over MCP.",
    url: "/ai-agents",
    type: "website",
  },
};

export default function AgentsIndexPage() {
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans }}>
      <MarketplaceStyles />
      <MarkdownPointer href="/ai-agents.md" />
      <MarketplaceNav active="browse" />

      <main style={{ maxWidth: 980, margin: "0 auto", padding: "40px 32px 70px" }}>
        <header style={{ paddingBottom: 30, borderBottom: "1px solid rgba(34,29,23,0.10)", maxWidth: 720 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
            The agent library
          </div>
          <h1 style={{ margin: 0, fontSize: 44, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05 }}>
            AI agents that work 24/7 for your business
          </h1>
          <p style={{ margin: "16px 0 0", fontSize: 19, lineHeight: 1.5, color: "rgba(34,29,23,0.7)" }}>
            Pick the job you need done. Each agent deploys into your own hosted workspace in about a minute — grounded in
            your services, hours, and pricing — or rents over MCP.
          </p>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 16, marginTop: 30 }}>
          {AGENT_JOBS.map((job) => (
            <Link
              key={job.slug}
              href={`/ai-agents/${job.slug}`}
              className="sf-cardhover"
              style={{
                textDecoration: "none",
                color: MKT.ink,
                background: "#fff",
                border: "1px solid rgba(34,29,23,0.10)",
                borderRadius: 18,
                padding: 22,
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 1px 2px rgba(34,29,23,0.04)",
              }}
            >
              <span
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 13,
                  background: "rgba(5, 150, 105,0.10)",
                  color: MKT.green,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                }}
              >
                <MarketplaceIcon name={SURFACE_META[job.surfaces[0]].icon} size={23} />
              </span>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.015em" }}>{job.name}</div>
              <p style={{ margin: "7px 0 14px", fontSize: 14.5, lineHeight: 1.5, color: "rgba(34,29,23,0.66)", flex: 1 }}>
                {job.oneLiner}
              </p>
              <div style={{ fontSize: 12.5, color: "rgba(34,29,23,0.5)", fontFamily: MKT.fontMono, lineHeight: 1.45 }}>
                {job.painStat.text}
              </div>
              <span style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 650, color: MKT.green }}>
                See the agent
                <MarketplaceIcon name="arrowRight" size={15} />
              </span>
            </Link>
          ))}
        </div>
      </main>

      <MarketplaceFooter />
    </div>
  );
}
