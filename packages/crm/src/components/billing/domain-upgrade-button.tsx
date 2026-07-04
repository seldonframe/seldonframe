"use client";

// 2026-07-04 — Task 9 of the win-ladder + SeldonChat plan. Replaces the
// domain settings UpsellCard's old /signup/billing?next=... link (a
// standalone card-collection flow) with a direct Stripe Checkout CTA for
// the real $29/mo Growth tier, mirroring the fetch shape
// app/pricing/pricing-shell.tsx:103 uses against the SAME existing
// /api/stripe/checkout route — no new Stripe surface, no new price id.
//
// MONEY-SAFE: tier: "workspace" is the only tier value this button ever
// sends; the checkout route resolves it server-side to GROWTH_BASE_PRICE_ID
// (an already-allowlisted price — see isAllowedCheckoutPriceId in
// lib/billing/price-ids.ts), so there is nothing here for a client to
// smuggle in.

import { useState } from "react";
import { ArrowRight } from "lucide-react";

export function DomainUpgradeButton({ successPath }: { successPath: string }) {
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier: "workspace",
          successPath,
          cancelPath: "/settings/domain",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error ?? "Couldn't start checkout. Try again in a moment.");
    } catch {
      setError("Couldn't reach Stripe. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button
        type="button"
        onClick={startCheckout}
        disabled={starting}
        className="crm-button-primary inline-flex h-10 items-center gap-1.5 px-4 text-sm font-semibold disabled:opacity-60"
      >
        {starting ? "Starting checkout…" : "Unlock your domain — $29/mo"}
        {!starting ? <ArrowRight className="size-4" aria-hidden="true" /> : null}
      </button>
      <p className="text-xs text-muted-foreground">One booked job pays for the year.</p>
      {error ? <p className="w-full text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
