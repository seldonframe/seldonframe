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
import Link from "next/link";
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

        {/* Guides for agency builders — cross-links into the supply-side content library. */}
        <section aria-label="Guides for agency builders" className="border-t border-[rgba(34,29,23,.08)] px-5 py-16 md:px-8 lg:px-12">
          <div className="mx-auto max-w-[1120px]">
            <h2 className="text-[13px] font-[600] uppercase tracking-[0.09em] text-[rgba(34,29,23,.55)]">
              Guides for agency builders
            </h2>
            <ul className="mt-4 flex flex-col flex-wrap gap-x-8 gap-y-2.5 md:flex-row">
              <li>
                <Link href="/sell" className="text-[14.5px] font-[600] text-[#00897B] underline-offset-4 hover:underline">
                  Sell AI agents: the complete playbook
                </Link>
              </li>
              <li>
                <Link href="/guides/ai-agency-pricing-models" className="text-[14.5px] font-[600] text-[#00897B] underline-offset-4 hover:underline">
                  AI agency pricing models
                </Link>
              </li>
              <li>
                <Link href="/guides/white-label-ai-agents" className="text-[14.5px] font-[600] text-[#00897B] underline-offset-4 hover:underline">
                  White-label AI agents
                </Link>
              </li>
              <li>
                <Link href="/guides/what-to-include-in-an-ai-front-office-package" className="text-[14.5px] font-[600] text-[#00897B] underline-offset-4 hover:underline">
                  What goes in an AI front-office package
                </Link>
              </li>
            </ul>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
