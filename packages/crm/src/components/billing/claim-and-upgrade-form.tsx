"use client";

import { useState } from "react";
import { Sparkles, Mail, ChevronRight, AlertCircle } from "lucide-react";

/**
 * P0-2: claim-and-upgrade form for guest (admin-token) workspaces.
 *
 * Shown only on `/settings/billing` when the session is admin-token
 * (i.e. operator hasn't signed up yet). Collects email + plan selection
 * → POSTs to /api/v1/billing/claim-and-checkout → server creates a
 * `users` row + sets `organizations.ownerId` + Stripe Checkout session
 * → response carries the checkout URL → we redirect.
 *
 * Three plan options match the public /pricing page tiers. Hardcoded
 * price IDs because they're the same across environments and the
 * server validates them via `isAllowedCheckoutPriceId` either way.
 */

interface PlanChoice {
  id: string;
  priceId: string;
  label: string;
  price: string;
  blurb: string;
  highlight?: boolean;
}

// Plan blurbs are entitlement-based, NOT volume-based. SeldonFrame doesn't
// meter contacts or emails — so "500 contacts, 1k emails/mo" was always
// a copy bug. The real upgrade levers are: number of workspaces, custom
// domain, white-label, full Brain v2 / Seldon It, support tier.
const PLANS: PlanChoice[] = [
  {
    id: "starter",
    priceId: "price_1TQzh7JOtNZA0x7xLOTicHkW",
    label: "Cloud Starter",
    price: "$49/mo",
    blurb: "1 workspace, all core blocks, community support",
  },
  {
    id: "pro",
    priceId: "price_1TNY81JOtNZA0x7xsulCSP6x",
    label: "Cloud Pro",
    price: "$99/mo",
    blurb: "Custom domain, remove SeldonFrame branding, priority support",
    highlight: true,
  },
  {
    id: "agency",
    priceId: "price_1TQzjrJOtNZA0x7xV4UFxWrH",
    label: "Cloud Agency",
    price: "$149/mo",
    blurb: "3 workspaces, full Brain v2, white-label client portals",
  },
];

export function ClaimAndUpgradeForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<string>("pro");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const plan = PLANS.find((p) => p.id === selectedPlan);
    if (!plan) {
      setError("Pick a plan to upgrade.");
      return;
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setError("Enter a valid email.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/billing/claim-and-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: name.trim() || undefined,
          priceId: plan.priceId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        if (data.code === "email_taken") {
          setError(
            "An account with that email already exists. Sign in at /login and manage your subscription from there."
          );
        } else if (data.code === "workspace_already_claimed") {
          setError(
            "This workspace is already attached to an account. Sign in to manage its subscription."
          );
        } else {
          setError(data.error || "Could not start checkout. Try again.");
        }
        setSubmitting(false);
        return;
      }
      window.location.assign(data.url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Upgrade this workspace</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            You're on a guest workspace. To upgrade, enter your email below — we'll claim
            the workspace under that account, then take you to Stripe.
          </p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Plan picker */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wide font-medium text-muted-foreground mb-2">
            Choose a plan
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {PLANS.map((plan) => {
              const checked = selectedPlan === plan.id;
              return (
                <label
                  key={plan.id}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="plan"
                    value={plan.id}
                    checked={checked}
                    onChange={() => setSelectedPlan(plan.id)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-foreground">{plan.label}</span>
                    {plan.highlight ? (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <p className="text-base font-semibold text-foreground">{plan.price}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-snug">{plan.blurb}</p>
                </label>
              );
            })}
          </div>
        </fieldset>

        {/* Email */}
        <div>
          <label htmlFor="claim-email" className="block text-xs uppercase tracking-wide font-medium text-muted-foreground mb-1.5">
            Your email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              id="claim-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            We'll send the receipt + login link here. You can set a password later.
          </p>
        </div>

        {/* Optional name */}
        <div>
          <label htmlFor="claim-name" className="block text-xs uppercase tracking-wide font-medium text-muted-foreground mb-1.5">
            Your name <span className="text-muted-foreground/60 normal-case tracking-normal">(optional)</span>
          </label>
          <input
            id="claim-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="crm-button-primary inline-flex h-11 items-center gap-1.5 px-5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Redirecting to Stripe…" : "Continue to checkout"}
            {!submitting ? <ChevronRight className="h-4 w-4" /> : null}
          </button>
          <p className="text-xs text-muted-foreground">
            Billed monthly via Stripe · cancel anytime
          </p>
        </div>
      </form>
    </div>
  );
}
