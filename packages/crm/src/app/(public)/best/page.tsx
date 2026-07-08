// /best — the "best of" hub: links every /best/<category>-for-<audience>
// page, grouped by category, so crawlers (and buyers) discover the full set
// from one indexable URL. Mirrors the /alternatives and /tools hub pattern.
import type { Metadata } from "next";
import type { ReactElement } from "react";
import Link from "next/link";
import { MarketplaceNav, MarketplaceFooter } from "@/components/marketplace/marketplace-chrome";
import { MarketplaceStyles } from "@/components/marketplace/marketplace-styles";
import { MKT } from "@/components/marketplace/marketplace-data";
import { BEST_CATEGORIES, BEST_PAGES, LAST_UPDATED, bestSlug, getBestAudience } from "@/lib/seo/best-pages";

export const metadata: Metadata = {
  title: "Best tools for local service businesses, ranked honestly — SeldonFrame",
  description:
    "Honest, ranked best-of lists for the CRMs, website builders, booking systems and AI receptionists local service businesses actually consider — pricing, strengths and the real catch for each.",
  alternates: { canonical: "/best" },
};

export default function BestHubPage(): ReactElement {
  return (
    <div className="sf-mkt" style={{ minHeight: "100vh", background: MKT.paper, color: MKT.ink, fontFamily: MKT.fontSans, overflowX: "hidden" }}>
      <MarketplaceStyles />
      <MarketplaceNav />
      <main style={{ maxWidth: 920, margin: "0 auto", padding: "40px 32px 70px", width: "100%" }}>
        <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: MKT.green, marginBottom: 12 }}>
          {`Best of · updated ${LAST_UPDATED}`}
        </div>
        <h1 style={{ margin: 0, fontSize: 40, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.08, maxWidth: 720 }}>
          Best tools for local service businesses, ranked honestly
        </h1>
        <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: 1.55, color: "rgba(34,29,23,0.7)", maxWidth: 660 }}>
          We build one of these platforms, so we rank ourselves first — but every list here gives every contender a genuine
          strength list and a real, honest catch. Pick the list for your trade below.
        </p>

        {BEST_CATEGORIES.map((category) => {
          const pages = BEST_PAGES.filter((p) => p.category === category.slug);
          if (pages.length === 0) return null;
          return (
            <section key={category.slug} style={{ marginTop: 40 }}>
              <h2 style={{ margin: "0 0 6px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>
                {`Best ${category.nounPlural}`}
              </h2>
              <p style={{ margin: "0 0 16px", fontSize: 14.5, lineHeight: 1.55, color: "rgba(34,29,23,0.6)", maxWidth: 620 }}>
                {category.intentLine.charAt(0).toUpperCase() + category.intentLine.slice(1)}.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {pages.map((p) => {
                  const audience = getBestAudience(p.audience);
                  return (
                    <Link
                      key={bestSlug(p)}
                      href={`/best/${bestSlug(p)}`}
                      className="sf-link"
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "rgba(34,29,23,0.7)",
                        border: `1px solid ${MKT.ink10}`,
                        borderRadius: 999,
                        padding: "7px 14px",
                        textDecoration: "none",
                        background: "rgba(255,255,255,0.5)",
                      }}
                    >
                      {`for ${audience.label}`}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}

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
          <Link href="/ai-agents" className="sf-link" style={{ color: MKT.green, fontWeight: 700 }}>
            AI agent library
          </Link>
          .
        </p>
      </main>
      <MarketplaceFooter />
    </div>
  );
}
