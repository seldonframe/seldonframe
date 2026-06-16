"use client";
// packages/crm/src/app/start/_components/step2-checkout.tsx
// Step 2 of the /start live-sell checkout.
// Renders Stripe Embedded Checkout (EmbeddedCheckoutProvider + EmbeddedCheckout)
// using the client_secret from the Step 1 server action.
//
// For Connect: pass stripeAccount to loadStripe as documented at
// https://stripe.com/docs/stripe-js/initializing#connect-js
// The agency's connected account id is passed to loadStripe as options.stripeAccount.
// This is different from the EmbeddedCheckoutProvider — it's Stripe.js that needs
// the connected account, not the React component.

import { useMemo } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import type { LiveSellCheckoutResult } from "../actions";

type Step2CheckoutProps = {
  checkout: LiveSellCheckoutResult;
};

export function Step2Checkout({ checkout }: Step2CheckoutProps) {
  // loadStripe must be called with the connected account id via options.stripeAccount
  // so that the embedded checkout form renders in the context of the agency's
  // Stripe account. The publishable key is the PLATFORM key (our key), and
  // stripeAccount is the connected account. This matches the Stripe docs for
  // Connect with Embedded Checkout.
  const stripePromise = useMemo(
    () =>
      loadStripe(checkout.publishableKey, {
        stripeAccount: checkout.stripeAccount,
      }),
    // Stable per session (these values don't change between renders).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [checkout.publishableKey, checkout.stripeAccount],
  );

  // EmbeddedCheckoutProvider accepts a fetchClientSecret callback OR a clientSecret.
  // We use fetchClientSecret (the recommended path) wrapping our already-resolved secret.
  const options = useMemo(
    () => ({
      fetchClientSecret: async () => checkout.clientSecret,
    }),
    [checkout.clientSecret],
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Payment</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Enter card details. Payment is processed securely via Stripe.
        </p>
      </div>

      <div className="min-h-96 w-full">
        <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
    </div>
  );
}
