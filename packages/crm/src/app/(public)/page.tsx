import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LandingAgenciesSection } from "@/components/landing/agencies-section";
import { LandingBlocksSection } from "@/components/landing/blocks-section";
import { LandingComparisonSection } from "@/components/landing/comparison-section";
import { LandingFinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/footer";
import { LandingHero } from "@/components/landing/hero";
import { LandingMarketplaceSection } from "@/components/landing/marketplace-section";
import { LandingNav } from "@/components/landing/nav";
import { LandingSeldonItSection } from "@/components/landing/seldon-it-section";
import { LandingSocialProof } from "@/components/landing/social-proof";
import { LandingSoulSection } from "@/components/landing/soul-section";
import { LandingWhyNowSection } from "@/components/landing/why-now-section";

export const metadata: Metadata = {
  title: "SeldonFrame — The Operating System for Your Business",
  description:
    "SeldonFrame is a business identity operating system. One brain. Every block. If it doesn't exist — Seldon it into existence. Free and open source.",
  openGraph: {
    title: "SeldonFrame",
    description: "The operating system for your business. One brain. Every block.",
    type: "website",
    url: "https://app.seldonframe.com",
  },
};

export default async function PublicHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-zinc-950 font-sans selection:bg-teal-500/30 selection:text-teal-200">
      <LandingNav />

      <main>
        <LandingHero />
        <LandingSocialProof />
        <LandingSoulSection />
        <LandingSeldonItSection />
        <LandingBlocksSection />
        <LandingComparisonSection />
        <LandingAgenciesSection />
        <LandingMarketplaceSection />
        <LandingWhyNowSection />
        <LandingFinalCta />
      </main>

      <LandingFooter />
    </div>
  );
}
