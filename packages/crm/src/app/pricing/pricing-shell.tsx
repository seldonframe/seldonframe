// packages/crm/src/app/pricing/pricing-shell.tsx
//
// Interactive /pricing layout: hero + trust signals on the LEFT, plan
// panel on the RIGHT, sticky CTA at the BOTTOM.
//
// 2026-07-04 /pricing truth pass (Task 11): the platform sells exactly
// ONE plan — $29/mo flat, unlimited workspaces, 14-day free trial. The
// old Builder $19 / Workspace $49 / Agency $297 ladder never shipped to
// checkout truthfully and is gone. The single card POSTs
// `{ tier: "workspace" }` to /api/stripe/checkout — that's the
// allowlisted server-side path that resolves to GROWTH_BASE_PRICE_ID
// (see route.ts) and gets the 14-day trial (trial_period_days: 14).
// No price id lives in the client. Included-features copy is pulled
// verbatim from components/landing/marketing-pricing-section.tsx so the
// authed page and the marketing page never drift.
//
// Buyer-facing copy rule: never mention GMV / marketplace fees here —
// that's backend economics, not a buyer-facing plan detail.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";

type TierId = "workspace";

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
  id: "workspace",
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
    "14-day free trial, then $29/mo",
    "Cancel anytime in Settings",
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
                14-day free trial
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
  const detail = `14-day free trial, then ${selected.price}${selected.cadence} · cancel anytime from Settings`;

  const ctaLabel = paidStarting ? "Redirecting to Stripe…" : "Start your 14-day free trial →";

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
