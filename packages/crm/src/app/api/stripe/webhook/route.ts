import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { getOrgSubscription, updateOrgSubscription } from "@/lib/billing/subscription";

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, {
    apiVersion: "2025-08-27.basil",
  });
}

async function resolveOrgIdForBillingEvent(params: {
  metadata?: Record<string, string> | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}) {
  const metadataOrgId = params.metadata?.orgId?.trim();
  if (metadataOrgId) {
    return metadataOrgId;
  }

  const metadataUserId = params.metadata?.userId?.trim();
  if (metadataUserId) {
    const [userRow] = await db
      .select({ orgId: users.orgId })
      .from(users)
      .where(eq(users.id, metadataUserId))
      .limit(1);

    if (userRow?.orgId) {
      return userRow.orgId;
    }
  }

  if (params.subscriptionId) {
    const [orgBySubscription] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(sql`${organizations.subscription}->>'stripeSubscriptionId' = ${params.subscriptionId}`)
      .limit(1);

    if (orgBySubscription?.id) {
      return orgBySubscription.id;
    }
  }

  if (params.customerId) {
    const [orgByCustomer] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(sql`${organizations.subscription}->>'stripeCustomerId' = ${params.customerId}`)
      .limit(1);

    if (orgByCustomer?.id) {
      return orgByCustomer.id;
    }
  }

  return null;
}

async function markStripeEventProcessed(orgId: string, eventId: string) {
  const subscription = await getOrgSubscription(orgId);
  const processed = Array.isArray(subscription.stripeProcessedEventIds) ? subscription.stripeProcessedEventIds : [];

  if (processed.includes(eventId)) {
    return false;
  }

  await updateOrgSubscription(orgId, {
    stripeProcessedEventIds: [eventId, ...processed].slice(0, 100),
  });

  return true;
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
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
      const orgId = await resolveOrgIdForBillingEvent({
        metadata: session.metadata,
        customerId,
        subscriptionId,
      });

      if (!orgId || !subscriptionId) {
        break;
      }

      const shouldProcess = await markStripeEventProcessed(orgId, event.id);
      if (!shouldProcess) {
        break;
      }

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const priceId = subscription.items.data[0]?.price?.id;

      if (!priceId) {
        break;
      }

      const price = await stripe.prices.retrieve(priceId);
      const tier = price.metadata?.tier || "free";
      const maxWorkspaces = Number.parseInt(price.metadata?.workspaces || "1", 10);
      const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;

      await updateOrgSubscription(orgId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
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

    case "invoice.payment_failed":
    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const invoiceSubscription = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null })
        .subscription;
      const subscriptionId = typeof invoiceSubscription === "string" ? invoiceSubscription : null;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;

      if (!subscriptionId && !customerId) {
        break;
      }

      const orgId = await resolveOrgIdForBillingEvent({
        metadata: invoice.metadata ?? undefined,
        customerId,
        subscriptionId,
      });

      if (!orgId) {
        break;
      }

      const shouldProcess = await markStripeEventProcessed(orgId, event.id);
      if (!shouldProcess) {
        break;
      }

      let stripePriceId: string | null = null;
      let maxWorkspaces = 1;
      let tier = "free";

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        stripePriceId = subscription.items.data[0]?.price?.id ?? null;

        if (stripePriceId) {
          const price = await stripe.prices.retrieve(stripePriceId);
          const parsedMaxWorkspaces = Number.parseInt(price.metadata?.workspaces || "1", 10);
          maxWorkspaces = Number.isNaN(parsedMaxWorkspaces) ? 1 : parsedMaxWorkspaces;
          tier = price.metadata?.tier || "pro";
        }
      }

      await updateOrgSubscription(orgId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId,
        tier,
        maxWorkspaces,
        status: event.type === "invoice.payment_failed" ? "past_due" : "active",
      });

      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
