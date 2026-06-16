// packages/crm/src/app/start/_components/stripe-gate.tsx
// Shown when the agency has no active stripeConnections row.
// Reuses the same pattern as proposals/stripe-connect-empty-state.tsx.

import Link from "next/link";

export function StripeGate() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F2EA] px-6">
      <div className="max-w-md text-center space-y-5">
        <div className="text-4xl">💳</div>
        <h2 className="text-2xl font-bold text-foreground">
          Connect Stripe first
        </h2>
        <p className="text-muted-foreground text-sm">
          To accept live payments, your agency needs a connected Stripe account.
          This only takes a few minutes.
        </p>
        <Link
          href="/proposals/onboarding"
          className="inline-flex items-center justify-center rounded-md px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
          style={{ backgroundColor: "#B26B49" }}
        >
          Connect Stripe →
        </Link>
      </div>
    </div>
  );
}
