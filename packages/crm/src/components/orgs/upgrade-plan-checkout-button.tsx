"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";

export function UpgradePlanCheckoutButton() {
  const [upgradePending, setUpgradePending] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);

  async function openUpgradeCheckout() {
    try {
      setUpgradePending(true);
      setUpgradeError(null);

      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: "price_1TMC7UJOtNZA0x7xNrl2VDVE",
          quantity: 1,
          successPath: "/orgs/new?upgrade=success",
          cancelPath: "/orgs/new",
        }),
      });

      const payload = await response.json();

      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? "Failed to open checkout");
      }

      window.location.href = payload.url;
    } catch (error) {
      setUpgradeError(error instanceof Error ? error.message : "Failed to open Stripe checkout.");
      setUpgradePending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={() => void openUpgradeCheckout()}
        disabled={upgradePending}
        className="crm-button-secondary h-10 px-4 inline-flex items-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        {upgradePending ? (
          <span className="inline-flex items-center gap-2">
            <LoaderCircle className="size-4 animate-spin" />
            <span>Opening secure checkout...</span>
          </span>
        ) : (
          "Upgrade Plan"
        )}
      </button>
      {upgradeError ? <p className="text-sm text-muted-foreground">{upgradeError}</p> : null}
    </div>
  );
}
