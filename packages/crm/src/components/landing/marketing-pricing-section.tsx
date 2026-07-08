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
// SINGLE SOURCE OF TRUTH for the everything-included copy — exported so
// /pricing's PricingShellMarketing renders the same list instead of a
// hand-synced duplicate (2026-07-08 dedup). The legacy flag-OFF
// PricingShell keeps its own frozen pre-rebrand list (its tests pin that
// rendered output) and is intentionally NOT wired to this export.
export const INCLUDED: readonly string[] = [
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
      className="border-t border-[rgba(34,29,23,.08)] bg-[#F6F2EA] px-5 py-20 md:px-8 md:py-28 lg:px-12"
    >
      <div className="mx-auto max-w-[1120px]">
        {/* Section head */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#00897B]">
            <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
            Pricing
            <span className="h-px w-4 bg-[#00897B] opacity-50" aria-hidden />
          </div>
          <h2
            id="pricing-heading"
            className="mx-auto mt-3.5 max-w-[20ch] text-[clamp(27px,4.2vw,42px)] font-[500] leading-[1.08] tracking-[-0.025em] text-[#221D17]"
          >
            One flat price.{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[#6E665A]">
              We only make money when you do.
            </em>
          </h2>
          <p className="mx-auto mt-4 max-w-[56ch] text-[16px] leading-[1.55] text-[#6E665A]">
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
            className="relative flex flex-col rounded-[20px] border border-[rgba(0,137,123,.35)] bg-[#FFFDFA] p-7 shadow-[0_24px_60px_rgba(34,29,23,.12)] md:p-8"
          >
            <span className="absolute -top-3 right-6 rounded-full border border-[rgba(0,137,123,.25)] bg-[rgba(0,137,123,.12)] px-3 py-1 text-[10.5px] font-[600] uppercase tracking-wider text-[#00897B] ring-2 ring-[#F6F2EA]">
              Cancel anytime
            </span>

            <h3 id="pricing-plan-name" className="text-[17px] font-[600] text-[#221D17]">
              SeldonFrame
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.5] text-[#6E665A]">
              Everything you need to get customers and get paid — in one place, on one flat
              bill.
            </p>

            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-sans text-[clamp(40px,5.5vw,54px)] font-[600] leading-none tracking-[-0.03em] text-[#221D17]">
                $29
              </span>
              <span className="text-[14px] text-[#9A9183]">/month flat</span>
            </div>
            <p className="mt-2 text-[13px] leading-[1.5] text-[#6E665A]">
              Unlimited workspaces · cancel anytime
            </p>
            <p className="mt-1 text-[13px] font-[500] text-[#221D17]">
              One booked job pays for the year.
            </p>

            <Link
              href="/signup"
              data-plan-cta="flat"
              className="mt-6 inline-flex items-center justify-center gap-2.5 rounded-full bg-[#1F2B24] px-6 py-3.5 text-[14px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00897B]"
            >
              <span className="size-[7px] rounded-full bg-[#00897B] shadow-[0_0_0_3px_rgba(0,137,123,.22)]" aria-hidden />
              Build it free →
            </Link>

            {/* Everything included */}
            <div className="mt-7 border-t border-[rgba(34,29,23,.08)] pt-6">
              <p className="text-[11px] font-[600] uppercase tracking-[0.08em] text-[#9A9183]">
                Everything included
              </p>
              <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {INCLUDED.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-[13.5px] leading-[1.45] text-[#221D17]">
                    <Check size={16} className="mt-0.5 shrink-0 text-[#00897B]" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="mt-5 rounded-[12px] border border-[rgba(0,137,123,.25)] bg-[rgba(0,137,123,.08)] px-4 py-3 text-[13.5px] leading-[1.5] text-[#221D17]">
                Want a voice agent that answers every call? A review agent that turns happy
                customers into 5-star Google reviews? A speed-to-lead agent that texts back
                missed calls before they hire someone else? Add them in a click.
              </p>
              <p className="mt-4 text-[12.5px] leading-[1.5] text-[#6E665A]">
                Your agents run on your own AI key (and Twilio for calls/texts), billed by
                the provider at cost.
              </p>
              {tierLadderOn ? (
                <p className="mt-4 text-[12.5px] leading-[1.5] text-[#6E665A]">
                  Running client sub-accounts? Agency plans from $99/mo →{" "}
                  <Link href="/pricing" className="font-[500] text-[#00897B] underline underline-offset-2">
                    See agency pricing
                  </Link>
                </p>
              ) : null}
            </div>
          </article>

          {/* ── GMV explainer — only when SeldonFrame is your sales channel ─── */}
          <aside
            aria-label="How the GMV fee works"
            className="flex flex-col rounded-[20px] border border-[rgba(34,29,23,.08)] bg-[#EFE9DD] p-7 md:p-8"
          >
            <p className="text-[11px] font-[600] uppercase tracking-[0.08em] text-[#00897B]">
              + A flat 2% fee
            </p>
            <h3 className="mt-2 max-w-[22ch] font-[Newsreader,Georgia,serif] text-[clamp(20px,2.6vw,26px)] not-italic leading-[1.2] text-[#221D17]">
              We only make money when you do.
            </h3>
            <p className="mt-3 text-[13.5px] leading-[1.55] text-[#6E665A]">
              SeldonFrame doesn&rsquo;t just build your site — it helps you send proposals,
              take payments, and close the deal in the same place you booked the job. When
              money comes in through SeldonFrame, we keep a flat 2%. That&rsquo;s the only
              time we charge it. Get paid any other way, and we take nothing.
            </p>

            <p className="mt-5 rounded-[12px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] px-4 py-3 text-[13px] leading-[1.45] text-[#6E665A]">
              You keep 98% of every dollar we help you collect — and 100% of everything else.
            </p>

            <p className="mt-auto pt-5 text-[12.5px] leading-[1.5] text-[#6E665A]">
              No metered AI bills. No per-workspace tax. You only ever pay more when you&rsquo;re
              already making more.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
