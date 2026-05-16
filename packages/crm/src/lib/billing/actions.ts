"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getOrgSubscription } from "@/lib/billing/subscription";
import { assertWritable } from "@/lib/demo/server";
import { getPlan } from "@/lib/billing/plans";

function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

async function createStripeCustomer(params: { secretKey: string; email: string; userId: string }) {
  const response = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      email: params.email,
      "metadata[seldonframe_user_id]": params.userId,
    }),
  });

  if (!response.ok) {
    // contract:throw-ok: Stripe API error; bubbles up to selectPlanAction
    // which doesn't catch — but that path is only reachable from a
    // form submit, and Next.js server-action error handling shows the
    // operator a generic error toast rather than crashing the page.
    throw new Error("Failed to create Stripe customer");
  }

  const payload = (await response.json()) as { id?: string };

  if (!payload.id) {
    // contract:throw-ok: Stripe responded 200 but malformed body —
    // unrecoverable, programmer/external error.
    throw new Error("Stripe customer id missing");
  }

  return payload.id;
}

async function createStripeCheckoutSession(params: {
  secretKey: string;
  customerId: string;
  planId: string;
  priceId: string;
  billingPeriod: "monthly" | "yearly";
  userId: string;
}) {
  const appBaseUrl = getAppBaseUrl();
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      customer: params.customerId,
      client_reference_id: params.userId,
      mode: "subscription",
      "payment_method_types[0]": "card",
      "line_items[0][price]": params.priceId,
      "line_items[0][quantity]": "1",
      "metadata[seldonframe_user_id]": params.userId,
      "metadata[seldonframe_plan_id]": params.planId,
      "subscription_data[trial_period_days]": "14",
      "subscription_data[metadata][seldonframe_user_id]": params.userId,
      "subscription_data[metadata][seldonframe_plan_id]": params.planId,
      success_url: `${appBaseUrl}/clients/new?plan=${encodeURIComponent(params.planId)}&billing=${params.billingPeriod}`,
      cancel_url: `${appBaseUrl}/pricing?billing=${params.billingPeriod}`,
      allow_promotion_codes: "true",
    }),
  });

  if (!response.ok) {
    // contract:throw-ok: Stripe API error; same pattern as the
    // customer-creation throw — bubbles to the form-submit handler
    // which shows a generic error toast.
    throw new Error("Failed to create Stripe checkout session");
  }

  const payload = (await response.json()) as { url?: string | null };

  if (!payload.url) {
    // contract:throw-ok: Stripe 200 with malformed body, unrecoverable.
    throw new Error("Stripe checkout URL missing");
  }

  return payload.url;
}

async function createStripeBillingPortalUrl(params: { secretKey: string; customerId: string }) {
  const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      customer: params.customerId,
      return_url: `${getAppBaseUrl()}/settings/billing`,
    }),
  });

  if (!response.ok) {
    // contract:throw-ok: Stripe API error; same pattern as the other
    // Stripe helpers — caller is createBillingPortalSessionAction
    // which is form-submit-driven, not SSR-render-driven.
    throw new Error("Failed to create Stripe billing portal session");
  }

  const payload = (await response.json()) as { url?: string | null };

  if (!payload.url) {
    // contract:throw-ok: Stripe 200 with malformed body, unrecoverable.
    throw new Error("Stripe portal URL missing");
  }

  return payload.url;
}

export async function selectPlanAction(formData: FormData) {
  assertWritable();

  const session = await auth();
  const userId = session?.user?.id;
  const planId = String(formData.get("planId") ?? "");
  const billingPeriod = String(formData.get("billingPeriod") ?? "monthly");

  if (!userId) {
    redirect("/signup");
  }

  const plan = getPlan(planId);
  if (!plan) {
    // contract:throw-ok: planId comes from the form submit; the plan
    // selection UI only renders valid plan IDs. If we reach this
    // branch, the user manually crafted a bad form POST — programmer-
    // error / abuse, not a normal operator path.
    throw new Error("Invalid plan selected");
  }

  const normalizedPeriod = billingPeriod === "yearly" ? "yearly" : "monthly";
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const selectedPriceId = normalizedPeriod === "yearly" ? plan.stripeYearlyPriceId : plan.stripePriceId;

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    // contract:throw-ok: userId came from session.user.id which
    // requires a NextAuth session; this branch is only reachable
    // if the users row was deleted between sign-in and form submit
    // (extreme race). Same form-submit error-toast UX as Stripe
    // failures above; not a server-component render path.
    throw new Error("User not found");
  }

  await db
    .update(users)
    .set({
      planId,
      billingPeriod: normalizedPeriod,
      subscriptionStatus: "trialing",
      trialEndsAt,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  if (!secretKey) {
    redirect(`/clients/new?plan=${encodeURIComponent(planId)}&billing=${normalizedPeriod}`);
  }

  if (!selectedPriceId) {
    // contract:throw-ok: deployment-config error (env var missing for
    // a known plan); operator-facing form-submit error-toast UX, not
    // SSR boundary.
    throw new Error(`Stripe price id is missing for plan ${planId} (${normalizedPeriod})`);
  }

  const customerId = user.stripeCustomerId ?? (await createStripeCustomer({ secretKey, email: user.email, userId }));

  if (!user.stripeCustomerId) {
    await db.update(users).set({ stripeCustomerId: customerId, updatedAt: new Date() }).where(eq(users.id, userId));
  }

  const checkoutUrl = await createStripeCheckoutSession({
    secretKey,
    customerId,
    planId,
    priceId: selectedPriceId,
    billingPeriod: normalizedPeriod,
    userId,
  });

  redirect(checkoutUrl);
}

export async function createBillingPortalSessionAction() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    redirect("/settings/billing");
  }

  const orgId = await getOrgId();
  const orgSubscription = await getOrgSubscription(orgId ?? session?.user?.orgId ?? null);

  const [user] = await db
    .select({
      stripeCustomerId: users.stripeCustomerId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const customerId = orgSubscription.stripeCustomerId ?? user?.stripeCustomerId ?? null;

  if (!customerId) {
    // v1.8.1 — graceful redirect instead of throwing. Users on free
    // tier (or any tier where they've never completed a Stripe
    // checkout) have no customer yet — clicking "Manage subscription"
    // shouldn't crash the page; it should send them to the pricing /
    // upgrade flow. The settings page itself ALSO conditionally hides
    // the button for free-tier users (defense in depth), but a stale
    // page state, a direct form POST, or a guest-admin-token edge
    // case can still hit this action with no customer. Redirect →
    // /settings/billing?upgrade=needed surfaces a banner explaining
    // why they were sent back.
    redirect("/settings/billing?upgrade=needed");
  }

  const portalUrl = await createStripeBillingPortalUrl({
    secretKey,
    customerId,
  });

  redirect(portalUrl);
}
