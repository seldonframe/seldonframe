// /sell — the "sell AI agents" hub page. Targets the keyword "sell ai agents"
// and fans out to the four ways SeldonFrame lets a builder monetize an agent
// (direct, white-label, marketplace, MCP rental), each backed by its pillar
// guide(s). The "complete builder's library" section is registry-driven
// (guidesInCluster("sell-agents")) so it grows automatically as the content
// loop adds guides to that cluster — no hardcoded list to maintain.

import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { guidesInCluster } from "@/lib/seo/guides";
import { ChatGptCtaButton } from "@/components/seo/chatgpt-cta";

export const metadata: Metadata = {
  title: "Sell AI Agents: Direct, White-Label, Marketplace, or MCP | SeldonFrame",
  description:
    "Four ways to sell AI agents you build: direct to local businesses, white-label as an agency, list on the marketplace, or rent via MCP. Build once with SeldonFrame.",
  alternates: { canonical: "/sell" },
};

type Path = {
  n: string;
  title: string;
  body: string;
  links: { href: string; label: string }[];
};

const PATHS: Path[] = [
  {
    n: "01",
    title: "Sell direct to local businesses on retainer",
    body: "Build an agent for a real business, deploy it into their own hosted workspace, and bill them a flat monthly retainer. No middleman, no revenue share — you keep the client relationship and the recurring revenue.",
    links: [
      { href: "/guides/how-to-make-money-selling-ai-agents", label: "How to make money selling AI agents" },
      { href: "/guides/how-to-sell-ai-agents-to-local-businesses", label: "How to sell AI agents to local businesses" },
    ],
  },
  {
    n: "02",
    title: "White-label across clients as an agency",
    body: "Run client workspaces under your own brand on the Agency plan (from $99/mo, 0% GMV) — white-label, branded client portal, 10 sub-accounts included. Package the agent, the CRM, and the booking flow as your own AI front-office product.",
    links: [
      { href: "/guides/white-label-ai-agents", label: "White-label AI agents" },
      { href: "/agencies", label: "For agencies" },
    ],
  },
  {
    n: "03",
    title: "List it on the marketplace",
    body: "Publish the agent you built to the SeldonFrame marketplace so other builders and businesses can find and install it. SeldonFrame takes a flat 5% marketplace fee on marketplace sales — direct sales through your own site/CRM aren't touched (a flat 2% GMV fee applies only on solo Builder/Managed plans when SeldonFrame is the sales channel; agency plans pay 0%).",
    links: [
      { href: "/marketplace/build", label: "Build to list" },
      { href: "/guides/best-ai-agent-marketplaces", label: "Best AI agent marketplaces" },
    ],
  },
  {
    n: "04",
    title: "Rent it out via MCP",
    body: "Expose the agent as a rentable MCP endpoint so another builder or agent can call it programmatically and pay per use, without ever seeing your source. Owned and portable — no lock-in either direction.",
    links: [
      { href: "/guides/how-to-rent-out-an-ai-agent-via-mcp", label: "How to rent out an AI agent via MCP" },
      { href: "/guides/what-is-an-mcp-marketplace", label: "What is an MCP marketplace" },
    ],
  },
];

export default function SellHubPage(): ReactElement {
  const guides = guidesInCluster("sell-agents");

  const collectionLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Sell AI Agents: Build Once, Sell It Four Ways",
    description: metadata.description,
    url: "https://www.seldonframe.com/sell",
  };
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://www.seldonframe.com" },
      { "@type": "ListItem", position: 2, name: "Sell AI agents", item: "https://www.seldonframe.com/sell" },
    ],
  };
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
      <MarketplaceNav />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px 70px", width: "100%" }}>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.12 }}>
          Sell AI Agents: Build Once, Sell It Four Ways
        </h1>
        <p style={{ margin: "16px 0 0", fontSize: 18, lineHeight: 1.6, color: "rgba(34,29,23,0.78)", fontWeight: 500, maxWidth: 640 }}>
          Build an agent. Sell it. Get paid. — direct to a client, white-labeled across an agency, listed on the marketplace, or rented out over MCP. Same agent, four ways to get paid.
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 26 }}>
          <Link href="/marketplace/build" className="sf-link" style={{ background: MKT.ink, color: "#F6F2EA", padding: "12px 24px", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none" }}>
            Build free
          </Link>
          <Link href="/guides" className="sf-link" style={{ border: `1.5px solid ${MKT.ink10}`, color: MKT.ink, padding: "11px 22px", borderRadius: 12, fontWeight: 700, fontSize: 15, textDecoration: "none", background: "rgba(255,255,255,0.5)" }}>
            Browse all guides
          </Link>
          <ChatGptCtaButton />
        </div>

        <section style={{ marginTop: 44 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 18 }}>
            {PATHS.map((p) => (
              <div key={p.n} style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 16, padding: "24px 26px", background: "rgba(255,255,255,0.6)" }}>
                <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "0.06em", color: MKT.green }}>{p.n}</div>
                <div style={{ marginTop: 6, fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>{p.title}</div>
                <p style={{ margin: "10px 0 16px", fontSize: 15, lineHeight: 1.6, color: "rgba(34,29,23,0.72)" }}>{p.body}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {p.links.map((l) => (
                    <Link key={l.href} href={l.href} className="sf-link" style={{ color: MKT.green, fontWeight: 700, fontSize: 14.5, textDecoration: "none" }}>
                      {l.label} &rarr;
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: 48 }}>
          <h2 style={{ margin: "0 0 14px", fontSize: 23, fontWeight: 800, letterSpacing: "-0.02em" }}>The complete builder's library</h2>
          <p style={{ margin: "0 0 18px", fontSize: 15, lineHeight: 1.6, color: "rgba(34,29,23,0.7)", maxWidth: 640 }}>
            Every guide on building and selling AI agents, in one place.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
            {guides.map((g) => (
              <Link key={g.slug} href={`/guides/${g.slug}`} className="sf-link" style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 14, padding: "18px 20px", textDecoration: "none", color: MKT.ink, background: "rgba(255,255,255,0.55)", display: "block" }}>
                <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{g.title}</div>
                <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.62)" }}>{g.description}</p>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
