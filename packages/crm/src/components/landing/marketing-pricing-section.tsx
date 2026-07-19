// packages/crm/src/components/landing/marketing-pricing-section.tsx
//
// Rewrite 2026-06-22 — flat $29/mo model (replaces the old 3-tier table).
// Warm light aesthetic: paper/card surfaces, SeldonFrame green accent.
//
// Agency repositioning 2026-07-16 (Max's call): with SF_TIER_LADDER on,
// the homepage pricing section now shows the THREE AGENCY TIERS side by
// side (Starter $99 / Growth $199 / Scale $299 — sub-account tiers from
// lib/billing/plans.ts; copy mirrors each tier's marketingFeatures).
// The 2% GMV line is gone from the flag-on render: agency plans pay 0%
// GMV, and the solo-tier 2% story lives on /pricing + the FAQ instead.
// The one-number $29 rule now applies only to the flag-OFF render.
//
// Flag OFF (SF_TIER_LADDER unset) renders the single $29 Builder card
// byte-compatible with the pre-ladder view — pinned by
// tests/unit/landing/marketing-pricing.spec.ts.
//
// Pricing truth (CLAUDE.md §1b, finalized 2026-07-10):
//   Builder $29 / Managed $49 / Agency $99·$199·$299 · no trial (the free
//   build→claim→use flow IS the trial) · GMV flat 2% solo-only when SF is
//   the sales channel; 0% on agency tiers · cancel anytime.
//
// The original dark-theme pricing component is preserved verbatim in
// marketing-pricing-section-dark.tsx (unused) for rollback reference.

import Link from "next/link";
import { Check } from "lucide-react";

// Everything that's included in the flat $29/mo (the whole platform).
// Flag-OFF card only. Agency-voiced 2026-07-15 — claims stay tier-true:
// $29 = Builder (unlimited workspaces YOU operate).
const INCLUDED: readonly string[] = [
  "A website on your client's domain, customized to their business — live and taking customers in minutes.",
  "A CRM and pipeline, so every lead lands in one place and your client always knows who to call next.",
  "A booking page tied to their real calendar, so customers book themselves while your client is on the job.",
  "A lead form wired straight to the CRM, so no inquiry ever slips through the cracks.",
  "A website chatbot built in, so the site answers questions and books work 24/7.",
  "Add any AI agent to take the busywork off their plate — just tell it what you want, no code.",
];

// The three sellable agency tiers (SF_TIER_LADDER on). Copy mirrors
// lib/billing/plans.ts marketingFeatures — every line is catalog-true.
// ("White-label ROI reports (coming soon)" is deliberately NOT shown on
// the homepage: no vapor promises outside /pricing.)
type AgencyTier = {
  id: "agency_starter" | "agency_growth" | "agency_scale";
  name: string;
  price: number;
  subAccounts: string;
  featuresHeader: string;
  features: readonly string[];
  /** Visually emphasized middle card (no "most popular" claim — we don't
   *  assert popularity we haven't measured). */
  emphasized?: boolean;
};

const AGENCY_TIERS: readonly AgencyTier[] = [
  {
    id: "agency_starter",
    name: "Agency Starter",
    price: 99,
    subAccounts: "10 client sub-accounts",
    featuresHeader: "Included",
    features: [
      "Full white-label — your brand, your domains",
      "Branded client portal logins",
      "Deploy agent templates to clients",
      "Per-sub-account usage meter & caps",
      "Unlimited workspaces for your own businesses",
      "The whole front office per client — website, CRM, booking, intake, AI receptionist",
    ],
  },
  {
    id: "agency_growth",
    name: "Agency Growth",
    price: 199,
    subAccounts: "30 client sub-accounts",
    featuresHeader: "Everything in Starter, plus:",
    features: [
      "One-click deploy to ALL clients",
      "Priority support with demo-call onboarding",
    ],
    emphasized: true,
  },
  {
    id: "agency_scale",
    name: "Agency Scale",
    price: 299,
    subAccounts: "Unlimited client sub-accounts",
    featuresHeader: "Everything in Growth, plus:",
    features: [
      "API + MCP access",
      "Rent your agents via the marketplace rail",
      "Set your own resale pricing",
      "Dedicated onboarding",
    ],
  },
];

export type LandingMarketingPricingSectionProps = {
  /** SF_TIER_LADDER (2026-07-08; repurposed 2026-07-16). Flag OFF
   *  (default) renders byte-identical to the single-$29-card view.
   *  Flag ON renders the three agency tiers side by side. */
  tierLadderOn?: boolean;
};

export function LandingMarketingPricingSection({
  tierLadderOn = false,
}: LandingMarketingPricingSectionProps = {}) {
  // Called as plain functions (not JSX) so the returned element tree is
  // fully expanded — the shape spec walks it without a renderer.
  if (!tierLadderOn) return SingleFlatCard();
  return AgencyTierGrid();
}

/* ════════════════════════════════════════════════════════════════════════
   Flag ON — the three agency tiers, side by side
   ════════════════════════════════════════════════════════════════════════ */

function AgencyTierGrid() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="border-t border-[var(--lp-border-soft)] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[var(--lp-accent)]">
            <span className="h-px w-4 bg-[var(--lp-accent)] opacity-50" aria-hidden />
            Pricing
            <span className="h-px w-4 bg-[var(--lp-accent)] opacity-50" aria-hidden />
          </div>
          <h2
            id="pricing-heading"
            className="mx-auto mt-3.5 max-w-[24ch] text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[var(--lp-ink)]"
          >
            One flat bill.{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[var(--lp-muted)]">
              No per-client tax.
            </em>
          </h2>
          <p className="mx-auto mt-4 max-w-[62ch] text-[16px] leading-[1.55] text-[var(--lp-muted)]">
            Every agency plan includes full white-label, branded client portals, unlimited
            workspaces of your own, and{" "}
            <strong className="font-[600] text-[var(--lp-ink)]">0% GMV</strong> — we don&apos;t
            tax your client work. Build it free, cancel anytime.
          </p>
          <p className="mx-auto mt-3 max-w-[62ch] text-[14px] leading-[1.55] text-[var(--lp-muted)]">
            What these tiers buy is the <strong className="font-[600] text-[var(--lp-ink)]">hand-off</strong>:
            a <strong className="font-[600] text-[var(--lp-ink)]">sub-account</strong> is your
            client&apos;s own login — their workspace, their portal, wearing your brand — while
            you keep the master view.
          </p>
        </div>

        {/* Three tier cards */}
        <div className="mx-auto mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {AGENCY_TIERS.map((tier) => (
            <article
              key={tier.id}
              data-plan={tier.id}
              aria-labelledby={`pricing-plan-${tier.id}`}
              className={`relative flex flex-col rounded-[20px] border bg-[var(--lp-card)] p-7 ${
                tier.emphasized
                  ? "border-[color-mix(in_oklab,var(--lp-accent)_55%,transparent)] shadow-[0_24px_60px_color-mix(in_oklab,var(--lp-ink)_14%,transparent)]"
                  : "border-[color-mix(in_oklab,var(--lp-accent)_25%,transparent)] shadow-[0_16px_40px_color-mix(in_oklab,var(--lp-ink)_8%,transparent)]"
              }`}
            >
              <span className="absolute -top-3 right-6 rounded-full border border-[color-mix(in_oklab,var(--lp-accent)_25%,transparent)] bg-[var(--lp-accent-soft)] px-3 py-1 text-[10.5px] font-[600] uppercase tracking-wider text-[var(--lp-accent)] ring-2 ring-[var(--lp-bg)]">
                Cancel anytime
              </span>

              <h3
                id={`pricing-plan-${tier.id}`}
                className="text-[16px] font-[600] text-[var(--lp-ink)]"
              >
                {tier.name}
              </h3>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-sans text-[clamp(34px,4vw,44px)] font-[600] leading-none tracking-[-0.03em] text-[var(--lp-ink)]">
                  {`$${tier.price}`}
                </span>
                <span className="text-[13.5px] text-[var(--lp-faint)]">/month flat</span>
              </div>
              <p className="mt-2 text-[13.5px] font-[500] text-[var(--lp-ink)]">
                {tier.subAccounts}
              </p>

              <Link
                href="/pricing"
                data-plan-cta={tier.id}
                className={`mt-5 inline-flex items-center justify-center gap-2.5 rounded-[11px] px-6 py-3 text-[14px] font-[500] transition-all hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)] ${
                  tier.emphasized
                    ? "bg-[var(--lp-cta-bg)] text-[var(--lp-cta-ink)] shadow-[0_1px_2px_color-mix(in_oklab,var(--lp-ink)_10%,transparent),0_6px_16px_color-mix(in_oklab,var(--lp-ink)_10%,transparent),inset_0_1.5px_0_rgba(255,255,255,.12)]"
                    : "border border-[color-mix(in_oklab,var(--lp-ink)_18%,transparent)] text-[var(--lp-ink)] hover:border-[color-mix(in_oklab,var(--lp-accent)_50%,transparent)]"
                }`}
              >
                Choose {tier.name.replace("Agency ", "")} →
              </Link>

              {/* Feature comparison — "everything in the previous tier, plus" */}
              <div className="mt-6 border-t border-[var(--lp-border-soft)] pt-5">
                <p className="text-[11px] font-[600] uppercase tracking-[0.08em] text-[var(--lp-faint)]">
                  {tier.featuresHeader}
                </p>
                <ul className="mt-3.5 flex flex-col gap-2.5">
                  {tier.features.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-[13.5px] leading-[1.45] text-[var(--lp-ink)]"
                    >
                      <Check
                        size={16}
                        className="mt-0.5 shrink-0 text-[var(--lp-accent)]"
                        aria-hidden
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>

        {/* The free-build on-ramp + the solo escape hatch. */}
        <div className="mx-auto mt-8 flex max-w-[720px] flex-col items-center gap-2.5 text-center">
          <Link
            href="/#hero-form"
            className="inline-flex items-center gap-2.5 rounded-[11px] bg-[var(--lp-cta-bg)] px-6 py-3.5 text-[14.5px] font-[500] text-[var(--lp-cta-ink)] shadow-[0_1px_2px_color-mix(in_oklab,var(--lp-ink)_10%,transparent),0_6px_16px_color-mix(in_oklab,var(--lp-ink)_10%,transparent),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
          >
            Build your first client workspace free →
          </Link>
          <p className="text-[13px] leading-[1.55] text-[var(--lp-muted)]">
            Running your own business instead of clients? Builder is $29/mo — the same
            unlimited workspaces, but everything lives under your own login: no client
            logins, no white-label. Managed is $49/mo on our keys.{" "}
            <Link
              href="/pricing"
              className="font-[600] text-[var(--lp-accent)] underline underline-offset-2"
            >
              Compare all plans →
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════
   Flag OFF — the single $29 flat card (byte-compatible with the
   pre-ladder view; pinned by marketing-pricing.spec.ts)
   ════════════════════════════════════════════════════════════════════════ */

function SingleFlatCard() {
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="border-t border-[var(--lp-border-soft)] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[var(--lp-accent)]">
            <span className="h-px w-4 bg-[var(--lp-accent)] opacity-50" aria-hidden />
            Pricing
            <span className="h-px w-4 bg-[var(--lp-accent)] opacity-50" aria-hidden />
          </div>
          <h2
            id="pricing-heading"
            className="mx-auto mt-3.5 max-w-[20ch] text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[var(--lp-ink)]"
          >
            One flat price.{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[var(--lp-muted)]">
              We only make money when you do.
            </em>
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[16px] leading-[1.55] text-[var(--lp-muted)]">
            No metered bills, no per-seat tax, no per-client surprise invoices. Build it
            free, cancel anytime.
          </p>
        </div>

        {/* Single centered flat-price card. */}
        <div className="mx-auto mt-12 max-w-[640px]">
          <article
            data-plan="flat"
            aria-labelledby="pricing-plan-name"
            className="relative flex flex-col rounded-[20px] border border-[color-mix(in_oklab,var(--lp-accent)_35%,transparent)] bg-[var(--lp-card)] p-7 shadow-[0_24px_60px_color-mix(in_oklab,var(--lp-ink)_12%,transparent)] md:p-8"
          >
            <span className="absolute -top-3 right-6 rounded-full border border-[color-mix(in_oklab,var(--lp-accent)_25%,transparent)] bg-[var(--lp-accent-soft)] px-3 py-1 text-[10.5px] font-[600] uppercase tracking-wider text-[var(--lp-accent)] ring-2 ring-[var(--lp-bg)]">
              Cancel anytime
            </span>

            <h3 id="pricing-plan-name" className="text-[17px] font-[600] text-[var(--lp-ink)]">
              SeldonFrame
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.5] text-[var(--lp-muted)]">
              Everything you need to build and run front offices for the clients you
              operate — in one place, on one flat bill.
            </p>

            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-sans text-[clamp(40px,5.5vw,54px)] font-[600] leading-none tracking-[-0.03em] text-[var(--lp-ink)]">
                $29
              </span>
              <span className="text-[14px] text-[var(--lp-faint)]">/month flat</span>
            </div>
            <p className="mt-2 text-[13px] leading-[1.5] text-[var(--lp-muted)]">
              Unlimited workspaces · cancel anytime
            </p>
            <p className="mt-1 text-[13px] font-[500] text-[var(--lp-ink)]">
              One client covers it. The rest is margin.
            </p>

            <Link
              href="/#hero-form"
              data-plan-cta="flat"
              className="mt-6 inline-flex items-center justify-center gap-2.5 rounded-[11px] bg-[var(--lp-cta-bg)] px-6 py-3.5 text-[14px] font-[500] text-[var(--lp-cta-ink)] shadow-[0_1px_2px_color-mix(in_oklab,var(--lp-ink)_10%,transparent),0_6px_16px_color-mix(in_oklab,var(--lp-ink)_10%,transparent),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--lp-accent)]"
            >
              Build it free →
            </Link>

            {/* Everything included */}
            <div className="mt-7 border-t border-[var(--lp-border-soft)] pt-6">
              <p className="text-[11px] font-[600] uppercase tracking-[0.08em] text-[var(--lp-faint)]">
                Everything included
              </p>
              <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13.5px] leading-[1.45] text-[var(--lp-ink)]">
                    <Check size={16} className="mt-0.5 shrink-0 text-[var(--lp-accent)]" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-5 rounded-[12px] border border-[color-mix(in_oklab,var(--lp-accent)_25%,transparent)] bg-[var(--lp-accent-soft)] px-4 py-3 text-[13.5px] leading-[1.5] text-[var(--lp-ink)]">
                Want a voice agent that answers a client&apos;s every call? A review agent that
                turns their happy customers into 5-star Google reviews? A speed-to-lead agent
                that texts back missed calls before they hire someone else? Add them in a click.
              </p>
              <p className="mt-4 text-[12.5px] leading-[1.5] text-[var(--lp-muted)]">
                Your agents run on your own AI key (and Twilio for calls/texts), billed by
                the provider at cost.
              </p>
            </div>
          </article>
        </div>

        {/* The GMV fee, demoted from a full panel to a quiet line + link. */}
        <p className="mx-auto mt-5 max-w-[640px] text-center text-[13px] leading-[1.55] text-[var(--lp-muted)]">
          + a flat <strong className="font-[600] text-[var(--lp-ink)]">2%</strong> only when Seldon is your
          sales channel — keep 98% of what we help you collect, 100% of everything else.{" "}
          <Link href="/pricing" className="font-[600] text-[var(--lp-accent)] underline underline-offset-2">
            How the 2% works →
          </Link>
        </p>
      </div>
    </section>
  );
}
