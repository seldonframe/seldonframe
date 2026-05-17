// packages/crm/src/app/pricing/pricing-picker.tsx
//
// 2026-05-17 — Postiz-style interactive plan picker.
//
// Three behaviors live here that the previous server-only version couldn't
// support:
//
//   1. Plan cards are minimal (name + price). NO inline feature bullets,
//      NO per-card CTA button. Clicking a card SELECTS it.
//   2. A single "What you get" panel below the cards swaps its contents
//      based on the selected tier — instead of stuffing 6 features into
//      every card, all features for the chosen tier appear once, in one
//      place, with breathing room. Cuts surface count in half vs commit 1.
//   3. The sticky bottom CTA reflects the selected tier — copy + button
//      label change so the user never sees two competing actions.
//
// Why a Client Component:
//   useState for selectedId. The page.tsx Server Component still owns the
//   hero, trust signals, FAQ, and the auth() check. We only inject this
//   picker into the right column.
//
// Auth handoff:
//   The Server Component reads session.user once and passes `isAuthed`
//   down. The Free CTA uses the Server Action from ./_actions.ts; paid
//   CTAs link out to /signup or /settings/billing where the existing
//   Stripe Checkout flow takes over. Commit 2 swaps the paid links for
//   an inline Stripe Payment Element below the picker.

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

type StripeBundle = {
  publishableKey: string;
  clientSecret: string;
};

type PricingPickerProps = {
  isAuthed: boolean;
  /**
   * SetupIntent bundle provisioned server-side in page.tsx. Present iff
   * the user is authed AND NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY +
   * STRIPE_SECRET_KEY are both set. When present, the Free tier flow
   * mounts an inline Stripe PaymentElement so the operator can save a
   * card on file as part of signup (the card is never charged on Free —
   * see lib/billing/setup-intent.ts header). When null, we fall back to
   * the 1-click no-card Free flow via selectFreeTierAction.
   */
  stripe?: StripeBundle | null;
};

export function PricingPicker({ isAuthed, stripe = null }: PricingPickerProps) {
  // Default to Growth — it's marked Recommended, and that's the conversion
  // goal. Free is one click away on the leftmost card.
  const [selectedId, setSelectedId] = useState<TierId>("growth");
  const reduceMotion = useReducedMotion();
  const selected = TIERS.find((t) => t.id === selectedId) ?? TIERS[0];
  // Imperative handle into the embedded PaymentElement. Lets the sticky
  // bottom CTA trigger confirmSetup() without each click bubbling through
  // React state changes. Ref is null when Stripe isn't configured (or
  // when a non-Free tier is selected — we only mount the form on Free).
  const paymentHandleRef = useRef<EmbeddedPaymentHandle | null>(null);

  const isFreeWithCardCapture = selected.id === "free" && isAuthed && stripe;

  return (
    <>
      <div className="space-y-6">
        {/* Plan toggle. Yearly chip is presentational until we wire yearly
            SKUs; clicking it does nothing. Tooltip explains. */}
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

        {/* Plan cards — stripped to name + price only. Clicking selects.
            The selected card gets a primary ring + a check badge. */}
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
                {/* Subtle "selected" affordance — a primary check at the
                    bottom of the card so the eye can scan the row and tell
                    which card is active without re-reading borders. */}
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

        {/* Features panel — swaps when the selected tier changes. The key
            on AnimatePresence forces a unmount/mount cycle so the new
            list fades in cleanly instead of cross-fading row-by-row. */}
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

        {/* Embedded Stripe Payment Element — renders only when Free is
            selected, the user is authed, AND server-side SetupIntent
            provisioning succeeded (publishable key set + Stripe configured).
            Card is never charged; saved off_session so a future Growth/
            Scale upgrade is one click. Paid tiers skip this and use the
            existing Stripe Checkout redirect (set up in the sticky CTA
            below) since we haven't wired embedded subscription confirmation
            yet — that's a follow-up commit.

            For other tiers, the slot collapses cleanly (returns null)
            instead of leaving an empty box. */}
        {isFreeWithCardCapture ? (
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
      </div>

      {/* Sticky bottom CTA — copy + button reflect the SELECTED tier. The
          fixed position escapes the page grid so it spans full viewport
          width. z-40 keeps it under modals (z-50). When the embedded
          payment form is present, the sticky CTA drives confirmSetup()
          via the imperative handle instead of dispatching the bare
          Server Action. */}
      <PricingStickyBar
        selected={selected}
        isAuthed={isAuthed}
        hasEmbeddedPayment={Boolean(isFreeWithCardCapture)}
        onEmbeddedSubmit={() => paymentHandleRef.current?.submit()}
      />
    </>
  );
}

type StickyBarProps = {
  selected: Tier;
  isAuthed: boolean;
  /** True when the embedded PaymentElement is mounted (Free + authed +
   *  Stripe configured). The CTA then drives confirmSetup() instead of
   *  the bare planId-stamp Server Action. */
  hasEmbeddedPayment: boolean;
  /** Imperative trigger into the embedded form's submit handler. No-op
   *  when hasEmbeddedPayment is false. */
  onEmbeddedSubmit: () => void;
};

function PricingStickyBar({
  selected,
  isAuthed,
  hasEmbeddedPayment,
  onEmbeddedSubmit,
}: StickyBarProps) {
  const [submitting, setSubmitting] = useState(false);

  // Copy varies by (tier, embedded-form presence). When the embedded form
  // is on, Free copy nods to the card-on-file so the operator understands
  // why they're entering payment details for a $0 plan.
  const detail = (() => {
    if (selected.id === "free") {
      return hasEmbeddedPayment
        ? "Save a card now — never charged on Free. One-click upgrades later."
        : "Your first workspace is always free — no card to start. Cancel anytime.";
    }
    return `${selected.price}${selected.cadence} · cancel anytime from Settings`;
  })();

  const ctaLabel = (() => {
    if (selected.id === "free") {
      if (hasEmbeddedPayment) {
        return submitting ? "Saving card…" : "Save card & continue →";
      }
      return isAuthed ? "Continue with Free →" : "Start free →";
    }
    return isAuthed ? `Subscribe to ${selected.name} →` : `Start ${selected.name} →`;
  })();

  const paidHref = isAuthed
    ? `/settings/billing?plan=${selected.id}`
    : `/signup?plan=${selected.id}`;

  async function handleEmbeddedClick() {
    if (submitting) return;
    setSubmitting(true);
    try {
      await Promise.resolve(onEmbeddedSubmit());
    } finally {
      // Don't unset on success path — the Server Action redirects away,
      // and we want the "Saving card…" label to stick until then. Only
      // unset if we're still on the page after a short delay (error case
      // where confirmSetup surfaced an inline error).
      setTimeout(() => setSubmitting(false), 600);
    }
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
      <div className="pointer-events-auto border-t border-border/70 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:px-6">
          <p className="text-center text-sm text-muted-foreground sm:text-left">{detail}</p>
          {hasEmbeddedPayment ? (
            // Embedded path: drive the Stripe confirmation imperatively
            // so the button stays in the sticky bar (matches the Postiz
            // pattern where the bottom CTA confirms the inline form).
            <button
              type="button"
              onClick={handleEmbeddedClick}
              disabled={submitting}
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
          ) : (
            <Link
              href={selected.id === "free" ? "/signup" : paidHref}
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
