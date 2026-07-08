// packages/crm/src/app/pricing/page.tsx
//
// 2026-05-17 — Thin Server Component shell. Reads the auth session and
// branches between two ENTIRELY SEPARATE renderings:
//
//   SF_TIER_LADDER OFF (default) — the legacy dark dashboard-chrome
//     single-card view: <PricingShell> (2-column layout, sticky CTA)
//     + the shared Accordion FAQ. BYTE-IDENTICAL to the pre-branding-fix
//     output (tests pin this).
//
//   SF_TIER_LADDER ON — 2026-07-08 marketing-branding fix wave. Max's
//     feedback: the flag-ON view didn't match seldonframe.com's light
//     cream/paper marketing branding, the CTA hierarchy was unclear, and
//     the sticky bottom bar overlapped a card button. Renders
//     <MarketingNav> (reused verbatim from the homepage — self-contained,
//     no props) + <PricingShellMarketing> (light-themed audience toggle +
//     tier cards, see that file's header for the full design) + a
//     restyled-light FAQ (details/summary pattern, matching
//     marketing-faq-section.tsx's visual language) + <MarketingFooter>
//     (also reused verbatim). NO sticky bar in this path.
//
// 2026-07-04 /pricing truth pass (Task 11): the platform sells exactly
// ONE plan — $29/mo flat, unlimited workspaces, cancel anytime. The
// old Builder $19 / Workspace $49 / Agency $297 ladder in pricing-shell
// is gone. There is no free tier, so the page still doesn't provision a
// Stripe SetupIntent for a "save a card on Free" form — checkout flows
// through Stripe-hosted Checkout from the shell.
//
// 2026-07-04 Task 11b: the FAQS array below has been rewritten to match
// the single-plan reality (it used to describe the old Builder/Workspace/
// Agency ladder). Every FAQ claim here is a strict subset of what
// pricing-shell.tsx's card + sticky bar already state, or is backed by
// /api/stripe/checkout or the Settings → Billing "Manage subscription"
// button (Stripe's standard billing portal).
//
// 2026-07-05 — trial removed (founder decision): the free ungated
// build→claim→use experience already IS the trial, so checkout charges
// immediately. No money-back guarantee; "cancel anytime" is the only
// safety line (a standard Stripe subscription, cancelable from the
// billing portal).

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { auth } from "@/auth";
import { PLANS } from "@/lib/billing/plans";
import { isPlaceholderPriceId } from "@/lib/billing/price-ids";
import { PricingShell } from "./pricing-shell";
import { PricingShellMarketing, type LadderTier } from "./pricing-shell-marketing";
import { MarketingNav } from "@/components/landing/marketing-nav";
import { MarketingFooter } from "@/components/landing/marketing-footer";

// 2026-07-08 hydration-mismatch fix — "No price id lives in the client"
// (the rule the legacy single card in pricing-shell.tsx already followed).
// STRIPE_*_PRICE_ID env vars are SERVER-ONLY: readEnv() in price-ids.ts
// resolves them from process.env, which is undefined in the browser
// bundle. PricingShellMarketing was a "use client" component computing
// `isPlaceholderPriceId(tier.stripePriceId)` itself — every tier hydrated
// as a placeholder client-side (env unset in the browser) even when the
// SSR pass (env present, server-side) had resolved a real price, causing
// a hydration mismatch where the client's "Book a demo" primary CTA always
// won. Fix: resolve `available` (the ONLY thing the client needs to know)
// server-side here, and pass serializable, price-id-free tier props down.
function buildLadderTiers(): LadderTier[] {
  // p.sellable === true is exactly the 5 ladder tiers (builder / managed /
  // agency_starter / agency_growth / agency_scale) — the two grandfathered
  // legacy ids ("workspace" / "agency") are sellable:false and never reach
  // this filter. TS can't narrow TierId -> LadderTierId through a runtime
  // .filter predicate, so the cast documents that invariant explicitly
  // rather than widening LadderTierId to accept ids this ladder never
  // actually renders.
  return PLANS.filter((p) => p.sellable).map((p) => ({
    id: p.id as LadderTier["id"],
    name: p.name,
    price: p.price,
    tagline: p.tagline,
    maxSubAccounts: p.limits.maxSubAccounts,
    fullWhiteLabel: p.limits.fullWhiteLabel,
    available: !isPlaceholderPriceId(p.stripePriceId),
    // 2026-07-08 — PostPlanify-style rich feature checklist (per-tier
    // marketingFeatures, single source in plans.ts). Passed through
    // verbatim — this Server Component never edits the copy.
    marketingFeatures: p.marketingFeatures,
  }));
}

/** SF_TIER_LADDER (2026-07-08) — same strict-"1" contract as the other
 *  dark-by-default flags in lib/web-build/policy.ts (isWinLadderOn,
 *  isSimpleHomeOn). Read server-side here rather than adding a new
 *  export to policy.ts (kept out of this task's touched-files list). */
function isTierLadderOn(env: { SF_TIER_LADDER?: string | undefined }): boolean {
  return env.SF_TIER_LADDER?.trim() === "1";
}

const FAQS: Array<{ q: string; a: string }> = [
  {
    q: "How many client workspaces can I run?",
    a: "As many of your own as you want, on the flat $29/mo Builder plan — no per-workspace charge. Running CLIENT sub-accounts under your own brand is the agency ladder, starting at $99/mo (Agency Starter includes 10 sub-accounts).",
  },
  {
    q: "Can I white-label SeldonFrame for my clients?",
    a: "Yes — whitelabel and resell to clients is included on every agency plan (Agency Starter $99/mo and up). The flat $29/mo Builder plan is for your own workspaces, not whitelabel resale.",
  },
  {
    q: "Is there a free trial?",
    a: "You're charged $29/mo flat when you connect through Stripe from this page — there's no separate trial period. You can cancel anytime from Settings → Billing and you won't be billed again.",
  },
  {
    q: "What about self-hosting?",
    a: "Fully supported. The full source is AGPL-licensed on GitHub — self-host and own + export everything with no per-workspace charge.",
  },
];

type PricingPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PricingPage({ searchParams }: PricingPageProps) {
  const session = await auth();
  if (searchParams) await searchParams; // keep Next.js happy if callers pass params

  const isAuthed = Boolean(session?.user);
  const tierLadderOn = isTierLadderOn({ SF_TIER_LADDER: process.env.SF_TIER_LADDER });

  if (tierLadderOn) {
    return (
      <div data-pricing-page="marketing" className="min-h-screen bg-[#F6F2EA] text-[#221D17]">
        <MarketingNav />
        {/* pt-[100px] clears MarketingNav's fixed header — same offset
            the homepage hero uses (marketing-hero.tsx). */}
        <main id="main-content" className="pt-[100px]">
          <PricingShellMarketing isAuthed={isAuthed} tiers={buildLadderTiers()} />

          {/* FAQ — restyled light (details/summary pattern, matches
              marketing-faq-section.tsx's visual language) instead of the
              dark Accordion kit used in the flag-off path. Same FAQS
              content (the ladder-aware copy) as the legacy page. */}
          <section
            id="pricing-faq"
            aria-labelledby="pricing-faq-heading"
            className="border-t border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-16 md:px-8 md:py-20 lg:px-12"
          >
            <div className="mx-auto max-w-[760px]">
              <div className="text-center">
                <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#00897B]">
                  <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
                  FAQ
                  <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
                </div>
                <h2
                  id="pricing-faq-heading"
                  className="mt-3.5 text-[clamp(24px,3.6vw,34px)] font-[500] leading-[1.1] tracking-[-0.02em] text-[#221D17]"
                >
                  Frequently asked
                </h2>
              </div>

              <div className="mt-8 border-t border-[rgba(34,29,23,.10)]">
                {FAQS.map((faq) => (
                  <details key={faq.q} className="group border-b border-[rgba(34,29,23,.10)]">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-[16px] font-[500] leading-tight tracking-[-0.01em] text-[#221D17] [&::-webkit-details-marker]:hidden">
                      <span>{faq.q}</span>
                      <span
                        aria-hidden
                        className="relative flex size-[20px] shrink-0 transition-transform duration-[300ms] group-open:rotate-[135deg]"
                      >
                        <span className="absolute left-1/2 top-[3px] bottom-[3px] w-[2px] -translate-x-1/2 rounded-sm bg-[#00897B]" />
                        <span className="absolute top-1/2 left-[3px] right-[3px] h-[2px] -translate-y-1/2 rounded-sm bg-[#00897B]" />
                      </span>
                    </summary>
                    <p className="pb-6 pr-10 text-[14.5px] leading-[1.6] text-[#6E665A] max-w-[64ch]">
                      {faq.a}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        </main>
        <MarketingFooter />
      </div>
    );
  }

  return (
    <main className="crm-page">
      {/* pb-28 reserves room for the sticky CTA so the last FAQ row
          never hides behind it. */}
      <section className="mx-auto max-w-6xl px-4 pb-28 pt-10 sm:px-6 sm:pt-14">
        <PricingShell isAuthed={isAuthed} />

        <div className="mt-16">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Frequently asked
          </p>
          <Accordion className="mt-3" defaultValue={[FAQS[0].q]}>
            {FAQS.map((faq) => (
              <AccordionItem key={faq.q} value={faq.q}>
                <AccordionTrigger>{faq.q}</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground">{faq.a}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </main>
  );
}
