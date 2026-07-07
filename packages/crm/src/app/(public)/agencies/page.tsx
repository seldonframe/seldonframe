// packages/crm/src/app/(public)/agencies/page.tsx
//
// Standalone builders/agencies page (2026-07-06 Shopify-homepage redesign).
// The builder/agency reseller pitch (MarketingAgencyMath — margin calculator
// + "Build an agent once, sell it to thousands" section) was previously
// embedded on the homepage; it's moved here to keep the homepage to one
// promise / one CTA. Reuses MarketingNav + MarketingAgencyMath + MarketingFooter
// verbatim (no internal rewrite) following the sibling pattern in
// app/(marketing)/pricing-public/page.tsx.

import type { Metadata } from "next";
import { MarketingNav } from "@/components/landing/marketing-nav";
import { MarketingAgencyMath } from "@/components/landing/marketing-agency-math";
import { MarketingFooter } from "@/components/landing/marketing-footer";

export const metadata: Metadata = {
  title: "For builders & agencies — SeldonFrame",
  description:
    "Build an AI agent once, list it on the marketplace, or run unlimited client workspaces under your own brand — all for one flat $29/mo.",
};

export default function AgenciesPage() {
  return (
    <div className="min-h-screen bg-[#F6F2EA] text-[#221D17] selection:bg-[#00897B]/20 selection:text-[#00897B]">
      <MarketingNav />
      <main id="main-content" className="pt-[100px]">
        <MarketingAgencyMath />
      </main>
      <MarketingFooter />
    </div>
  );
}
