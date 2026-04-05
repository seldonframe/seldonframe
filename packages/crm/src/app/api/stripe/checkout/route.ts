import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/auth";
import { getOrgId } from "@/lib/auth/helpers";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil",
  });
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const stripe = getStripeClient();

  if (!stripe) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 500 });
  }

  const { priceId, billingPeriod } = (await req.json()) as {
    priceId?: string;
    billingPeriod?: string;
  };

  let stripePriceId = priceId || "";

  if (!stripePriceId && billingPeriod) {
    const prices = await stripe.prices.list({
      lookup_keys: [billingPeriod],
      active: true,
      limit: 1,
    });

    stripePriceId = prices.data[0]?.id || "";
  }

  if (!stripePriceId) {
    return NextResponse.json({ error: "Price not found" }, { status: 400 });
  }

  const orgId = await getOrgId();

  const checkoutSession = await stripe.checkout.sessions.create({
    customer_email: session.user.email ?? undefined,
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: stripePriceId, quantity: 1 }],
    success_url: `${getAppUrl()}/dashboard?upgraded=1`,
    cancel_url: `${getAppUrl()}/pricing`,
    metadata: {
      userId: session.user.id,
      orgId: orgId ?? session.user.orgId ?? "",
    },
    subscription_data: {
      metadata: {
        userId: session.user.id,
        orgId: orgId ?? session.user.orgId ?? "",
      },
      trial_period_days: 14,
    },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
