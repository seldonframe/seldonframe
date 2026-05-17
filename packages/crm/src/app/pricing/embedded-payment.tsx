// packages/crm/src/app/pricing/embedded-payment.tsx
//
// 2026-05-17 — Embedded Stripe Payment Element for the /pricing card-on-
// file collection. Mounts when the Free tier is selected (and the
// publishable key is set in env). Wraps Stripe's <PaymentElement> in our
// app shell + theme so the Link + OTP + card + country selector all
// render inline instead of redirecting to Stripe's hosted Checkout.
//
// Lifecycle:
//   1. Parent renders <EmbeddedPayment publishableKey clientSecret /> ONCE
//      per session — the same clientSecret is reused across tier flips so
//      we don't churn SetupIntents on every Free→Growth→Free toggle.
//   2. We call loadStripe(publishableKey) at module level and memoize the
//      promise (Stripe.js requires a stable promise; re-loading on every
//      render leaks adapters).
//   3. <Elements options={{ clientSecret, appearance }}> mounts the
//      PaymentElement. The form is uncontrolled — Stripe owns the DOM
//      for PCI compliance.
//   4. Parent triggers `submit()` via the imperative ref when the sticky
//      bottom CTA is clicked. We confirmSetup() and either:
//        - on success: dispatch the Server Action that stamps planId=free
//          and redirects to /dashboard
//        - on error: surface the message inline above the form

"use client";

import { useEffect, useImperativeHandle, useState, useTransition, type Ref } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { confirmFreeWithCardAction } from "./_actions";

/**
 * Memoize the Stripe promise per publishable key. Re-loading on every
 * render breaks the Elements provider — Stripe.js explicitly warns
 * against passing a new promise to <Elements> after first mount.
 */
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();

function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  let promise = stripePromiseCache.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, promise);
  }
  return promise;
}

export type EmbeddedPaymentHandle = {
  /** Triggered by the parent's sticky CTA. Confirms the SetupIntent, and
   *  on success calls the Server Action that stamps planId and redirects. */
  submit: () => Promise<void>;
  /** True while a confirmSetup or Server Action is in flight. Parent uses
   *  this to disable the sticky CTA + label it "Saving…". */
  isPending: boolean;
};

type Props = {
  publishableKey: string;
  clientSecret: string;
  /** Optional ref so the parent can call submit() from its sticky CTA. */
  handleRef?: Ref<EmbeddedPaymentHandle | null>;
};

export function EmbeddedPayment({ publishableKey, clientSecret, handleRef }: Props) {
  const stripePromise = getStripePromise(publishableKey);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          // `night` matches our dark-by-default app shell. Stripe also
          // applies our `--primary` to its accent color via variables so
          // the inline form doesn't visually fight the rest of /pricing.
          theme: "night",
          variables: {
            colorPrimary: "rgb(0 200 170)",
            colorBackground: "rgba(255,255,255,0.02)",
            colorText: "rgb(245 245 245)",
            colorDanger: "rgb(248 113 113)",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            borderRadius: "10px",
          },
        },
      }}
    >
      <PaymentFormInner handleRef={handleRef} />
    </Elements>
  );
}

function PaymentFormInner({
  handleRef,
}: {
  handleRef?: Ref<EmbeddedPaymentHandle | null>;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  // useTransition wraps the Server Action so React can pause the UI
  // between the Stripe confirmation and the server-side redirect without
  // flashing a partially-disabled state.
  const [isServerActionPending, startTransition] = useTransition();
  const [isConfirming, setIsConfirming] = useState(false);
  const isPending = isConfirming || isServerActionPending;

  // Submit handler — called either by the form's own onSubmit OR by the
  // parent via the imperative handle.
  async function submit() {
    if (!stripe || !elements) return;
    setErrorMessage(null);
    setIsConfirming(true);

    try {
      // elements.submit() validates the form client-side before any
      // network call. Returns early with a field-level error if e.g. the
      // card number is blank.
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setErrorMessage(submitError.message ?? "Please check the card details.");
        return;
      }

      // confirmSetup attaches the card to the customer + completes the
      // SetupIntent. `redirect: 'if_required'` keeps us on /pricing for
      // most cards; only 3DS challenges navigate away (and Stripe sends
      // us back to return_url after).
      const { error: confirmError } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          // Operators who do hit 3DS land back here; the on-page handler
          // will detect ?setup_intent in the URL and re-fire the
          // confirmation server-side. For MVP we just send them to
          // /dashboard since the SetupIntent is already attached by the
          // time Stripe redirects.
          return_url: `${window.location.origin}/dashboard`,
        },
        redirect: "if_required",
      });

      if (confirmError) {
        setErrorMessage(confirmError.message ?? "Card couldn't be saved. Try a different card.");
        return;
      }

      // No client-side error → card is now attached. Fire the Server
      // Action to stamp planId + redirect. startTransition keeps the
      // sticky CTA's "Saving…" label active until the redirect lands.
      startTransition(() => {
        void confirmFreeWithCardAction();
      });
    } finally {
      setIsConfirming(false);
    }
  }

  // Expose submit() to the parent so the sticky bottom CTA can drive it.
  useImperativeHandle(
    handleRef,
    () => ({
      submit,
      isPending,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stripe, elements, isPending],
  );

  // Mark "ready" when both stripe + elements have resolved. Used to hide
  // the loading shimmer below.
  useEffect(() => {
    if (stripe && elements) setStripeReady(true);
  }, [stripe, elements]);

  return (
    <div className="space-y-3">
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}

      {/* PaymentElement renders Stripe's full inline form: Link login
          option, saved-method picker, card number, expiry, CVC, country.
          We don't wrap it in <form> because the parent's sticky CTA is
          what drives submission via the imperative handle. */}
      <div className={stripeReady ? "" : "min-h-[260px] animate-pulse rounded-xl bg-muted/30"}>
        <PaymentElement options={{ layout: "tabs" }} />
      </div>
    </div>
  );
}
