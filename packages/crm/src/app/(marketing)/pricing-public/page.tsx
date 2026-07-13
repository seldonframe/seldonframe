// packages/crm/src/app/(marketing)/pricing-public/page.tsx
//
// New marketing pricing page (2026-06-18; flat-model rewrite 2026-06-22).
// Standalone deep-dive on pricing — light warm theme, the flat $29/mo
// model + GMV explainer + FAQ. Unauthenticated visitors can reach this
// from the nav or "Learn more about pricing" links.
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

/** SF_TIER_LADDER (2026-07-08) — same strict-"1" contract as the other
 *  dark-by-default flags. Duplicated locally (also in
 *  app/pricing/page.tsx + app/(public)/page.tsx) rather than added to
 *  lib/web-build/policy.ts, which is outside this task's touched-files
 *  list. */
function isTierLadderOn(env: { SF_TIER_LADDER?: string | undefined }): boolean {
  return env.SF_TIER_LADDER?.trim() === "1";
}

export const metadata: Metadata = {
  title: "Pricing — SeldonFrame",
  description:
    "$29/mo flat · unlimited workspaces · cancel anytime. No metered bills — plus a flat 2% fee only when SeldonFrame is your sales channel.",
};

export default function PricingPublicPage() {
  const tierLadderOn = isTierLadderOn({ SF_TIER_LADDER: process.env.SF_TIER_LADDER });
  return (
    <div className="min-h-screen bg-[#F6F2EA] text-[#221D17] selection:bg-[#1F2B24]/20 selection:text-[#1F2B24]">
      <MarketingNav />
      <main id="main-content" className="pt-[72px]">
        {/* Hero */}
        <section className="border-b border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-20 text-center md:px-8 md:py-28 lg:px-12">
          <div className="mx-auto max-w-[700px]">
            <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#1F2B24]">
              <span className="h-px w-4 bg-[#1F2B24] opacity-50" aria-hidden />
              Pricing
              <span className="h-px w-4 bg-[#1F2B24] opacity-50" aria-hidden />
            </div>
            <h1 className="mx-auto mt-3.5 max-w-[20ch] text-[clamp(34px,4.8vw,56px)] font-[500] leading-[1.04] tracking-[-0.025em] text-[#221D17]">
              $29 a month.{" "}
              <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[#6E665A]">
                We only make money when you do.
              </em>
            </h1>
            <p className="mx-auto mt-4 max-w-[54ch] text-[16px] leading-[1.55] text-[#6E665A]">
              One flat monthly price — unlimited workspaces, no metered bills, no surprise fees.
              Build it free, and cancel anytime. We add a flat 2% fee only when SeldonFrame is your
              sales channel — so we only make money when you do.
            </p>
          </div>
        </section>

        <LandingMarketingPricingSection tierLadderOn={tierLadderOn} />
        <LandingMarketingFaqSection />
        <MarketingFinalCta />
      </main>
      <MarketingFooter />
    </div>
  );
}
