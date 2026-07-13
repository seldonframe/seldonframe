// packages/crm/src/app/pricing/pricing-shell-marketing.tsx
//
// 2026-07-08 — marketing-branded /pricing rendering, behind SF_TIER_LADDER.
//
// Max's feedback on the flag-ON /pricing view: it didn't match the
// seldonframe.com marketing branding (dark dashboard chrome instead of the
// light cream/paper homepage look), the CTA hierarchy was unclear (every
// button just said "Get started" or "Redirecting…", no secondary path), and
// the sticky bottom CTA bar overlapped the Managed card's own button.
//
// This component rebuilds the flag-ON tier ladder using the SAME design
// tokens as components/landing/marketing-hero.tsx +
// marketing-pricing-section.tsx (read for this task):
//   --paper:    #F6F2EA  (warm off-white background)
//   --ink:      #221D17  (warm near-black text)
//   --ink-soft: #6E665A  (softer body text)
//   --green:    #1F2B24  (deep green — dark rounded primary buttons)
//   --sf-green: #059669  (SeldonFrame brand green — accent dots, links)
//   Font: Hanken Grotesk (body/UI) + Newsreader italic (display accents)
//
// Kept from pricing-shell.tsx's TierLadder (do not regress):
//   - BOTH audience rows are server-rendered (inactive one CSS-hidden via
//     `hidden`, not conditionally unmounted) so crawlers/LLMs see all 5
//     tiers — only VISIBILITY is client state (2026-07-08 SSR hotfix,
//     3c77b6a1d — preserved here verbatim).
//   - role="tablist" / role="tab" / aria-selected audience toggle semantics.
//   - data-tier={tier.id} / data-tier-cta={tier.id} attributes (tests +
//     smokes key off these — never rename).
//   - The placeholder-price money-safety gate: a tier whose Stripe price is
//     still the unconfigured PLACEHOLDER renders "Book a demo" instead of
//     wiring a checkout POST — inert without env, no new Stripe call sites.
//
// 2026-07-08 hydration-mismatch fix — "No price id lives in the client".
// This file used to be "use client" AND import PLANS + isPlaceholderPriceId
// directly, computing `isPlaceholderPriceId(tier.stripePriceId)` in the
// browser. STRIPE_*_PRICE_ID env vars are SERVER-ONLY (readEnv() reads
// process.env, undefined in the browser bundle), so every tier hydrated as
// a placeholder client-side regardless of what was actually configured —
// the SSR pass (env present) rendered the correct "Get started" primary,
// the client pass (env absent) always recomputed "Book a demo", and the
// client's re-render won after hydration. Fix: the parent Server Component
// (app/pricing/page.tsx) now resolves `available` server-side and passes
// serializable LadderTier props down. This file no longer imports PLANS,
// price-ids, or any Stripe price id — see the legacy single-card
// pricing-shell.tsx's own header rule this restores.
//
// CTA hierarchy (Max's explicit call, this task):
//   PRIMARY  = "Get started" — dark ink rounded button (homepage style),
//              wired to the SAME checkout/signup POST as before.
//   SECONDARY = quiet "or book a demo" text link -> BOOK_A_DEMO_URL, on
//              EVERY card (not just placeholder-priced ones) so a visitor
//              who isn't ready to buy always has a low-commitment escape
//              hatch.
//   Placeholder-priced tier: PRIMARY becomes "Book a demo" (unchanged
//   money-safe logic) and there's no secondary duplicate.
//
// REMOVED: the sticky bottom CTA bar. It's a dashboard-chrome pattern (see
// pricing-shell.tsx's dark PricingShell, kept for flag-OFF) that overlapped
// card buttons on this longer, multi-row marketing page. The hero area here
// carries the $29 anchor line + one clear scroll-to-cards affordance
// instead of a fixed bar competing with in-card CTAs.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

const BOOK_A_DEMO_URL = "https://app.seldonframe.com/book/seldonframes-workspace-7798/default";

type Audience = "personal" | "agency";

/** The tier ids this ladder ever renders. Kept as a plain string literal
 *  union (NOT imported from lib/billing/plans's TierId) so this file has
 *  zero dependency on the plans catalog — the parent Server Component owns
 *  which tiers exist and passes them down as fully-resolved props. */
export type LadderTierId =
  | "builder"
  | "managed"
  | "agency_starter"
  | "agency_growth"
  | "agency_scale";

const PERSONAL_TIER_IDS: LadderTierId[] = ["builder", "managed"];
const AGENCY_TIER_IDS: LadderTierId[] = ["agency_starter", "agency_growth", "agency_scale"];

/** Serializable, price-id-free tier shape — resolved server-side in
 *  app/pricing/page.tsx (buildLadderTiers). `available` is the ONLY
 *  derived-from-env fact this component needs, and it's computed on the
 *  server where STRIPE_*_PRICE_ID env vars actually resolve. */
export type LadderTier = {
  id: LadderTierId;
  name: string;
  price: number;
  tagline: string;
  maxSubAccounts: number;
  fullWhiteLabel: boolean;
  /** true = a real Stripe price is configured (checkout wired); false =
   *  still the unconfigured PLACEHOLDER (renders "Book a demo" instead). */
  available: boolean;
  /** 2026-07-08 — the rich per-tier feature checklist (PostPlanify style).
   *  SINGLE SOURCE: this list is authored ONCE in lib/billing/plans.ts's
   *  `Plan.marketingFeatures` and arrives here unmodified via the server-
   *  resolved `tiers` prop — this file renders it verbatim, never copies
   *  or edits the strings. Optional (undefined on tiers with no checklist,
   *  though every sellable tier has one today). */
  marketingFeatures?: {
    header?: string;
    items: string[];
  };
};

function ladderTiersFor(tiers: LadderTier[], audience: Audience): LadderTier[] {
  const ids = audience === "personal" ? PERSONAL_TIER_IDS : AGENCY_TIER_IDS;
  return ids
    .map((id) => tiers.find((t) => t.id === id))
    .filter((t): t is LadderTier => Boolean(t));
}

function subAccountLabel(tier: LadderTier): string {
  if (tier.maxSubAccounts === 0) return "";
  if (tier.maxSubAccounts === -1) return "Unlimited client sub-accounts";
  return `${tier.maxSubAccounts} client sub-accounts included`;
}

// Everything-included list, restyled light — verbatim from
// marketing-pricing-section.tsx's INCLUDED const (kept in sync manually;
// that component's own copy is the source of truth for the homepage card).
const INCLUDED: readonly string[] = [
  "A website on your own domain, customized to your business — live and taking customers in minutes.",
  "A CRM and pipeline, so every lead lands in one place and you always know who to call next.",
  "A booking page tied to your real calendar, so customers book themselves while you're on the job.",
  "A lead form wired straight to your CRM, so no inquiry ever slips through the cracks.",
  "A website chatbot built in, so your site answers questions and books work for you 24/7.",
  "Add any AI agent to take the busywork off your plate — just tell it what you want, no code.",
];

export type PricingShellMarketingProps = {
  isAuthed: boolean;
  /** Server-resolved, price-id-free tier list (app/pricing/page.tsx's
   *  buildLadderTiers). The only per-tier fact derived from env
   *  (`available`) is already computed — this component never touches
   *  process.env, PLANS, or a Stripe price id. */
  tiers: LadderTier[];
};

export function PricingShellMarketing({ isAuthed, tiers }: PricingShellMarketingProps) {
  const [audience, setAudience] = useState<Audience>("personal");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<LadderTierId | null>(null);

  async function startTierCheckout(tier: LadderTier) {
    setError(null);
    setStarting(tier.id);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tier.id,
          successPath: "/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}",
          cancelPath: "/pricing",
        }),
      });
      if (res.status === 401) {
        window.location.assign(`/signup?plan=${encodeURIComponent(tier.id)}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data.error ?? "Couldn't start checkout. Try again in a moment.");
    } catch {
      setError("Couldn't reach Stripe. Check your connection and try again.");
    } finally {
      setStarting(null);
    }
  }

  return (
    <div data-pricing-theme="marketing" className="bg-[#F6F2EA] text-[#221D17]">
      {/* ============= HERO — light marketing style, "Simple pricing" ========== */}
      <section className="px-5 pb-10 pt-8 text-center md:px-8 lg:px-12">
        <div className="mx-auto max-w-[700px]">
          <div className="inline-flex items-center justify-center gap-2.5 text-[12px] font-[600] uppercase tracking-[0.09em] text-[#059669]">
            <span className="h-px w-4 bg-[#059669] opacity-50" aria-hidden />
            Pricing
            <span className="h-px w-4 bg-[#059669] opacity-50" aria-hidden />
          </div>
          <h1 className="mx-auto mt-3.5 max-w-[18ch] text-[clamp(30px,4.4vw,48px)] font-[500] leading-[1.06] tracking-[-0.025em] text-[#221D17]">
            Simple pricing.{" "}
            <em className="font-[Newsreader,Georgia,serif] font-normal not-italic text-[#6E665A]">
              Start at $29/mo.
            </em>
          </h1>
          <p className="mx-auto mt-4 max-w-[54ch] text-[16px] leading-[1.55] text-[#6E665A]">
            Build for your own businesses, or run a whitelabel agency for your clients — one
            flat price per tier, no metered bills, cancel anytime.
          </p>
        </div>
      </section>

      {/* ============= AUDIENCE TOGGLE + TIER CARDS ========== */}
      <section className="px-5 pb-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-[1120px]">
          <div className="flex justify-center">
            <div
              role="tablist"
              aria-label="Choose your audience"
              className="inline-flex rounded-full border border-[rgba(34,29,23,.14)] bg-[#FFFDFA] p-1 shadow-[0_1px_2px_rgba(34,29,23,.05)]"
            >
              <button
                type="button"
                role="tab"
                aria-selected={audience === "personal"}
                onClick={() => setAudience("personal")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  audience === "personal"
                    ? "bg-[#1F2B24] text-[#F6F2EA]"
                    : "text-[#6E665A] hover:text-[#221D17]"
                }`}
              >
                For your businesses
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={audience === "agency"}
                onClick={() => setAudience("agency")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  audience === "agency"
                    ? "bg-[#1F2B24] text-[#F6F2EA]"
                    : "text-[#6E665A] hover:text-[#221D17]"
                }`}
              >
                For your clients&apos; businesses
              </button>
            </div>
          </div>

          {/* Both audience rows are server-rendered (inactive one CSS-hidden)
              so crawlers/LLMs see all five tiers — only visibility is client
              state (preserves the 2026-07-08 SSR hotfix). */}
          {(["personal", "agency"] as Audience[]).map((aud) => (
            <div
              key={aud}
              className={`mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 ${audience === aud ? "" : "hidden"}`}
              aria-hidden={audience !== aud}
            >
              {ladderTiersFor(tiers, aud).map((tier) => {
                const placeholder = !tier.available;
                const subLabel = subAccountLabel(tier);
                return (
                  <div
                    key={tier.id}
                    data-tier={tier.id}
                    className="flex flex-col gap-3 rounded-[20px] border border-[rgba(34,29,23,.10)] bg-[#FFFDFA] p-6 shadow-[0_10px_30px_rgba(34,29,23,.06)]"
                  >
                    <span className="text-[11px] font-[600] uppercase tracking-[0.12em] text-[#9A9183]">
                      {tier.name}
                    </span>
                    <p className="flex items-baseline gap-1.5">
                      <span className="font-sans text-[clamp(28px,3.2vw,34px)] font-[600] tracking-[-0.02em] text-[#221D17]">
                        ${tier.price}
                      </span>
                      <span className="text-[13px] text-[#9A9183]">/mo</span>
                    </p>
                    <p className="text-[13.5px] leading-[1.5] text-[#6E665A]">{tier.tagline}</p>
                    {subLabel ? (
                      <p className="text-[12.5px] font-[500] text-[#059669]">{subLabel}</p>
                    ) : null}
                    {tier.fullWhiteLabel ? (
                      <p className="text-[12.5px] text-[#6E665A]">Full white-label</p>
                    ) : null}

                    {/* PostPlanify-style rich feature checklist — SINGLE
                        SOURCE is Plan.marketingFeatures (lib/billing/plans.ts),
                        rendered verbatim here. `header` (e.g. "Everything in
                        Builder, plus:") is bold above the checkmarked items;
                        omitted on the base tier which has no "everything in
                        X" predecessor. */}
                    {tier.marketingFeatures ? (
                      <div data-tier-features={tier.id} className="mt-1">
                        {tier.marketingFeatures.header ? (
                          <p className="mb-2 text-[12.5px] font-[600] text-[#221D17]">
                            {tier.marketingFeatures.header}
                          </p>
                        ) : null}
                        <ul className="flex flex-col gap-1.5">
                          {tier.marketingFeatures.items.map((item) => (
                            <li
                              key={item}
                              className="flex items-start gap-2 text-[13.5px] leading-[1.6] text-[#221D17]"
                            >
                              <Check size={14} className="mt-[3px] shrink-0 text-[#059669]" aria-hidden />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {/* PRIMARY CTA */}
                    <div className="mt-2 flex flex-col items-start gap-2">
                      {placeholder ? (
                        <a
                          href={BOOK_A_DEMO_URL}
                          target="_blank"
                          rel="noreferrer"
                          data-tier-cta={tier.id}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#1F2B24] px-4 text-[13.5px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#059669]"
                        >
                          <span className="size-[7px] rounded-full bg-[#059669]" aria-hidden />
                          Book a demo
                        </a>
                      ) : isAuthed ? (
                        <button
                          type="button"
                          data-tier-cta={tier.id}
                          onClick={() => startTierCheckout(tier)}
                          disabled={starting !== null}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#1F2B24] px-4 text-[13.5px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#059669]"
                        >
                          <span className="size-[7px] rounded-full bg-[#059669]" aria-hidden />
                          {starting === tier.id ? "Redirecting…" : "Get started"}
                        </button>
                      ) : (
                        <Link
                          href={`/signup?plan=${tier.id}`}
                          data-tier-cta={tier.id}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-[#1F2B24] px-4 text-[13.5px] font-[500] text-[#F6F2EA] shadow-[0_1px_2px_rgba(34,29,23,.10),0_6px_16px_rgba(34,29,23,.10),inset_0_1.5px_0_rgba(255,255,255,.12)] transition-all hover:-translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#059669]"
                        >
                          <span className="size-[7px] rounded-full bg-[#059669]" aria-hidden />
                          Get started
                        </Link>
                      )}

                      {/* SECONDARY CTA — quiet demo link on every card, per
                          Max's CTA-hierarchy call. Skipped on the
                          placeholder-priced card since its primary already IS
                          "Book a demo" (no duplicate). */}
                      {placeholder ? null : (
                        <a
                          href={BOOK_A_DEMO_URL}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[12.5px] font-[500] text-[#6E665A] underline underline-offset-2 transition-colors hover:text-[#221D17]"
                        >
                          or book a demo
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {error ? (
            <p role="alert" className="mt-4 text-center text-sm text-[#B3413A]">
              {error}
            </p>
          ) : null}
        </div>
      </section>

      {/* ============= EVERYTHING INCLUDED — restyled light ========== */}
      <section className="px-5 pb-16 md:px-8 lg:px-12">
        <div className="mx-auto max-w-[820px] rounded-[20px] border border-[rgba(34,29,23,.08)] bg-[#FFFDFA] p-7 md:p-8">
          <p className="text-center text-[11px] font-[600] uppercase tracking-[0.16em] text-[#9A9183]">
            Everything included, every tier
          </p>
          <ul className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[13.5px] leading-[1.45] text-[#221D17]">
                <Check size={16} className="mt-0.5 shrink-0 text-[#059669]" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
