// /charts — the interactive-data-page hub: links every /charts/<slug> page,
// mirroring the /alternatives, /best and /tools hub pattern. Shared by all
// four flagship chart pages (crm-pricing-index owns this file).
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";

export const metadata: Metadata = {
  title: "Charts — live, interactive data on AI front offices for local business — SeldonFrame",
  description:
    "Interactive, re-verified data pages on CRM pricing, AI front-office trends, missed-revenue decay and which software AI engines actually recommend.",
  alternates: { canonical: "/charts" },
};

type ChartEntry = { slug: string; title: string; description: string };

const CHARTS: ChartEntry[] = [
  {
    slug: "crm-pricing-index",
    title: "The CRM Pricing Index",
    description: "Real CRM cost vs business size, re-verified monthly",
  },
  {
    slug: "ai-front-office-trends",
    title: "AI Front-Office Trends",
    description: "Where every trend in local-business AI is on its curve — the founder's subjective map",
  },
  {
    slug: "missed-revenue-decay",
    title: "Missed-Revenue Decay",
    description: "What slow follow-up costs, minute by minute, by industry",
  },
  {
    slug: "ai-recommendation-index",
    title: "The AI Recommendation Index",
    description: "Which software brands AI engines actually recommend — monthly snapshot",
  },
];

export default function ChartsHubPage(): ReactElement {
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <MarketplaceNav />
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "40px 32px 70px", width: "100%" }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
          Live charts
        </div>
        <h1 style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, maxWidth: 720 }}>
          Interactive data on AI front offices for local business
        </h1>
        <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Real data, re-verified on a schedule, presented honestly — including where SeldonFrame doesn't win. Pick a
          chart below.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16, marginTop: 36 }}>
          {CHARTS.map((c) => (
            <Link
              key={c.slug}
              href={`/charts/${c.slug}`}
              className="sf-link"
              style={{
                display: "block",
                textDecoration: "none",
                color: MKT.ink,
                border: `1px solid ${MKT.ink10}`,
                borderRadius: 16,
                padding: "20px 22px",
                background: "rgba(255,255,255,0.55)",
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em", marginBottom: 6 }}>{c.title}</div>
              <div style={{ fontSize: 14, lineHeight: 1.5, color: "rgba(34,29,23,0.65)" }}>{c.description}</div>
              <div style={{ marginTop: 12, fontSize: 13, fontWeight: 700, color: MKT.green }}>View chart →</div>
            </Link>
          ))}
        </div>

        <p style={{ margin: "44px 0 0", fontSize: 14.5, lineHeight: 1.6, color: "rgba(34,29,23,0.65)" }}>
          Also see the{" "}
          <Link href="/alternatives" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
            head-to-head comparisons
          </Link>
          , the{" "}
          <Link href="/tools" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
            free tools
          </Link>
          , and the{" "}
          <Link href="/best" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
            best-of guides
          </Link>
          .
        </p>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
