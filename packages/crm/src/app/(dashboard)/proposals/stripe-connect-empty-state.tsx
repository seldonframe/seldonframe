"use client";

// packages/crm/src/app/(dashboard)/proposals/stripe-connect-empty-state.tsx
// 2026-05-20 — Inline Stripe Connect hero, shown when the agency has no
// stripe_connections row. Replaces the /proposals/onboarding dedicated page
// as the primary entry point for Stripe setup.

import { useState } from "react";
import { Button } from "@/components/ui/button";

type SupportedCountry = "US" | "CA" | "GB" | "AU";

const COUNTRY_LABELS: Record<SupportedCountry, string> = {
  US: "🇺🇸 United States",
  CA: "🇨🇦 Canada",
  GB: "🇬🇧 United Kingdom",
  AU: "🇦🇺 Australia",
};

export function StripeConnectEmptyState() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [country, setCountry] = useState<SupportedCountry>("US");

  async function handleConnect() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/proposals/connect/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country }),
      });
      let data: { url?: string; error?: string; message?: string; help?: string };
      try {
        data = await res.json();
      } catch {
        data = { error: `non_json_response_${res.status}` };
      }
      if (!res.ok || !data.url) {
        const parts = [data.message ?? data.error ?? `connect_start_failed_${res.status}`];
        if (data.help) parts.push(data.help);
        throw new Error(parts.join(" — "));
      }
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "connect_start_failed");
      setLoading(false);
    }
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card/40 p-12 text-center space-y-4 max-w-2xl mx-auto">
      <h2 className="text-2xl font-semibold tracking-tight">Send proposals, get paid</h2>
      <p className="text-muted-foreground max-w-md mx-auto">
        Generate branded proposals with a live workspace included. Prospects pay you directly via
        Stripe — SeldonFrame takes 0%.
      </p>
      <div className="flex flex-col items-center gap-1">
        <label htmlFor="stripe-connect-country" className="text-sm font-medium text-foreground">
          Country
        </label>
        <select
          id="stripe-connect-country"
          value={country}
          onChange={(e) => setCountry(e.target.value as SupportedCountry)}
          disabled={loading}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 min-w-48"
        >
          {(Object.entries(COUNTRY_LABELS) as [SupportedCountry, string][]).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <Button onClick={handleConnect} disabled={loading} size="lg">
        {loading ? "Opening Stripe..." : `Connect Stripe (${COUNTRY_LABELS[country].replace(/^\S+\s/, "")})`}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
