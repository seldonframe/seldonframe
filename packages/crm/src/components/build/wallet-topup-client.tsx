"use client";

// Wallet top-up island — the "Add funds" buttons on /build/wallet (spec
// 1ff09dcb, P2). The ONLY interactive surface on that page; the balance + ledger
// are server-rendered. Clicking a preset calls topUpWalletAction({ amountCents })
// and redirects the browser to the returned Stripe Checkout URL. On a skipped
// result (flag off / no Stripe key in dev) it surfaces the reason inline instead
// of redirecting — money-safe: nothing is charged, the user just sees why.

import { useState, useTransition } from "react";
import { topUpWalletAction } from "@/lib/build/wallet-topup-action";

const PRESETS_CENTS = [1000, 2500, 5000, 10000] as const;

function reasonCopy(reason: string): string {
  switch (reason) {
    case "billing_disabled":
      return "Wallet top-ups aren't enabled in this environment yet.";
    case "stripe_unconfigured":
      return "Payments aren't configured here, so top-ups are disabled.";
    case "unauthorized":
      return "Sign in to add funds.";
    case "invalid_amount":
      return "Pick a valid amount.";
    default:
      return "Couldn't start the top-up. Try again.";
  }
}

export function WalletTopupClient() {
  const [pending, startTransition] = useTransition();
  const [busyCents, setBusyCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const topUp = (amountCents: number) => {
    setError(null);
    setBusyCents(amountCents);
    startTransition(async () => {
      try {
        const res = await topUpWalletAction({ amountCents });
        if (res.ok) {
          window.location.href = res.url;
          return;
        }
        setError(reasonCopy(res.reason));
      } catch {
        setError("Couldn't start the top-up. Try again.");
      } finally {
        setBusyCents(null);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {PRESETS_CENTS.map((cents) => (
          <button
            key={cents}
            type="button"
            disabled={pending}
            onClick={() => topUp(cents)}
            className="crm-button-primary inline-flex h-10 items-center px-5 disabled:opacity-60"
          >
            {busyCents === cents ? "Starting…" : `Add $${(cents / 100).toFixed(0)}`}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
