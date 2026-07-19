// /guides — the article hub, grouped by cluster (each cluster maps to a free
// tool pillar). Add new guides via the registry; this page derives from it.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { populatedClusters } from "@/lib/seo/guides";

export const metadata: Metadata = {
  title: "Guides for local service businesses — SeldonFrame",
  description: "Practical, honestly-sourced guides on lead response, no-shows, AI receptionists, online booking and getting your business found by AI — each paired with a free tool.",
  alternates: { canonical: "/guides" },
};

export default function GuidesHubPage(): ReactElement {
  const clusters = populatedClusters();
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <MarketplaceNav />
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px 70px", width: "100%" }}>
        <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: "-0.03em" }}>Guides</h1>
        <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 640 }}>
          Practical guides for local service businesses and the agencies that serve them — honestly sourced, and each paired with a free tool you can use right now.
        </p>
        {clusters.map((c) => (
          <section key={c.cluster} style={{ marginTop: 34 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 21, fontWeight: 800, letterSpacing: "-0.02em" }}>{c.label}</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
              {c.guides.map((g) => (
                <Link key={g.slug} href={`/guides/${g.slug}`} className="sf-link" style={{ border: `1px solid ${MKT.ink10}`, borderRadius: 14, padding: "18px 20px", textDecoration: "none", color: MKT.ink, background: "rgba(255,255,255,0.55)", display: "block" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.3 }}>{g.title}</div>
                  <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.62)" }}>{g.description}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
      <MarketplaceFooter />
    </div>
  );
}
