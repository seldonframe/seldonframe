"use client";

// packages/crm/src/app/(dashboard)/proposals/stripe-pending-banner.tsx
// 2026-05-20 — Amber banner shown while Stripe is verifying the agency's
// Connect account (chargesEnabled = false but a row exists). Also used for
// the ?status=pending flash after the Stripe return redirect.
//
// 2026-05-21 — Added "Reconnect" escape hatch. If the operator deleted
// their account in Stripe Dashboard, or onboarded with the wrong country,
// the pending banner used to be a dead-end — there was no way to start
// over without manual DB intervention. The Reconnect button calls
// /api/v1/proposals/connect/start?reset=1 which forces create-new.

import { useState } from "react";

export function StripePendingBanner() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleReconnect() {
    setLoading(true);
    setError(null);
    try {
      // Reset path: pass ?reset=1 to force a fresh account.create call
      // ignoring the existing stripe_connections row.
      const res = await fetch("/api/v1/proposals/connect/start?reset=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Default to US for the reconnect; operator can pick a different
        // country from the empty-state hero if they delete the row another
        // way. Most operators on this path are completing existing onboarding.
        body: JSON.stringify({ country: "US" }),
      });
      let data: { url?: string; error?: string; message?: string; help?: string };
      try {
        data = await res.json();
      } catch {
        data = { error: `non_json_response_${res.status}` };
      }
      if (!res.ok || !data.url) {
        const parts = [data.message ?? data.error ?? `reconnect_failed_${res.status}`];
        if (data.help) parts.push(data.help);
        throw new Error(parts.join(" — "));
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "reconnect_failed");
      setLoading(false);
    }
  }

  return (
    <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
      <div className="flex-1 space-y-2">
        <p className="text-sm font-medium text-amber-700">Stripe is verifying your account</p>
        <p className="text-xs text-muted-foreground">
          Usually 10–30 minutes. You can draft proposals now; the Send button unlocks once Stripe
          verifies (charges enabled).
        </p>
        <p className="text-xs text-muted-foreground">
          Deleted your Stripe account or want to start over?{" "}
          <button
            type="button"
            onClick={handleReconnect}
            disabled={loading}
            className="text-amber-700 underline underline-offset-2 hover:text-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Opening Stripe…" : "Reconnect"}
          </button>
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </section>
  );
}
