// packages/crm/src/app/(marketing)/pricing-public/page.tsx
//
// New marketing pricing page (2026-06-18).
// Standalone deep-dive on pricing — light warm theme, full
// 3-tier table + metered add-ons + agency calculator + FAQ.
// Unauthenticated visitors can reach this from the nav or
// "Learn more about pricing" links.
//
// Route: /pricing-public
// The in-product billing page at /pricing (with Stripe SetupIntent)
// is kept for authed users — that's a different surface entirely.

import type { Metadata } from "next";
import { MarketingNav } from "@/components/landing/marketing-nav";
import { LandingMarketingPricingSection } from "@/components/landing/marketing-pricing-section";
import { LandingMarketingFaqSection } from "@/components/landing/marketing-faq-section";
import { MarketingFinalCta } from "@/components/landing/marketing-final-cta";
import { MarketingFooter } from "@/components/landing/marketing-footer";

export const metadata: Metadata = {
  title: "Pricing — SeldonFrame",
  description:
    "Builder $19/mo · Workspace $49/mo · Agency $297/mo. Metered SMS, AI voice, and review add-ons. Start free. Roughly 5× under GoHighLevel.",
};

export default function PricingPublicPage() {
  return (
    <div className="min-h-screen bg-[#F6F2EA] text-[#221D17] selection:bg-[#00897B]/20 selection:text-[#00897B]">
      <MarketingNav />
      <main id="main-content" className="pt-[72px]">
        {/* Hero */}
        <section className="border-b border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-20 text-center md:px-8 md:py-28 lg:px-12">
          <div className="mx-auto max-w-[700px]">
            <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#00897B]">
              <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
              Pricing
              <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
            </div>
            <h1 className="mx-auto mt-3.5 max-w-[18ch] text-[clamp(34px,4.8vw,56px)] font-[500] leading-[1.04] tracking-[-0.025em] text-[#221D17]">
              Cheap to start.{" "}
              <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[#6E665A]">
                Scale as you grow.
              </em>
            </h1>
            <p className="mx-auto mt-4 max-w-[52ch] text-[16px] leading-[1.55] text-[#6E665A]">
              One flat fee per tier. Metered add-ons from your usage wallet.
              Agencies set their own markup and keep the spread.
              Roughly 5× under GoHighLevel.
            </p>
          </div>
        </section>

        <LandingMarketingPricingSection />
        <LandingMarketingFaqSection />
        <MarketingFinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
