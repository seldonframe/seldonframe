// packages/crm/src/components/landing/marketing-pricing-section.tsx
//
// Rewrite 2026-06-22 — flat $29/mo model (replaces the old 3-tier table).
// Warm light aesthetic: paper/card surfaces, SeldonFrame green accent.
//
// The model (finalized 2026-06-21; copy corrected 2026-06-22):
//   $29/mo flat · unlimited workspaces · 14-day free trial.
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
  "Website + landing pages on your own domain",
  "Booking page (Cal.diy) tied to live availability",
  "CRM — contacts, deals, tasks, notes",
  "Intake forms wired to the CRM",
  "24/7 AI agent across voice, SMS, web chat & email",
  "Build ANY agent in the Studio — connect external tools",
  "Whitelabel + resell each workspace to clients",
  "Own + export everything (AGPL — no lock-in)",
];

export function LandingMarketingPricingSection() {
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
            $29 a month flat — less than a part-time hire, and a single booked job pays for
            the year. No metered bills, no per-seat tax, no surprise invoices. Start with a
            14-day free trial.
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
              14-day free trial
            </span>

            <h3 id="pricing-plan-name" className="text-[17px] font-[600] text-[#221D17]">
              SeldonFrame
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-[1.5] text-[#6E665A]">
              The whole platform — build it for your business, or sell it to your clients.
            </p>

            <div className="mt-5 flex items-baseline gap-1.5">
              <span className="font-sans text-[clamp(40px,5.5vw,54px)] font-[600] leading-none tracking-[-0.03em] text-[#221D17]">
                $29
              </span>
              <span className="text-[14px] text-[#9A9183]">/month flat</span>
            </div>
            <p className="mt-2 text-[13px] leading-[1.5] text-[#6E665A]">
              Unlimited workspaces · 14-day free trial · cancel anytime
            </p>

            <Link
              href="/signup"
              data-plan-cta="flat"
              className="mt-6 inline-flex items-center justify-center gap-2.5 rounded-full bg-[#1F2B24] px-6 py-3.5 text-[14px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00897B]"
            >
              <span className="size-[7px] rounded-full bg-[#00897B] shadow-[0_0_0_3px_rgba(0,137,123,.22)]" aria-hidden />
              Start your 14-day free trial →
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
              <p className="mt-5 text-[12.5px] leading-[1.5] text-[#6E665A]">
                The voice receptionist is <strong className="font-[600] text-[#221D17]">included</strong> — not a paid
                add-on. Your agents run on your own AI key (and Twilio for calls/texts), billed by the provider at
                cost. <strong className="font-[600] text-[#221D17]">We never mark it up — that&rsquo;s why it&rsquo;s a flat
                $29, not a metered bill that punishes growth.</strong>
              </p>
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
              On top of the flat $29, we take 2% of revenue —{" "}
              <strong className="font-[600] text-[#221D17]">only when SeldonFrame is your sales channel</strong>{" "}
              (a marketplace sale, a booking, an accepted proposal). When the work doesn&rsquo;t flow
              through us, the fee is zero.
            </p>

            <p className="mt-5 rounded-[12px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] px-4 py-3 text-[13px] leading-[1.45] text-[#6E665A]">
              Only on what you sell through SeldonFrame — sell anywhere else and we take nothing.
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
