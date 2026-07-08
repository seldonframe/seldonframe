// packages/crm/src/app/pricing/pricing-shell.tsx
//
// Interactive /pricing layout: hero + trust signals on the LEFT, plan
// panel on the RIGHT, sticky CTA at the BOTTOM.
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
// 2026-07-08 pricing ladder (Task 4, behind SF_TIER_LADDER): an
// audience toggle appears ABOVE the single-plan card — "For your
// businesses" (Builder $29 / Managed $49) vs. "For your clients'
// businesses" (Agency Starter $99 / Growth $199 / Scale $299,
// sub-account vocabulary). Cards are data-driven from
// `PLANS.filter(p => p.sellable)` (single source of truth — plans.ts).
// Money-safe: a tier whose Stripe price is still the unconfigured
// PLACEHOLDER renders its CTA as "Book a demo" (mailto/demo link)
// instead of POSTing to checkout — no new Stripe call sites, inert
// without the env var. Flag OFF renders the exact pre-existing single
// $29 card (byte-compatible — this component's default export path is
// unchanged).
//
// Buyer-facing copy rule: never mention GMV / marketplace fees here —
// that's backend economics, not a buyer-facing plan detail.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PLANS, type TierId as CatalogTierId } from "@/lib/billing/plans";
import { isPlaceholderPriceId } from "@/lib/billing/price-ids";

type TierId = "builder";

type Tier = {
  id: TierId;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  features: string[];
};

// Verbatim from marketing-pricing-section.tsx's INCLUDED list — keep in
// sync if that copy changes.
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

// ─── 2026-07-08 audience toggle (SF_TIER_LADDER) ──────────────────────

const BOOK_A_DEMO_URL = "https://app.seldonframe.com/book/seldonframes-workspace-7798/default";

type Audience = "personal" | "agency";

const PERSONAL_TIER_IDS: CatalogTierId[] = ["builder", "managed"];
const AGENCY_TIER_IDS: CatalogTierId[] = ["agency_starter", "agency_growth", "agency_scale"];

type LadderTier = {
  id: CatalogTierId;
  name: string;
  price: number;
  tagline: string;
  maxSubAccounts: number;
  fullWhiteLabel: boolean;
  stripePriceId: string;
};

const SELLABLE_TIERS: LadderTier[] = PLANS.filter((p) => p.sellable).map((p) => ({
  id: p.id,
  name: p.name,
  price: p.price,
  tagline: p.tagline,
  maxSubAccounts: p.limits.maxSubAccounts,
  fullWhiteLabel: p.limits.fullWhiteLabel,
  stripePriceId: p.stripePriceId,
}));

function ladderTiersFor(audience: Audience): LadderTier[] {
  const ids = audience === "personal" ? PERSONAL_TIER_IDS : AGENCY_TIER_IDS;
  return ids
    .map((id) => SELLABLE_TIERS.find((t) => t.id === id))
    .filter((t): t is LadderTier => Boolean(t));
}

function subAccountLabel(tier: LadderTier): string {
  if (tier.maxSubAccounts === 0) return "";
  if (tier.maxSubAccounts === -1) return "Unlimited client sub-accounts";
  return `${tier.maxSubAccounts} client sub-accounts included`;
}

type TierLadderProps = {
  isAuthed: boolean;
};

function TierLadder({ isAuthed }: TierLadderProps) {
  const [audience, setAudience] = useState<Audience>("personal");
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState<CatalogTierId | null>(null);

  const tiers = ladderTiersFor(audience);

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
    <div className="mt-10 space-y-6">
      <div
        role="tablist"
        aria-label="Choose your audience"
        className="inline-flex rounded-full border border-border/70 bg-card/40 p-1"
      >
        <button
          type="button"
          role="tab"
          aria-selected={audience === "personal"}
          onClick={() => setAudience("personal")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            audience === "personal" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
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
            audience === "agency" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
          }`}
        >
          For your clients&apos; businesses
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiers.map((tier) => {
          const placeholder = isPlaceholderPriceId(tier.stripePriceId);
          const subLabel = subAccountLabel(tier);
          return (
            <div
              key={tier.id}
              data-tier={tier.id}
              className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/40 p-5"
            >
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {tier.name}
              </span>
              <p className="flex items-baseline gap-1.5">
                <span className="text-2xl font-semibold tracking-tight text-foreground">
                  ${tier.price}
                </span>
                <span className="text-sm text-muted-foreground">/ mo</span>
              </p>
              <p className="text-sm text-muted-foreground">{tier.tagline}</p>
              {subLabel ? (
                <p className="text-xs font-medium text-primary">{subLabel}</p>
              ) : null}
              {tier.fullWhiteLabel ? (
                <p className="text-xs text-muted-foreground">Full white-label</p>
              ) : null}
              {placeholder ? (
                <a
                  href={BOOK_A_DEMO_URL}
                  target="_blank"
                  rel="noreferrer"
                  data-tier-cta={tier.id}
                  className="crm-button-primary mt-2 inline-flex h-9 items-center justify-center px-4 text-sm font-medium"
                >
                  Book a demo
                </a>
              ) : isAuthed ? (
                <button
                  type="button"
                  data-tier-cta={tier.id}
                  onClick={() => startTierCheckout(tier)}
                  disabled={starting !== null}
                  className="crm-button-primary mt-2 inline-flex h-9 items-center justify-center px-4 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {starting === tier.id ? "Redirecting…" : "Get started"}
                </button>
              ) : (
                <Link
                  href={`/signup?plan=${tier.id}`}
                  data-tier-cta={tier.id}
                  className="crm-button-primary mt-2 inline-flex h-9 items-center justify-center px-4 text-sm font-medium"
                >
                  Get started
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type PricingShellProps = {
  isAuthed: boolean;
  /** SF_TIER_LADDER — flag read server-side in pricing/page.tsx and
   *  passed down. Default false so any caller that doesn't pass it
   *  (tests, storybook-style usage) keeps today's single-card view. */
  tierLadderOn?: boolean;
};

export function PricingShell({ isAuthed, tierLadderOn = false }: PricingShellProps) {
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
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: tierId,
          successPath: "/dashboard?upgraded=1&session_id={CHECKOUT_SESSION_ID}",
          cancelPath: "/pricing",
        }),
      });
      // Unauthed visitors get bounced to signup with the chosen plan.
      if (res.status === 401) {
        window.location.assign(`/signup?plan=${encodeURIComponent(tierId)}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (data.url) {
        window.location.assign(data.url);
        return;
      }
      setPaidError(data.error ?? "Couldn't start checkout. Try again in a moment.");
    } catch {
      setPaidError("Couldn't reach Stripe. Check your connection and try again.");
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

      {/* 2026-07-08 pricing ladder — audience toggle, flag-gated. Renders
          BELOW the single-plan hero so the $29 card stays the primary
          truth; the ladder is the expansion path for agency operators. */}
      {tierLadderOn ? <TierLadder isAuthed={isAuthed} /> : null}

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
