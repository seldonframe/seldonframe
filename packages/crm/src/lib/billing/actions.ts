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
    throw new Error("Failed to create Stripe customer");
  }

  const payload = (await response.json()) as { id?: string };

  if (!payload.id) {
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
      success_url: `${appBaseUrl}/setup?plan=${encodeURIComponent(params.planId)}&billing=${params.billingPeriod}`,
      cancel_url: `${appBaseUrl}/pricing?billing=${params.billingPeriod}`,
      allow_promotion_codes: "true",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create Stripe checkout session");
  }

  const payload = (await response.json()) as { url?: string | null };

  if (!payload.url) {
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
    throw new Error("Failed to create Stripe billing portal session");
  }

  const payload = (await response.json()) as { url?: string | null };

  if (!payload.url) {
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
    redirect(`/setup?plan=${encodeURIComponent(planId)}&billing=${normalizedPeriod}`);
  }

  if (!selectedPriceId) {
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
    throw new Error("No Stripe customer is associated with this account");
  }

  const portalUrl = await createStripeBillingPortalUrl({
    secretKey,
    customerId,
  });

  redirect(portalUrl);
}
