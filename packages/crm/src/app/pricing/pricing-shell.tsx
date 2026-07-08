// packages/crm/src/app/pricing/pricing-shell.tsx
//
// Interactive /pricing layout (SF_TIER_LADDER FLAG-OFF path — the
// legacy dark dashboard-chrome single-card view): hero + trust signals
// on the LEFT, plan panel on the RIGHT, sticky CTA at the BOTTOM.
//
// 2026-07-08 second marketing-branding fix wave — the SF_TIER_LADDER
// flag-ON rendering was extracted OUT of this file into
// pricing-shell-marketing.tsx (a light, homepage-branded rebuild; see
// that file's header for the design). This component (PricingShell)
// is now the FLAG-OFF path ONLY — page.tsx branches between the two at
// the top. Kept byte-identical to its pre-branding-fix shape (tests
// pin it) except for the wave-3 tier:"builder" fix below, which
// predates and is unrelated to this branding change.
//
// 2026-07-04 /pricing truth pass (Task 11): the platform sells exactly
// ONE plan — $29/mo flat, unlimited workspaces, cancel anytime.
// 2026-07-05: the free ungated build→claim→use experience already IS
// the trial, so this checkout charges immediately (no
// trial_period_days) — cancel anytime from Settings. No price id lives
// in the client. Included-features copy is pulled verbatim from
// components/landing/marketing-pricing-section.tsx so the authed page
// and the marketing page never drift.
//
// 2026-07-08 dedup follow-up: the checkout POST logic moved to the shared
// tier-checkout.ts (it was byte-identical in both shells). Behavior and
// rendered output are unchanged — renderToString output stays byte-equal
// to the pinned shape; only the fetch plumbing is imported now.
//
// 2026-07-08 post-review fix wave (BLOCKING) — the single card now
// POSTs `{ tier: "builder" }`, NOT `{ tier: "workspace" }`. Task 1's
// catalog made "workspace" a GRANDFATHERED tier (sellable: false,
// frozen for existing subscribers only); Task 3's checkout route gates
// on Plan.sellable flag-INDEPENDENTLY, so a "workspace" POST 409s
// tier_unavailable for every new visitor regardless of SF_TIER_LADDER.
// "builder" is the new tier this live card actually represents (spec
// D1) and is wired to the SAME configured Stripe price
// (BUILDER_PRICE_ID === WORKSPACE_PRICE_ID as of price-ids.ts, until
// Max creates a distinct Builder price) — so this is a pure relabel,
// not a new checkout path or a new Stripe price.
//
// Buyer-facing copy rule: never mention GMV / marketplace fees here —
// that's backend economics, not a buyer-facing plan detail.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { requestTierCheckout } from "./tier-checkout";

type TierId = "builder";

type Tier = {
  id: TierId;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
};

// FROZEN legacy copy of the everything-included list (pre-rebrand
// wording). The LIVE list is marketing-pricing-section.tsx's exported
// INCLUDED (which the flag-ON PricingShellMarketing imports); this one has
// already drifted from it and is intentionally NOT synced — this
// component's rendered output is pinned by tests and only exists for the
// SF_TIER_LADDER flag-OFF path.
const PLAN: Tier = {
  id: "builder",
  name: "SeldonFrame",
  price: "$29",
  cadence: "/ mo",
  tagline: "The whole platform — build it for your business, or sell it to your clients.",
  features: [
    "Website + landing pages on your own domain",
    "Booking page (Cal.diy) tied to live availability",
    "CRM — contacts, deals, tasks, notes",
    "Intake forms wired to the CRM",
    "24/7 AI agent across voice, SMS, web chat & email",
    "Build ANY agent in the Studio — connect external tools",
    "Whitelabel + resell each workspace to clients",
    "Own + export everything (AGPL — no lock-in)",
  ],
};

type PricingShellProps = {
  isAuthed: boolean;
};

export function PricingShell({ isAuthed }: PricingShellProps) {
  // There's exactly one plan — no selector state needed.
  const selected = PLAN;
  // Errors from /api/stripe/checkout. Inline error surface lives in the
  // sticky bar so it doesn't shove the page down.
  const [paidError, setPaidError] = useState<string | null>(null);
  // True while the sticky CTA is fetching the Checkout Session url.
  const [paidStarting, setPaidStarting] = useState(false);

  const trustSignals = [
    "One flat monthly price — no metered bills",
    "$29/mo · cancel anytime",
    "Manage or cancel anytime in Settings",
  ];

  async function startPaidCheckout(tierId: TierId) {
    setPaidError(null);
    setPaidStarting(true);
    try {
      // Null when we're navigating away (Stripe url / signup bounce);
      // otherwise the inline error message.
      setPaidError(await requestTierCheckout(tierId));
    } finally {
      setPaidStarting(false);
    }
  }

  return (
    <>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        {/* ============= LEFT COLUMN ============= */}
        <div className="space-y-8">
          <header className="space-y-5">
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.5rem]">
              Spin up a client&apos;s{" "}
              <span className="text-primary">Business OS</span>{" "}
              <span className="text-muted-foreground">in 60 seconds.</span>
            </h1>
            <p className="text-base text-muted-foreground sm:text-lg">
              Paste a URL. We build the CRM, booking page, intake form, and AI
              chatbot in one pass.
            </p>
          </header>

          <ul className="space-y-2.5">
            {trustSignals.map((text) => (
              <li key={text} className="flex items-center gap-2.5 text-sm">
                <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-foreground">{text}</span>
              </li>
            ))}
          </ul>

          <p className="text-sm text-muted-foreground">
            Developers?{" "}
            <a
              href="https://github.com/seldonframe/seldonframe"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-primary underline underline-offset-4"
            >
              View on GitHub
            </a>
          </p>
        </div>

        {/* ============= RIGHT COLUMN ============= */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold tracking-tight">The plan</h2>

          {/* Single plan card — name + price, no selector (there's only one plan). */}
          <div className="relative flex flex-col gap-3 rounded-2xl border border-primary bg-card/60 p-5 shadow-[0_0_0_1px_var(--primary)]">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {PLAN.name}
              </span>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                Cancel anytime
              </span>
            </div>
            <p className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold tracking-tight text-foreground">
                {PLAN.price}
              </span>
              <span className="text-sm text-muted-foreground">{PLAN.cadence} flat</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Unlimited workspaces · cancel anytime
            </p>
          </div>

          {/* Features panel. */}
          <div className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Everything included
            </p>
            <p className="mt-1 text-sm text-foreground">{PLAN.tagline}</p>
            <ul className="mt-4 grid gap-2.5 text-sm sm:grid-cols-2">
              {PLAN.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-primary/80" aria-hidden="true" />
                  <span className="text-foreground">{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Sticky bottom CTA — there's exactly one plan, so copy + button
          are static: POST /api/stripe/checkout + redirect to the
          Stripe-hosted page (authed), or bounce to /signup?plan= first. */}
      <PricingStickyBar
        selected={selected}
        isAuthed={isAuthed}
        onPaidStart={startPaidCheckout}
        paidStarting={paidStarting}
        paidError={paidError}
      />
    </>
  );
}

type StickyBarProps = {
  selected: Tier;
  isAuthed: boolean;
  onPaidStart: (tier: TierId) => void | Promise<void>;
  paidStarting: boolean;
  paidError: string | null;
};

function PricingStickyBar({
  selected,
  isAuthed,
  onPaidStart,
  paidStarting,
  paidError,
}: StickyBarProps) {
  const detail = `${selected.price}${selected.cadence} · cancel anytime from Settings`;

  const ctaLabel = paidStarting ? "Redirecting to Stripe…" : "Get started →";

  async function handlePaidClick() {
    if (paidStarting) return;
    await onPaidStart(selected.id);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="pointer-events-auto border-t border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:px-6">
          <div className="flex-1 text-center sm:text-left">
            <p className="text-sm text-muted-foreground">{detail}</p>
            {paidError ? (
              <p role="alert" className="mt-1 text-xs text-destructive">
                {paidError}
              </p>
            ) : null}
          </div>
          {isAuthed ? (
            // Authed: drive Stripe Checkout creation imperatively so we stay
            // on /pricing if the request errors and only navigate on success.
            <button
              type="button"
              onClick={handlePaidClick}
              disabled={paidStarting}
              className="crm-button-primary inline-flex h-10 items-center justify-center px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
            >
              {ctaLabel}
            </button>
          ) : (
            <Link
              href={`/signup?plan=${selected.id}`}
              className="crm-button-primary inline-flex h-10 items-center justify-center px-5 text-sm font-medium"
            >
              {ctaLabel}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
