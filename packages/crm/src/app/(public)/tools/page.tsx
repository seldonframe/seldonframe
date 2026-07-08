// /tools — the free-tools hub (PostPlanify motion: high-intent utility pages
// that rank and convert). One tool at launch; add new tools here + sitemap.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";

export const metadata: Metadata = {
  title: "Free tools for local service businesses — SeldonFrame",
  description: "Free calculators and tools for service businesses and the agencies that serve them: missed-call cost, AI receptionist ROI, and more.",
  alternates: { canonical: "/tools" },
};

const TOOLS = [
  {
    href: "/tools/missed-call-calculator",
    name: "Missed Call Cost Calculator",
    blurb: "Estimate the monthly revenue missed calls cost your business — and what an AI receptionist recovers.",
  },
];

export default function ToolsHubPage(): ReactElement {
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <MarketplaceNav />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px 70px", width: "100%" }}>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em" }}>Free tools</h1>
        <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 640 }}>
          Free calculators for local service businesses and the agencies that serve them. No signup required.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginTop: 30 }}>
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="sf-link" style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 14, padding: "20px 22px", textDecoration: "none", color: MKT.ink, background: "rgba(255,255,255,0.55)", display: "block" }}>
              <div style={{ fontSize: 17, fontWeight: 800 }}>{t.name}</div>
              <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.62)" }}>{t.blurb}</p>
            </Link>
          ))}
        </div>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
