import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { updateOrgSubscription } from "@/lib/billing/subscription";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil",
  });
}

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 400 });
  }

  const stripe = getStripeClient();

  if (!stripe) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 400 });
  }

  const body = await req.text();
  const sig = (await headers()).get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.orgId;

      if (!orgId || !session.subscription) {
        break;
      }

      const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
      const priceId = subscription.items.data[0]?.price?.id;

      if (!priceId) {
        break;
      }

      const price = await stripe.prices.retrieve(priceId);
      const tier = price.metadata?.tier || "free";
      const maxWorkspaces = Number.parseInt(price.metadata?.workspaces || "1", 10);
      const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;

      await updateOrgSubscription(orgId, {
        stripeCustomerId: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
        stripePriceId: priceId,
        tier,
        maxWorkspaces: Number.isNaN(maxWorkspaces) ? 1 : maxWorkspaces,
        status: subscription.status as "active" | "trialing" | "past_due" | "canceled" | "unpaid",
        trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      });

      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.orgId;
      const priceId = subscription.items.data[0]?.price?.id;

      if (!orgId || !priceId) {
        break;
      }

      const price = await stripe.prices.retrieve(priceId);
      const tier = price.metadata?.tier || "free";
      const maxWorkspaces = Number.parseInt(price.metadata?.workspaces || "1", 10);
      const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;

      await updateOrgSubscription(orgId, {
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        tier,
        maxWorkspaces: Number.isNaN(maxWorkspaces) ? 1 : maxWorkspaces,
        status: subscription.status as "active" | "trialing" | "past_due" | "canceled" | "unpaid",
        trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      });

      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.orgId;

      if (!orgId) {
        break;
      }

      await updateOrgSubscription(orgId, {
        tier: "free",
        maxWorkspaces: 1,
        status: "canceled",
        stripeSubscriptionId: null,
      });

      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceSubscription = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null })
        .subscription;
      const subscriptionId = typeof invoiceSubscription === "string" ? invoiceSubscription : null;

      if (!subscriptionId) {
        break;
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const orgId = subscription.metadata?.orgId;

      if (!orgId) {
        break;
      }

      await updateOrgSubscription(orgId, {
        status: "past_due",
      });

      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
