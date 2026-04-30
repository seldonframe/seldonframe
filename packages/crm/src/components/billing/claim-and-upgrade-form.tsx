"use client";

import { useState } from "react";
import { Sparkles, Mail, ChevronRight, AlertCircle } from "lucide-react";

/**
 * P0-2: claim-and-upgrade form for guest (admin-token) workspaces.
 *
 * Shown only on `/settings/billing` when the session is admin-token
 * (i.e. operator hasn't signed up yet). Collects email + tier selection
 * → POSTs to /api/v1/billing/claim-and-checkout → server creates a
 * `users` row + sets `organizations.ownerId` + Stripe Checkout session
 * (multi-price: base + metered overages) → response carries the
 * checkout URL → we redirect.
 *
 * April 30, 2026 — pricing migration. Tier options are Growth / Scale
 * (Free has no Stripe checkout; the operator stays on the guest
 * workspace until they need to upgrade). The server assembles the
 * subscription's line_items from the `tier` field — no priceId here,
 * so the marketing page and this form stay in sync.
 */

interface TierChoice {
  id: "growth" | "scale";
  label: string;
  price: string;
  blurb: string;
  highlight?: boolean;
}

const TIERS: TierChoice[] = [
  {
    id: "growth",
    label: "Growth",
    price: "$29/mo + usage",
    blurb:
      "3 workspaces · 500 contacts + 1,000 runs included · custom domain · client portal · no SeldonFrame branding",
    highlight: true,
  },
  {
    id: "scale",
    label: "Scale",
    price: "$99/mo + usage",
    blurb:
      "Unlimited workspaces · unlimited contacts · agent runs $0.02 each · full white-label · priority support",
  },
];

export function ClaimAndUpgradeForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [selectedTier, setSelectedTier] = useState<"growth" | "scale">("growth");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

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
          tier: selectedTier,
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
            You&apos;re on a guest workspace. To upgrade, enter your email below — we&apos;ll claim
            the workspace under that account, then take you to Stripe.
          </p>
        </div>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        {/* Tier picker */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wide font-medium text-muted-foreground mb-2">
            Choose a plan
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {TIERS.map((tier) => {
              const checked = selectedTier === tier.id;
              return (
                <label
                  key={tier.id}
                  className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                    checked
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="tier"
                    value={tier.id}
                    checked={checked}
                    onChange={() => setSelectedTier(tier.id)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-sm text-foreground">{tier.label}</span>
                    {tier.highlight ? (
                      <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <p className="text-base font-semibold text-foreground">{tier.price}</p>
                  <p className="mt-1 text-xs text-muted-foreground leading-snug">{tier.blurb}</p>
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
            We&apos;ll send the receipt + login link here. You can set a password later.
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
            Billed monthly · cancel anytime
          </p>
        </div>
      </form>
    </div>
  );
}
