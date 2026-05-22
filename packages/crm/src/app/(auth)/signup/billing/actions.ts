// packages/crm/src/app/(auth)/signup/billing/actions.ts
//
// 2026-05-22 — Server Actions for the card-collection step (step 2 of the
// new two-step signup). Three responsibilities:
//
//   1. createSignupSetupIntentAction — called on page mount to provision
//      a Stripe SetupIntent for the embedded PaymentElement. Returns
//      { ok, clientSecret, publishableKey } so the client can mount.
//   2. confirmSignupCardAction — called after stripe.confirmSetup()
//      resolves successfully. Records the payment method on the user
//      row, then redirects to the next= path (which is /clients/new
//      with the prefill query intact).
//   3. skipSignupCardAction — escape hatch for visitors who land on
//      /signup/billing in an environment without Stripe keys (we can't
//      block them indefinitely). Logs the skip + redirects to next=.
//
// All three are server-only and gated through auth() — a visitor who
// somehow lands on /signup/billing without a session gets redirected
// to /signup with a hint to start over.

"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { assertWritable } from "@/lib/demo/server";
import {
  provisionSetupIntent,
  attachPaymentMethodToUser,
  type SetupIntentResult,
} from "@/lib/billing/setup-intent";
import { sanitizeNextPath } from "@/lib/auth/signup-redirect";

export type SignupSetupIntentResult = SetupIntentResult;

/**
 * Provision a Stripe SetupIntent for the signup-time card collector.
 * Mirrors the /pricing flow but is parameterized for the signup surface
 * so analytics can attribute card-on-file rates to the right entry point.
 *
 * Returns the same discriminated union so the client can render a
 * graceful fallback (skip-card-and-continue) when Stripe isn't
 * configured in this environment.
 */
export async function createSignupSetupIntentAction(): Promise<SignupSetupIntentResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, reason: "no_user" };
  }
  return provisionSetupIntent(session.user.id);
}

/**
 * Called from the Client Component after stripe.confirmSetup() resolves
 * with a PaymentMethod id. Records it on the user row (sets the Stripe
 * customer's default_payment_method as a side effect) and redirects to
 * the validated next path.
 *
 * IMPORTANT: this does NOT start a subscription. The card is on file;
 * billing kicks in either at first-workspace-create (handled elsewhere)
 * or at explicit tier upgrade via the /pricing or /settings/billing
 * flow. The boundary is intentional — promises in the marketing FAQ
 * "we ask for a card at sign-up so you can build live workspaces without
 * artificial trial limits" — there's no charge until the operator
 * graduates to a paying tier.
 */
export async function confirmSignupCardAction(formData: FormData): Promise<never> {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signup");
  }

  const paymentMethodId = String(formData.get("paymentMethodId") ?? "").trim();
  const nextPath = sanitizeNextPath(formData.get("next"));

  if (!paymentMethodId) {
    // Treat as a soft failure — the client must always pass the pm id
    // returned by stripe.confirmSetup(). If we get here without one,
    // something went wrong on the client side; route them to /clients/new
    // anyway so they aren't stuck on this page.
    console.warn(
      JSON.stringify({
        event: "signup_card_confirm_missing_pm_id",
        user_id: session.user.id,
      }),
    );
    redirect(nextPath);
  }

  const attachResult = await attachPaymentMethodToUser({
    userId: session.user.id,
    paymentMethodId,
  });

  // Telemetry — attribute conversions to the signup card-on-file path
  // separately from the /pricing one. Logged whether attach succeeded
  // or not so the failure rate is visible.
  console.log(
    JSON.stringify({
      event: "signup_card_confirm",
      user_id: session.user.id,
      ok: attachResult.ok,
      reason: attachResult.ok ? null : attachResult.reason,
      next: nextPath,
    }),
  );

  // Even on attach failure we still redirect to next — the user already
  // confirmed the card on Stripe's side; we don't want to strand them
  // on a billing page they can't get past. The next try at billing
  // (first-workspace-create) will reattach.
  redirect(nextPath);
}

/**
 * Escape hatch for environments without Stripe keys, OR for visitors
 * who explicitly opt out (we don't currently expose a skip button in
 * the UI, but the action exists for env-degraded paths and future
 * UX A/B tests). Logs the skip so we can see the prevalence later.
 */
export async function skipSignupCardAction(formData: FormData): Promise<never> {
  assertWritable();

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signup");
  }

  const nextPath = sanitizeNextPath(formData.get("next"));

  console.log(
    JSON.stringify({
      event: "signup_card_skipped",
      user_id: session.user.id,
      next: nextPath,
    }),
  );

  redirect(nextPath);
}
