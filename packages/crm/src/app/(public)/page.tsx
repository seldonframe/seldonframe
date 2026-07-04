// Marketing landing page (server wrapper).
//
// 2026-05-22 — Ported the Claude Design HTML mockup
// (handoff `seldonframe-home.html`, 13 sections) to React + Tailwind
// section components. Replaces the prior Cut-C-onboarding-pivot
// composition (Hero / HowItWorks / Comparison / Soul / Bento /
// DemoVideo / Agencies / Marketplace / Pricing / FAQ / WhyNow / FinalCta)
// with the new HTML-faithful section list.
//
// Order (2026-06-22 positioning v2 — one idea per section ladder):
//   Nav (fixed) → Hero (+ demo marquee) → BuildSteps (the 60s demo)
//   → IdeStrip ("Every IDE" — 2026-07-01, links to /build#install)
//   → Modules (Run rung) → SmbCta (Sell rung) → Agents (Hire agents)
//   → AgencyMath (Build & sell rung) → Pricing → ProofStrip
//   → FAQ → FinalCta → Footer.
//   MarketingReplace ("Why not just…") is demoted off the homepage to
//   keep the ladder to one idea per rung (component still ships).
//
// Skipped from the HTML port:
//   - §9 Marketplace (hidden in source HTML with display:none — README
//     says to skip until marketplace ships)
//   - Nav "1.4k" stars chip (fake number, per task #82's truth-pass
//     principle; the live GitHub-API-backed badge in
//     `github-stars-badge.tsx` is available if we want to wire one in)
//
// The existing LandingMarketingPricingSection (3 tiers, FEATURES
// matrix) and LandingMarketingFaqSection (8 questions with FAQPage
// JSON-LD schema) are kept verbatim — they carry the truth-pass copy
// updated this morning and the JSON-LD invariant. The HTML's pricing
// (Growth / Scale / Agency Partner) and FAQ (8 questions) copy was
// less accurate than what already shipped, so we let truth win.
//
// Preserves the existing auth redirect: signed-in users go to the
// dashboard; unauthenticated visitors see the marketing surface.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isWebUngatedBuildOn } from "@/lib/web-build/policy";

import { MarketingNav } from "@/components/landing/marketing-nav";
import { MarketingHero } from "@/components/landing/marketing-hero";
import { MarketingProofStrip } from "@/components/landing/marketing-proof-strip";
import { MarketingAgencyMath } from "@/components/landing/marketing-agency-math";
import { MarketingBuildSteps } from "@/components/landing/marketing-build-steps";
import { MarketingIdeStrip } from "@/components/landing/marketing-ide-strip";
import { MarketingModules, MarketingAgents } from "@/components/landing/marketing-modules";
import { MarketingSmbCta } from "@/components/landing/marketing-smb-cta";
import { LandingMarketingPricingSection } from "@/components/landing/marketing-pricing-section";
import { LandingMarketingFaqSection } from "@/components/landing/marketing-faq-section";
import { MarketingFinalCta } from "@/components/landing/marketing-final-cta";
import { MarketingFooter } from "@/components/landing/marketing-footer";
// Positioning line is shared with the /home.md agent-Markdown twin (M3) so the
// promise can't drift between the human page and the Markdown.
import { POSITIONING_ONE_LINER } from "./home-copy";

export const metadata: Metadata = {
  title: "SeldonFrame — Your entire service business, live in 60 seconds.",
  description: POSITIONING_ONE_LINER,
  openGraph: {
    title: "SeldonFrame — Your entire service business, live in 60 seconds.",
    description: POSITIONING_ONE_LINER,
    type: "website",
    url: "https://seldonframe.com",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame — Your entire service business, live in 60 seconds.",
    description: POSITIONING_ONE_LINER,
    images: ["/brand/twitter-card.png"],
  },
};

export default async function PublicHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    // Light-theme marketing surface — warm paper / Hanken Grotesk /
    // Newsreader italic. Matches seldonstudio.com aesthetic with
    // SeldonFrame green (#00897B) instead of clay accent.
    <div className="min-h-screen bg-[#F6F2EA] text-[#221D17] selection:bg-[#00897B]/20 selection:text-[#00897B]">
      <MarketingNav />
      <main id="main-content">
        {/* Positioning v2 ladder (2026-06-22) — one idea per section:
            Hero + 60s demo → Run → Sell → Hire agents → Build & sell →
            pricing / proof / FAQ / close. The "Why not just…" comparison
            (MarketingReplace) is demoted off the homepage to keep the
            ladder to one idea per rung; the component still ships. */}
        <MarketingHero
          ungatedBuildEnabled={isWebUngatedBuildOn({
            SF_WEB_UNGATED_BUILD: process.env.SF_WEB_UNGATED_BUILD,
          })}
        />
        <MarketingBuildSteps />
        <MarketingIdeStrip />
        <MarketingModules />
        <MarketingSmbCta />
        <MarketingAgents />
        <MarketingAgencyMath />
        <LandingMarketingPricingSection />
        <MarketingProofStrip />
        <LandingMarketingFaqSection />
        <MarketingFinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
