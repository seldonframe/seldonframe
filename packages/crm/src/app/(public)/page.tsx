// Marketing landing page (server wrapper).
//
// 2026-05-22 — Ported the Claude Design HTML mockup
// (handoff `seldonframe-home.html`, 13 sections) to React + Tailwind
// section components. Replaces the prior Cut-C-onboarding-pivot
// composition (Hero / HowItWorks / Comparison / Soul / Bento /
// DemoVideo / Agencies / Marketplace / Pricing / FAQ / WhyNow / FinalCta)
// with the new HTML-faithful section list.
//
// Order matches the HTML mockup:
//   Nav (fixed) → Hero → ProofStrip → AgencyMath → OutreachMath
//   → BuildSteps → Modules → Replace → Soul → ComparisonTable
//   → Pricing (existing truth-pass component) → FAQ (existing truth-pass)
//   → FinalCta → Footer
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

import { MarketingNav } from "@/components/landing/marketing-nav";
import { MarketingHero } from "@/components/landing/marketing-hero";
import { MarketingProofStrip } from "@/components/landing/marketing-proof-strip";
import { MarketingAgencyMath } from "@/components/landing/marketing-agency-math";
import { MarketingOutreachMath } from "@/components/landing/marketing-outreach-math";
import { MarketingBuildSteps } from "@/components/landing/marketing-build-steps";
import { MarketingModules } from "@/components/landing/marketing-modules";
import { MarketingReplace } from "@/components/landing/marketing-replace";
import { MarketingSoul } from "@/components/landing/marketing-soul";
import { MarketingComparisonTable } from "@/components/landing/marketing-comparison-table";
import { LandingMarketingPricingSection } from "@/components/landing/marketing-pricing-section";
import { LandingMarketingFaqSection } from "@/components/landing/marketing-faq-section";
import { MarketingFinalCta } from "@/components/landing/marketing-final-cta";
import { MarketingFooter } from "@/components/landing/marketing-footer";

export const metadata: Metadata = {
  title: "SeldonFrame — Spin up a client workspace in 60 seconds.",
  description:
    "The OS your agency sells to local businesses. Paste a URL or business info — we ship the CRM, booking page, intake form, and AI chatbot in one pass. Live in 60 seconds.",
  openGraph: {
    title: "SeldonFrame — Spin up a client workspace in 60 seconds.",
    description:
      "The OS your agency sells to local businesses. Paste a URL or business info — we ship the CRM, booking page, intake form, and AI chatbot in one pass.",
    type: "website",
    url: "https://seldonframe.com",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame — Spin up a client workspace in 60 seconds.",
    description:
      "Paste a URL or business info — we ship the CRM, booking, intake, and AI chatbot in one pass.",
    images: ["/brand/twitter-card.png"],
  },
};

export default async function PublicHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100 selection:bg-[#14b8a6]/30 selection:text-[#14b8a6]">
      <MarketingNav />
      <main id="main-content">
        <MarketingHero />
        <MarketingProofStrip />
        <MarketingAgencyMath />
        <MarketingOutreachMath />
        <MarketingBuildSteps />
        <MarketingModules />
        <MarketingReplace />
        <MarketingSoul />
        <MarketingComparisonTable />
        <LandingMarketingPricingSection />
        <LandingMarketingFaqSection />
        <MarketingFinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
