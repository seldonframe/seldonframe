// /tools — the free-tools hub (PostPlanify motion: high-intent utility pages
// that rank and convert). Add new tools here + sitemap + llms.txt.
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
  {
    href: "/tools/ai-receptionist-cost-calculator",
    name: "AI Receptionist Cost Calculator",
    blurb: "Compare what a human receptionist, an answering service and per-minute AI really cost per month.",
  },
  {
    href: "/tools/google-review-link-generator",
    name: "Google Review Link Generator",
    blurb: "Turn your Google Place ID into a direct review link and a printable QR code — free, no signup.",
  },
  {
    href: "/tools/review-response-generator",
    name: "Review Response Generator",
    blurb: "Well-written replies to any Google review — pick the rating, scenario and tone, then copy.",
  },
  {
    href: "/tools/a2p-10dlc-checker",
    name: "A2P 10DLC Compliance Checker",
    blurb: "Nine questions to find out whether your business texting is registered right — before carriers filter it.",
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
