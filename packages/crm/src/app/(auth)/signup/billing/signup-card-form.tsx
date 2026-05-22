// packages/crm/src/app/(auth)/signup/billing/signup-card-form.tsx
//
// 2026-05-22 — Client Component for step 2 of the new signup flow.
// Mounts Stripe's PaymentElement against a SetupIntent that the page's
// Server Component pre-provisioned, then on submit calls
// stripe.confirmSetup() and forwards the resulting PaymentMethod id to
// the Server Action that persists it on the user row.
//
// Why we duplicate the /pricing embedded-payment shape instead of
// reusing the file: that one binds to confirmFreeWithCardAction (which
// stamps planId='free') and is tightly coupled to the /pricing layout
// + sticky-CTA imperative handle. This signup variant has its own
// submit button, its own Server Action target, and forwards the
// payment-method id explicitly so the server side knows which PM to
// attach (instead of inferring it from the customer's saved cards).
//
// The visual style intentionally matches the rest of the (auth) layout
// — same fonts, same card chrome — so the visitor doesn't feel like
// they jumped surfaces between magic-link click and card collection.

"use client";

import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

import { confirmSignupCardAction } from "./actions";

// Module-level cache so re-renders don't reload Stripe.js (the
// PaymentElement provider explicitly warns against passing a new
// promise to <Elements> after first mount).
const stripePromiseCache = new Map<string, Promise<Stripe | null>>();
function getStripePromise(publishableKey: string): Promise<Stripe | null> {
  let promise = stripePromiseCache.get(publishableKey);
  if (!promise) {
    promise = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, promise);
  }
  return promise;
}

export type SignupCardFormProps = {
  publishableKey: string;
  clientSecret: string;
  /** Where to send the visitor after card confirmation. Pre-sanitized
   *  by the parent server component; we re-validate on the server side
   *  via sanitizeNextPath() before redirecting. */
  next: string;
};

export function SignupCardForm({ publishableKey, clientSecret, next }: SignupCardFormProps) {
  const stripePromise = getStripePromise(publishableKey);

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "night",
          variables: {
            colorPrimary: "rgb(20 184 166)",
            colorBackground: "rgba(255,255,255,0.02)",
            colorText: "rgb(245 245 245)",
            colorDanger: "rgb(248 113 113)",
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
            borderRadius: "10px",
          },
        },
      }}
    >
      <SignupCardFormInner next={next} />
    </Elements>
  );
}

function SignupCardFormInner({ next }: { next: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stripeReady, setStripeReady] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isServerActionPending, startTransition] = useTransition();
  const isPending = isConfirming || isServerActionPending;

  useEffect(() => {
    if (stripe && elements) setStripeReady(true);
  }, [stripe, elements]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setErrorMessage(null);
    setIsConfirming(true);

    try {
      // 1. Client-side validation (catches empty card number, etc.)
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setErrorMessage(submitError.message ?? "Please check the card details.");
        return;
      }

      // 2. Confirm the SetupIntent. `redirect: 'if_required'` keeps us
      //    on this page for most cards. 3DS challenges navigate to
      //    return_url; the server-side handler at /signup/billing will
      //    re-render with the same SetupIntent and the visitor can
      //    proceed.
      const { error: confirmError, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/signup/billing?next=${encodeURIComponent(next)}`,
        },
        redirect: "if_required",
      });

      if (confirmError) {
        setErrorMessage(
          confirmError.message ?? "Card couldn't be saved. Try a different card.",
        );
        return;
      }

      // 3. Extract the payment method id from the confirmed SetupIntent.
      //    `payment_method` is sometimes a string (id) and sometimes an
      //    expanded object — handle both shapes.
      const pmRaw = setupIntent?.payment_method ?? null;
      const paymentMethodId =
        typeof pmRaw === "string" ? pmRaw : pmRaw?.id ?? null;
      if (!paymentMethodId) {
        setErrorMessage("Stripe didn't return a payment method id. Try again.");
        return;
      }

      // 4. Fire the Server Action to persist the pm id + redirect to
      //    the next path. We POST via FormData so the action signature
      //    is symmetric with the skip-card variant.
      const formData = new FormData();
      formData.set("paymentMethodId", paymentMethodId);
      formData.set("next", next);

      startTransition(() => {
        void confirmSignupCardAction(formData);
      });
    } finally {
      setIsConfirming(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {errorMessage ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {errorMessage}
        </p>
      ) : null}

      <div className={stripeReady ? "" : "min-h-[220px] animate-pulse rounded-xl bg-muted/30"}>
        <PaymentElement options={{ layout: "tabs" }} />
      </div>

      <button
        type="submit"
        disabled={isPending || !stripeReady}
        className="crm-button-primary h-10 w-full px-4"
      >
        {isPending ? "Saving card…" : "Save card and continue"}
      </button>

      <p className="text-center text-xs text-[hsl(var(--color-text-secondary))]">
        We will <strong>not</strong> charge your card now. We collect it so future upgrades are one click.
        Cancel anytime from Settings &rarr; Billing.
      </p>
    </form>
  );
}
