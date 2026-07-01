"use client";

// The Withdraw island on /build/wallet. Shows the withdrawable balance + a
// Withdraw button that calls the money-safe requestPayoutAction and renders the
// verdict. When not connected, links to Stripe Connect onboarding (reuses the
// proposal connect/start route — no new onboarding). No money math here; the
// server action is authoritative.

import { useState, useTransition } from "react";
import { requestPayoutAction } from "@/lib/build/payout-action";
import type { PayoutResult } from "@/lib/build/payout";

export function WalletWithdrawClient({
  withdrawableUsd,
  connected,
  minUsd,
}: {
  withdrawableUsd: number;
  connected: boolean;
  minUsd: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PayoutResult | null>(null);
  const [connecting, setConnecting] = useState(false);

  function withdraw() {
    startTransition(async () => {
      setResult(await requestPayoutAction());
    });
  }

  async function connectBank() {
    setConnecting(true);
    try {
      const res = await fetch("/api/v1/proposals/connect/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      if (data.url) window.location.href = data.url;
    } finally {
      setConnecting(false);
    }
  }

  const belowMin = withdrawableUsd < minUsd;
  const showConnect = !connected || result?.status === "connect_required";

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Withdrawable earnings</p>
          <p className="text-xl font-semibold tracking-tight text-foreground">
            ${withdrawableUsd.toFixed(2)}
          </p>
        </div>
        {showConnect ? (
          <button
            type="button"
            onClick={connectBank}
            disabled={connecting}
            className="crm-button-secondary h-9 px-4 text-sm disabled:opacity-60"
          >
            {connecting ? "Opening…" : "Connect your bank"}
          </button>
        ) : (
          <button
            type="button"
            onClick={withdraw}
            disabled={pending || belowMin}
            className="crm-button-primary h-9 px-4 text-sm disabled:opacity-60"
            title={belowMin ? `Minimum withdrawal is $${minUsd.toFixed(2)}` : undefined}
          >
            {pending ? "Withdrawing…" : "Withdraw"}
          </button>
        )}
      </div>

      {belowMin && !showConnect ? (
        <p className="text-xs text-muted-foreground">
          Minimum withdrawal is ${minUsd.toFixed(2)}. Earn a bit more, then withdraw.
        </p>
      ) : null}

      {result?.status === "paid" ? (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          ✓ Paid ${result.amountUsd.toFixed(2)} to your bank — arrives in ~2 business days.
        </p>
      ) : null}
      {result?.status === "below_min" ? (
        <p className="text-xs text-muted-foreground">
          You have ${result.withdrawableUsd.toFixed(2)} — the minimum is ${result.minUsd.toFixed(2)}.
        </p>
      ) : null}
      {result?.status === "disabled" ? (
        <p className="text-xs text-muted-foreground">Withdrawals aren&apos;t enabled on this workspace yet.</p>
      ) : null}
    </div>
  );
}
