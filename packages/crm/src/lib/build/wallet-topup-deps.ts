// wallet top-up — the REAL (production) deps for createWalletTopupCheckout. Kept
// out of the pure module (and out of the "use server" action) so the unit tests
// never import a Stripe client. Mirrors marketplace/billing/real-deps.ts.
//
// getStripeClient() returns null without STRIPE_SECRET_KEY → the top-up stays
// inert (skips), so no Stripe call is reachable in dev/test.

import { getStripeClient } from "@seldonframe/payments";
import type {
  CreateWalletTopupCheckoutDeps,
  WalletTopupStripeSeam,
} from "@/lib/build/wallet-topup";

/** Build the production deps. Inert without a Stripe key (seam → null). */
export function buildWalletTopupCheckoutDeps(): CreateWalletTopupCheckoutDeps {
  return {
    getStripe: () => getStripeClient() as WalletTopupStripeSeam | null,
    env: process.env as Record<string, string | undefined>,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com",
    now: () => new Date(),
  };
}
