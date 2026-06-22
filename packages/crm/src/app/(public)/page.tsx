// Marketing landing page (server wrapper).
//
// 2026-05-22 — Ported the Claude Design HTML mockup
// (handoff `seldonframe-home.html`, 13 sections) to React + Tailwind
// section components. Replaces the prior Cut-C-onboarding-pivot
// composition (Hero / HowItWorks / Comparison / Soul / Bento /
// DemoVideo / Agencies / Marketplace / Pricing / FAQ / WhyNow / FinalCta)
// with the new HTML-faithful section list.
//
// Order (2026-06-18 SMB-first conversion pass — pricing pulled up to sit
// right after the SMB CTA; agency block follows pricing):
//   Nav (fixed) → Hero (+ demo marquee) → ProofStrip (fear-alleviation)
//   → BuildSteps → Modules → SmbCta (rotating industry word)
//   → Pricing (existing truth-pass component) → AgencyMath → Replace
//   → FinalCta → FAQ (existing truth-pass) → Footer
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
import { MarketingBuildSteps } from "@/components/landing/marketing-build-steps";
import { MarketingModules } from "@/components/landing/marketing-modules";
import { MarketingSmbCta } from "@/components/landing/marketing-smb-cta";
import { MarketingReplace } from "@/components/landing/marketing-replace";
import { LandingMarketingPricingSection } from "@/components/landing/marketing-pricing-section";
import { LandingMarketingFaqSection } from "@/components/landing/marketing-faq-section";
import { MarketingFinalCta } from "@/components/landing/marketing-final-cta";
import { MarketingFooter } from "@/components/landing/marketing-footer";

export const metadata: Metadata = {
  title: "SeldonFrame — Build, run & sell AI agents + a complete front office.",
  description:
    "Website, booking, intake, CRM, and a 24/7 AI agent across voice, chat, SMS & email — live in 60 seconds. First workspace free, then $29/mo flat. Build any agent and sell it to your clients.",
  openGraph: {
    title: "SeldonFrame — Build, run & sell AI agents + a complete front office.",
    description:
      "A complete AI front office (voice, chat, SMS, email) live in 60 seconds. First workspace free, then $29/mo flat. Build any agent and resell it to your clients.",
    type: "website",
    url: "https://seldonframe.com",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame — Build, run & sell AI agents + a complete front office.",
    description:
      "A complete AI front office (voice, chat, SMS, email) live in 60 seconds. First workspace free, then $29/mo flat. Build any agent and resell it.",
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
        <MarketingHero />
        <MarketingProofStrip />
        <MarketingBuildSteps />
        <MarketingModules />
        <MarketingSmbCta />
        <LandingMarketingPricingSection />
        <MarketingAgencyMath />
        <MarketingReplace />
        <MarketingFinalCta />
        <LandingMarketingFaqSection />
      </main>
      <MarketingFooter />
    </div>
  );
}
