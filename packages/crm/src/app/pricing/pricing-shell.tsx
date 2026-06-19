// packages/crm/src/app/pricing/pricing-shell.tsx
//
// Interactive /pricing layout: hero + trust signals on the LEFT, plan
// picker + features panel on the RIGHT, sticky CTA at the BOTTOM.
//
// 2026-06-18 pricing migration (Phase 3): the ladder is Builder $19 /
// Workspace $49 / Agency $297 — three flat, paid tiers. There is NO free
// tier anymore, so every tier goes through Stripe-hosted Checkout (no
// embedded SetupIntent "save a card on Free" form). Each card POSTs
// `{ tier }` to /api/stripe/checkout and redirects to the returned URL.

"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

type TierId = "builder" | "workspace" | "agency";

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
    id: "builder",
    name: "Builder",
    price: "$19",
    cadence: "/ mo",
    tagline: "Launch landing pages on your own domain.",
    features: [
      "Up to 10 landing pages",
      "Your own custom domain",
      "No SeldonFrame branding",
      "Managed AI page generation",
      "Email support",
    ],
  },
  {
    id: "workspace",
    name: "Workspace",
    price: "$49",
    cadence: "/ mo",
    tagline: "One complete business OS, fully wired.",
    featured: true,
    features: [
      "1 full client workspace",
      "Website, booking, intake & CRM",
      "AI chatbot included",
      "Custom domain · client portal",
      "Email support",
    ],
  },
  {
    id: "agency",
    name: "Agency",
    price: "$297",
    cadence: "/ mo",
    tagline: "White-label the platform for your clients.",
    features: [
      "10 client workspaces included",
      "+$10/mo per workspace beyond 10",
      "Full white-label platform",
      "Marketplace access",
      "Priority support",
    ],
  },
];

type PricingShellProps = {
  isAuthed: boolean;
};

export function PricingShell({ isAuthed }: PricingShellProps) {
  // Default to Workspace — it's the conversion goal (the full business OS).
  const [selectedId, setSelectedId] = useState<TierId>("workspace");
  // Errors from /api/stripe/checkout. Inline error surface lives in the
  // sticky bar so it doesn't shove the page down.
  const [paidError, setPaidError] = useState<string | null>(null);
  // True while the sticky CTA is fetching the Checkout Session url.
  const [paidStarting, setPaidStarting] = useState(false);
  const reduceMotion = useReducedMotion();

  const selected = TIERS.find((t) => t.id === selectedId) ?? TIERS[0];

  const trustSignals = [
    "One flat monthly price — no metered bills",
    "Cancel anytime in Settings",
    "Roughly 5× cheaper than GoHighLevel",
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
                        Popular
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

      {/* Sticky bottom CTA — copy + button reflect the selected tier. All
          tiers are paid: POST /api/stripe/checkout + redirect to the
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

  const ctaLabel = (() => {
    if (paidStarting) return "Redirecting to Stripe…";
    return isAuthed ? `Subscribe to ${selected.name} →` : `Start ${selected.name} →`;
  })();

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
