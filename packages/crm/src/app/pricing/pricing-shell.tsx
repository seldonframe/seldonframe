// packages/crm/src/app/pricing/pricing-shell.tsx
//
// 2026-05-17 — Single Client Component that owns the entire interactive
// /pricing layout (hero + trust signals + embedded payment on LEFT,
// plan picker + features panel on RIGHT, sticky CTA at BOTTOM).
//
// Why one shell instead of two siblings + context:
//   The embedded Stripe Payment Element + the plan picker + the sticky
//   CTA all read the same selected-tier state, and the form needs to be
//   in the LEFT column while the picker is in the RIGHT. Splitting them
//   into separate Client Components forced a React context to share
//   `selectedId` across the grid. Putting everything in one shell keeps
//   state local, removes a layer of indirection, and lets us pass the
//   imperative submit handle down without a Provider.
//
// What lives elsewhere:
//   - Hero + trust-signal copy are inlined here (text only, no auth
//     branch — both depend on `stripe` to flip the middle trust signal).
//   - FAQ stays in page.tsx — it's static and doesn't need state.
//   - SetupIntent provisioning runs server-side in page.tsx; the bundle
//     is passed in via the `stripe` prop.
//
// Paid tier checkout flow:
//   Growth + Scale POST directly to /api/stripe/checkout (the existing
//   Stripe-hosted Checkout route) and window.location.assign the
//   returned URL. Previously the sticky CTA <Link>ed to /settings/billing
//   ?plan=X, but that page doesn't auto-start checkout from a query
//   param — it just rendered the billing dashboard, leaving the user
//   stuck. The new flow gets them straight to Stripe in one click.

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { selectFreeTierAction } from "./_actions";
import { EmbeddedPayment, type EmbeddedPaymentHandle } from "./embedded-payment";

type TierId = "free" | "growth" | "scale";

type Tier = {
  id: TierId;
  name: string;
  price: string;
  cadence: string;
  tagline: string;
  featured?: boolean;
  features: string[];
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "forever",
    tagline: "Your first client workspace, free forever.",
    features: [
      "1 client workspace",
      "50 contacts",
      "100 agent runs / mo",
      "All core blocks (CRM, booking, intake, agents)",
      "BYO LLM keys",
      "Community support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    price: "$29",
    cadence: "/ mo",
    tagline: "For operators with paying clients.",
    featured: true,
    features: [
      "3 client workspaces",
      "500 contacts included · $0.02 / contact after",
      "1,000 agent runs included · $0.03 / run after",
      "Custom domain",
      "Remove SeldonFrame branding",
      "Client portal · email support",
    ],
  },
  {
    id: "scale",
    name: "Scale",
    price: "$99",
    cadence: "/ mo",
    tagline: "For agencies serving multiple clients.",
    features: [
      "Unlimited workspaces",
      "Unlimited contacts",
      "Agent runs $0.02 each (all metered)",
      "Full white-label",
      "Client portal with custom branding",
      "Brain Layer 2 · priority support",
    ],
  },
];

type StripeBundle = { publishableKey: string; clientSecret: string };

type PricingShellProps = {
  isAuthed: boolean;
  stripe: StripeBundle | null;
};

export function PricingShell({ isAuthed, stripe }: PricingShellProps) {
  // Default to Growth — it's the conversion goal. Free is one click away.
  const [selectedId, setSelectedId] = useState<TierId>("growth");
  // Errors from /api/stripe/checkout (paid tier path). Inline error
  // surface lives in the sticky bar so it doesn't shove the page down.
  const [paidError, setPaidError] = useState<string | null>(null);
  // True while the paid tier sticky CTA is fetching the Checkout Session
  // url. Disables the button + flips its label to "Redirecting…".
  const [paidStarting, setPaidStarting] = useState(false);
  const reduceMotion = useReducedMotion();
  const paymentHandleRef = useRef<EmbeddedPaymentHandle | null>(null);

  const selected = TIERS.find((t) => t.id === selectedId) ?? TIERS[0];
  // Only render the embedded form when ALL conditions are met:
  //  - Free is the active tier (paid tiers still use Stripe Checkout)
  //  - operator is authed (need a Stripe Customer)
  //  - SetupIntent bundle was provisioned server-side (publishable key set)
  const showEmbeddedForm = selected.id === "free" && isAuthed && Boolean(stripe);

  // Trust signals flip the middle item when the embedded form will be
  // mounted. Honest up-front about why we want a card on a $0 plan.
  const trustSignals = [
    "First workspace always free",
    stripe ? "Card on file, never charged on Free" : "No card required to start",
    "Cancel anytime in Settings",
  ];

  async function startPaidCheckout(tierId: "growth" | "scale") {
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

          {/* Embedded payment form — only when Free + authed + Stripe ready.
              When paid is selected, this slot collapses and the right
              column's features panel naturally extends to fill height. */}
          {showEmbeddedForm && stripe ? (
            <div className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-6">
              <div className="mb-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Save a card on file
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Never charged on Free. Stays attached so upgrades are
                  one-click later — no re-entering card details.
                </p>
              </div>
              <EmbeddedPayment
                publishableKey={stripe.publishableKey}
                clientSecret={stripe.clientSecret}
                handleRef={paymentHandleRef}
              />
            </div>
          ) : null}

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
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Choose a plan</h2>
            <div
              role="tablist"
              aria-label="Billing cadence"
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card/60 p-1"
            >
              <span
                role="tab"
                aria-selected="true"
                className="rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background"
              >
                Monthly
              </span>
              <span
                role="tab"
                aria-selected="false"
                className="cursor-not-allowed rounded-full px-3 py-1 text-xs font-medium text-muted-foreground/80"
                title="Yearly billing coming soon"
              >
                Yearly · 20% off
              </span>
            </div>
          </div>

          {/* Plan cards — name + price + check badge only. Click selects. */}
          <div role="radiogroup" aria-label="Plan tier" className="grid gap-3 sm:grid-cols-3">
            {TIERS.map((tier) => {
              const isSelected = tier.id === selectedId;
              return (
                <button
                  key={tier.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelectedId(tier.id)}
                  className={`group relative flex flex-col gap-3 rounded-2xl border bg-card/60 p-5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    isSelected
                      ? "border-primary shadow-[0_0_0_1px_var(--primary)]"
                      : "border-border/70 hover:border-border hover:bg-card/80"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {tier.name}
                    </span>
                    {tier.featured ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-primary">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <p className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-semibold tracking-tight text-foreground">
                      {tier.price}
                    </span>
                    <span className="text-sm text-muted-foreground">{tier.cadence}</span>
                  </p>
                  <span
                    aria-hidden="true"
                    className={`mt-1 inline-flex size-4 items-center justify-center rounded-full transition-all ${
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-transparent"
                    }`}
                  >
                    <Check className="size-2.5" />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Features panel — swaps content on tier change with a 160ms fade. */}
          <div className="rounded-2xl border border-border/70 bg-card/40 p-5 sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selected.id}
                initial={reduceMotion ? false : { opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
              >
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  What you get on {selected.name}
                </p>
                <p className="mt-1 text-sm text-foreground">{selected.tagline}</p>
                <ul className="mt-4 grid gap-2.5 text-sm sm:grid-cols-2">
                  {selected.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-primary/80" aria-hidden="true" />
                      <span className="text-foreground">{f}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Sticky bottom CTA — copy + button reflect the selected tier and
          available flows. Free with embedded form → confirmSetup via the
          imperative handle. Free without → bare Server Action. Paid →
          POST /api/stripe/checkout + redirect to Stripe-hosted page. */}
      <PricingStickyBar
        selected={selected}
        isAuthed={isAuthed}
        showEmbeddedForm={showEmbeddedForm}
        onEmbeddedSubmit={() => paymentHandleRef.current?.submit()}
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
  showEmbeddedForm: boolean;
  onEmbeddedSubmit: () => void;
  onPaidStart: (tier: "growth" | "scale") => void | Promise<void>;
  paidStarting: boolean;
  paidError: string | null;
};

function PricingStickyBar({
  selected,
  isAuthed,
  showEmbeddedForm,
  onEmbeddedSubmit,
  onPaidStart,
  paidStarting,
  paidError,
}: StickyBarProps) {
  const [savingCard, setSavingCard] = useState(false);

  const detail = (() => {
    if (selected.id === "free") {
      return showEmbeddedForm
        ? "Save a card now — never charged on Free. One-click upgrades later."
        : "Your first workspace is always free — no card to start. Cancel anytime.";
    }
    return `${selected.price}${selected.cadence} · cancel anytime from Settings`;
  })();

  const ctaLabel = (() => {
    if (selected.id === "free") {
      if (showEmbeddedForm) return savingCard ? "Saving card…" : "Save card & continue →";
      return isAuthed ? "Continue with Free →" : "Start free →";
    }
    if (paidStarting) return "Redirecting to Stripe…";
    return isAuthed ? `Subscribe to ${selected.name} →` : `Start ${selected.name} →`;
  })();

  async function handleEmbeddedClick() {
    if (savingCard) return;
    setSavingCard(true);
    try {
      await Promise.resolve(onEmbeddedSubmit());
    } finally {
      // Keep "Saving card…" visible during the brief gap between
      // confirmSetup() success and the Server Action redirect. If we hit
      // an error path that surfaces inline (3DS decline, etc.), unset
      // after a short delay so the user can retry.
      setTimeout(() => setSavingCard(false), 600);
    }
  }

  async function handlePaidClick() {
    if (paidStarting) return;
    if (!isAuthed) return; // Link path handles unauthed users
    if (selected.id !== "growth" && selected.id !== "scale") return;
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
          {selected.id === "free" && showEmbeddedForm ? (
            <button
              type="button"
              onClick={handleEmbeddedClick}
              disabled={savingCard}
              className="crm-button-primary inline-flex h-10 items-center justify-center px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-70"
            >
              {ctaLabel}
            </button>
          ) : selected.id === "free" && isAuthed ? (
            <form action={selectFreeTierAction}>
              <button
                type="submit"
                className="crm-button-primary inline-flex h-10 items-center justify-center px-5 text-sm font-medium"
              >
                {ctaLabel}
              </button>
            </form>
          ) : selected.id === "free" ? (
            <Link
              href="/signup"
              className="crm-button-primary inline-flex h-10 items-center justify-center px-5 text-sm font-medium"
            >
              {ctaLabel}
            </Link>
          ) : isAuthed ? (
            // Paid + authed: drive Stripe Checkout creation imperatively
            // so we stay on /pricing if the request errors and only
            // navigate away on success.
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
