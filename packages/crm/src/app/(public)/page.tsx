// Marketing landing page (server wrapper).
//
// Cut C pivot: composes the named Landing* section components
// (hero, soul, seldon-it, bento, agencies, marketplace, why-now,
// final-cta, footer) so the marketing site funnels signed-out
// agency visitors into /signup (Cut A's Google OAuth + email
// signup). Earlier Workstream-2 surface (landing-client.tsx) shipped
// without a Sign Up CTA, which made the entire web-onboarding flow
// (Cuts A + B) invisible to prospective users.
//
// Preserves the existing auth redirect: signed-in users go to the
// dashboard; unauthenticated visitors see the marketing surface.
//
// Order of <main> children is curated for funnel flow:
//   hero → how-it-works → soul → seldon-it → bento
//   → demo → agencies → marketplace → why-now → final-cta

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

import { LandingNav } from "@/components/landing/nav";
import { LandingHero } from "@/components/landing/hero";
import { LandingHowItWorksSection } from "@/components/landing/how-it-works-section";
import { LandingSoulSection } from "@/components/landing/soul-section";
import { LandingSeldonItSection } from "@/components/landing/seldon-it-section";
import { LandingBentoSection } from "@/components/landing/bento-section";
import { LandingDemoVideoSection } from "@/components/landing/demo-video-section";
import { LandingAgenciesSection } from "@/components/landing/agencies-section";
import { LandingMarketplaceSection } from "@/components/landing/marketplace-section";
import { LandingMarketingPricingSection } from "@/components/landing/marketing-pricing-section";
import { LandingOpenSourceSection } from "@/components/landing/open-source-section";
import { LandingMarketingFaqSection } from "@/components/landing/marketing-faq-section";
import { LandingWhyNowSection } from "@/components/landing/why-now-section";
import { LandingFinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "SeldonFrame — Open-source alternative to GoHighLevel",
  description:
    "Pre-wired client ops stack agencies deploy per client in minutes. CRM, booking, intake, and AI chatbot — already connected, no Zapier required. Free tier, AGPL-3.0, MCP-native via Claude Code.",
  openGraph: {
    title: "SeldonFrame — Open-source alternative to GoHighLevel",
    description:
      "Pre-wired client ops stack agencies deploy per client in minutes. CRM, booking, intake, AI chatbot — already connected. Open source. Free tier · Growth $29/mo · Scale $99/mo.",
    type: "website",
    url: "https://seldonframe.com",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeldonFrame — Open-source alternative to GoHighLevel",
    description:
      "Pre-wired client ops stack agencies deploy per client in minutes. CRM, booking, intake, AI chatbot — already connected.",
    images: ["/brand/twitter-card.png"],
  },
};

export default async function PublicHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[#09090b] text-zinc-100">
      <LandingNav />
      <main id="main-content">
        <LandingHero />
        <LandingHowItWorksSection />
        <LandingSoulSection />
        <LandingSeldonItSection />
        <LandingBentoSection />
        <LandingDemoVideoSection />
        <LandingAgenciesSection />
        <LandingMarketplaceSection />
        <LandingMarketingPricingSection />
        <LandingOpenSourceSection />
        <LandingMarketingFaqSection />
        <LandingWhyNowSection />
        <LandingFinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
