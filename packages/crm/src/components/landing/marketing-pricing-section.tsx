// packages/crm/src/components/landing/marketing-pricing-section.tsx
//
// Rewrite 2026-06-22 — flat $29/mo model (replaces the old 3-tier table).
// Warm light aesthetic: paper/card surfaces, SeldonFrame green accent.
//
// The model (finalized 2026-06-21; copy corrected 2026-06-22; trial removed
// 2026-07-05 — the free ungated build→claim→use experience already IS the
// trial, so checkout charges immediately, cancel anytime):
//   $29/mo flat · unlimited workspaces · cancel anytime.
//   Everything included — website, booking, CRM, intake, web chat, AND the
//   voice + SMS + email AI agents (the voice receptionist is included, not a
//   paid add-on).
//   + a flat 2% GMV fee — billed ONLY when SeldonFrame is your sales channel
//   (marketplace, booking, proposals).
//   "We only make money when you do."
//   Flat because it's BYOK + BYO-Twilio under the hood: you pay the AI +
//   telephony providers directly at cost, we don't mark up your usage.
//
// The original dark-theme pricing component is preserved verbatim in
// marketing-pricing-section-dark.tsx (unused) for rollback reference.

import Link from "next/link";
import { Check } from "lucide-react";

// Everything that's included in the flat $29/mo (the whole platform).
const INCLUDED: readonly string[] = [
  "A website on your own domain, customized to your business — live and taking customers in minutes.",
  "A CRM and pipeline, so every lead lands in one place and you always know who to call next.",
  "A booking page tied to your real calendar, so customers book themselves while you're on the job.",
  "A lead form wired straight to your CRM, so no inquiry ever slips through the cracks.",
  "A website chatbot built in, so your site answers questions and books work for you 24/7.",
  "Add any AI agent to take the busywork off your plate — just tell it what you want, no code.",
];

export type LandingMarketingPricingSectionProps = {
  /** SF_TIER_LADDER (2026-07-08). Flag OFF (default) renders byte-
   *  identical to the single-$29-card view. Flag ON adds ONE quiet
   *  line under the card pointing agency operators at the ladder on
   *  /pricing — the homepage keeps its one-number rule; the card
   *  itself never changes. */
  tierLadderOn?: boolean;
};

export function LandingMarketingPricingSection({
  tierLadderOn = false,
}: LandingMarketingPricingSectionProps = {}) {
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
            No metered bills, no per-seat tax, no surprise invoices. Build it free, cancel
            anytime.
          </p>
        </div>

        {/* The two-up layout: the flat plan card + the GMV explainer. */}
        <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-[1.15fr_.85fr]">
          {/* ── Primary flat-price card ─────────────────────────────────── */}
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
              Everything you need to get customers and get paid — in one place, on one flat
              bill.
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
              One booked job pays for the year.
            </p>

            <Link
              href="/signup"
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
                Want a voice agent that answers every call? A review agent that turns happy
                customers into 5-star Google reviews? A speed-to-lead agent that texts back
                missed calls before they hire someone else? Add them in a click.
              </p>
              <p className="mt-4 text-[12.5px] leading-[1.5] text-[var(--lp-muted)]">
                Your agents run on your own AI key (and Twilio for calls/texts), billed by
                the provider at cost.
              </p>
              {tierLadderOn ? (
                <p className="mt-4 text-[12.5px] leading-[1.5] text-[var(--lp-muted)]">
                  Running client sub-accounts? Agency plans from $99/mo →{" "}
                  <Link href="/pricing" className="font-[500] text-[var(--lp-accent)] underline underline-offset-2">
                    See agency pricing
                  </Link>
                </p>
              ) : null}
            </div>
          </article>

          {/* ── GMV explainer — only when SeldonFrame is your sales channel ─── */}
          <aside
            aria-label="How the GMV fee works"
            className="flex flex-col rounded-[20px] border border-[var(--lp-border-soft)] bg-[var(--lp-bg-alt)] p-7 md:p-8"
          >
            <p className="text-[11px] font-[600] uppercase tracking-[0.08em] text-[var(--lp-accent)]">
              + A flat 2% fee
            </p>
            <h3 className="mt-2 max-w-[22ch] font-[Newsreader,Georgia,serif] text-[clamp(20px,2.6vw,26px)] not-italic leading-[1.2] text-[var(--lp-ink)]">
              We only make money when you do.
            </h3>
            <p className="mt-3 text-[13.5px] leading-[1.55] text-[var(--lp-muted)]">
              SeldonFrame doesn&rsquo;t just build your site — it helps you send proposals,
              take payments, and close the deal in the same place you booked the job. When
              money comes in through SeldonFrame, we keep a flat 2%. That&rsquo;s the only
              time we charge it. Get paid any other way, and we take nothing.
            </p>

            <p className="mt-5 rounded-[12px] border border-[var(--lp-border-soft)] bg-[var(--lp-card)] px-4 py-3 text-[13px] leading-[1.45] text-[var(--lp-muted)]">
              You keep 98% of every dollar we help you collect — and 100% of everything else.
            </p>

            <p className="mt-4 text-[13.5px] leading-[1.55] text-[var(--lp-muted)]">
              On agency tiers ($99+) there&rsquo;s no fee at all — 0%. Processing more than
              ~$3,500/mo through SeldonFrame? The agency tier already saves you money.
            </p>

            <p className="mt-auto pt-5 text-[12.5px] leading-[1.5] text-[var(--lp-muted)]">
              No metered AI bills. No per-workspace tax. You only ever pay more when you&rsquo;re
              already making more.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
