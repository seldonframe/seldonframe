// /alternatives — the comparison hub: links every /alternative-to-<slug> page
// so crawlers (and buyers) discover the full set from one indexable URL.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { COMPETITORS, LAST_UPDATED } from "@/lib/seo/alternative-pages";

export const metadata: Metadata = {
  title: "SeldonFrame vs the alternatives — honest comparisons for agencies & builders",
  description:
    "How SeldonFrame compares to GoHighLevel, Vapi, Retell, Synthflow, Chatbase, Podium and more: AI receptionist, website, CRM and booking at $29/mo flat.",
  alternates: { canonical: "/alternatives" },
};

export default function AlternativesHubPage(): ReactElement {
  return (
    <div
      className="sf-mkt"
      style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}
    >
      <MarketplaceStyles />
      <MarketplaceNav />
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "40px 32px 70px", width: "100%" }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
          Compare · updated {LAST_UPDATED}
        </div>
        <h1 style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, maxWidth: 720 }}>
          How SeldonFrame compares
        </h1>
        <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          Honest, row-by-row comparisons against the platforms agencies and builders evaluate most — pricing, the AI
          receptionist, and the business system behind it. Where a competitor is the better fit, we say so.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14, marginTop: 32 }}>
          {COMPETITORS.map((c) => (
            <Link
              key={c.slug}
              href={`/alternative-to-${c.slug}`}
              className="sf-link"
              style={{
                border: `1px solid ${MKT.ink10}`,
                borderRadius: 14,
                padding: "18px 20px",
                textDecoration: "none",
                color: MKT.ink,
                background: "rgba(255,255,255,0.55)",
                display: "block",
              }}
            >
              <div style={{ fontSize: 11.5, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: MKT.green }}>
                {c.category}
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, marginTop: 6 }}>Alternative to {c.name}</div>
              <p style={{ margin: "8px 0 0", fontSize: 13.5, lineHeight: 1.55, color: "rgba(34,29,23,0.62)" }}>{c.oneLiner}</p>
            </Link>
          ))}
        </div>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
