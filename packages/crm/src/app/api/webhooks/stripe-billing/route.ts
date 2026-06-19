import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { verifyStripeWebhook } from "@seldonframe/payments";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { getOrgSubscription, updateOrgSubscription } from "@/lib/billing/subscription";
import { finalizeBlockPurchaseFromWebhook, finalizeSoulPurchaseFromWebhook } from "@/lib/marketplace/actions";
import {
  handleBillingSubscriptionEvent,
  type BillingWebhookStore,
} from "./handlers";

// 2026-06-18 — Phase 2 (billing-state consolidation).
//
// This is the PLATFORM billing webhook (subscription lifecycle), NOT the
// proposals Connect webhook (/api/webhooks/stripe/connect). It used to
// write the legacy `users.planId/stripeCustomerId/stripeSubscriptionId`
// columns while the app read `organizations.subscription` — the two
// could drift. It now writes ONLY `organizations.subscription` (JSONB),
// the single source of truth read by getOrgSubscription /
// resolveTierForWorkspace. The `users` billing columns are no longer
// written here (left intact for back-compat reads during migration);
// the only `users` access that remains is a READ to resolve an org from
// metadata.userId.
//
// Billing-event state mapping lives in ./handlers (pure + unit-tested).
// This route does signature verification, the org-resolution + persist
// wiring (the DB-backed BillingWebhookStore below), and keeps the
// orthogonal marketplace block/soul purchase finalizers.

/** Resolve the org an incoming billing event belongs to. Order:
 *    1. metadata.orgId — /api/stripe/checkout stamps it on both the
 *       checkout session metadata AND subscription_data.metadata, so it
 *       rides on the session and every later subscription event.
 *    2. metadata.userId → users.orgId (read-only lookup).
 *    3. the subscription id already stored on an org's subscription.
 *    4. the customer id already stored on an org's subscription. */
async function resolveOrgIdForBillingEvent(params: {
  metadata?: Record<string, string> | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<string | null> {
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

/** DB-backed persistence surface for the pure handler. `updateOrgSubscription`
 *  merges (read-modify-write spread) so sibling keys in
 *  `organizations.subscription` are preserved on every write. */
const billingWebhookStore: BillingWebhookStore = {
  resolveOrgId: resolveOrgIdForBillingEvent,
  getOrgSubscription: (orgId) => getOrgSubscription(orgId),
  updateOrgSubscription: (orgId, updates) => updateOrgSubscription(orgId, updates),
};

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_BILLING_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Billing webhook not configured" }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;

  try {
    const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
    process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_BILLING_WEBHOOK_SECRET;
    event = verifyStripeWebhook({ payload, signature });
    process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  // ── Marketplace one-off purchases (orthogonal to subscription state) ──
  // These ride on checkout.session.completed but are payment_intent
  // purchases, not subscriptions, so they short-circuit before the
  // subscription handler.
  if (event.type === "checkout.session.completed") {
    const object = event.data.object as Stripe.Checkout.Session;

    if (object.metadata?.type === "block_purchase") {
      const stripePaymentId = asPaymentIntentId(object.payment_intent);
      await finalizeBlockPurchaseFromWebhook({
        orgId: object.metadata?.orgId || "",
        userId: object.metadata?.userId || null,
        blockId: object.metadata?.blockId || "",
        stripePaymentId,
      });
      return NextResponse.json({ ok: true });
    }

    if (object.metadata?.type === "soul_purchase") {
      const stripePaymentId = asPaymentIntentId(object.payment_intent);
      await finalizeSoulPurchaseFromWebhook({
        orgId: object.metadata?.orgId || "",
        userId: object.metadata?.userId || null,
        listingId: object.metadata?.listingId || null,
        listingSlug: object.metadata?.listingSlug || null,
        stripePaymentId,
      });
      return NextResponse.json({ ok: true });
    }
  }

  // ── Subscription lifecycle → organizations.subscription ───────────────
  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "invoice.paid":
    case "invoice.payment_failed": {
      const result = await handleBillingSubscriptionEvent(event, billingWebhookStore);
      if (result === null) {
        console.info("[stripe-billing] no org resolved for event", {
          eventId: event.id,
          eventType: event.type,
        });
      } else if (result.action === "duplicate") {
        console.info("[stripe-billing] duplicate event ignored", {
          eventId: event.id,
          eventType: event.type,
          orgId: result.orgId,
        });
      } else {
        console.info("[stripe-billing] subscription state applied", {
          eventId: event.id,
          eventType: event.type,
          orgId: result.orgId,
          tier: result.tier,
          status: result.status,
        });
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ ok: true });
}

function asPaymentIntentId(
  value: string | { id?: string } | null | undefined,
): string | null {
  return typeof value === "string" ? value : value?.id || null;
}
