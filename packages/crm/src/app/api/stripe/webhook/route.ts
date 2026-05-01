import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import {
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "@/lib/billing/price-ids";
import { resolveTierFromSubscription } from "@/lib/billing/tier-resolve";
import type { TierId } from "@/lib/billing/plans";
import { getOrgSubscription, updateOrgSubscription } from "@/lib/billing/subscription";
import { applyBrandingForTier, reRenderAllSurfacesForOrg } from "@/lib/blueprint/rerender-org";
import { trackEvent } from "@/lib/analytics/track";

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

function isEnabledMetadataFlag(value: string | undefined) {
  return value === "true" || value === "1";
}

/**
 * Pick the "base flat" price line from a multi-price subscription.
 * Returns the price id of the line item that matches the resolved
 * tier's base (Scale → SCALE_BASE_PRICE_ID, Growth → GROWTH_BASE_PRICE_ID,
 * legacy → first matching legacy id). Falls back to null if nothing
 * matches — caller defaults to items[0]?.price?.id for backward compat
 * with single-line legacy subscriptions.
 */
function pickBasePriceId(
  subscription: Stripe.Subscription,
  tier: TierId
): string | null {
  const ids = subscription.items.data
    .map((item) => item.price?.id ?? null)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (tier === "scale") {
    if (ids.includes(SCALE_BASE_PRICE_ID)) return SCALE_BASE_PRICE_ID;
    if (ids.includes(LEGACY_CLOUD_PRO_PRICE_ID)) return LEGACY_CLOUD_PRO_PRICE_ID;
    if (ids.includes(LEGACY_CLOUD_AGENCY_PRICE_ID)) return LEGACY_CLOUD_AGENCY_PRICE_ID;
  }
  if (tier === "growth") {
    if (ids.includes(GROWTH_BASE_PRICE_ID)) return GROWTH_BASE_PRICE_ID;
    if (ids.includes(LEGACY_CLOUD_STARTER_PRICE_ID)) return LEGACY_CLOUD_STARTER_PRICE_ID;
  }
  return null;
}

async function updateSelfServiceWorkspaceState(params: {
  orgId: string;
  enabled: boolean;
  priceId: string | null;
  activatedAt?: string | null;
  openClawEnabled?: boolean;
  layer2Enabled?: boolean;
}) {
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, params.orgId))
    .limit(1);

  const currentSettings = (org?.settings as Record<string, unknown> | null) ?? {};
  const currentSelfService =
    currentSettings.selfService && typeof currentSettings.selfService === "object"
      ? (currentSettings.selfService as Record<string, unknown>)
      : {};

  await db
    .update(organizations)
    .set({
      settings: {
        ...currentSettings,
        selfService: {
          ...currentSelfService,
          enabled: params.enabled,
          openClawEnabled: params.openClawEnabled ?? currentSelfService.openClawEnabled ?? false,
          layer2Enabled: params.layer2Enabled ?? currentSelfService.layer2Enabled ?? false,
          stripePriceId: params.priceId,
          activatedAt: params.enabled ? params.activatedAt ?? currentSelfService.activatedAt ?? new Date().toISOString() : null,
          updatedAt: new Date().toISOString(),
        },
      },
      updatedAt: new Date(),
    })
    .where(eq(organizations.id, params.orgId));
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

      const targetOrgId = session.metadata?.type === "self_service_workspace" ? session.metadata?.workspaceId?.trim() || orgId : orgId;

      const shouldProcess = await markStripeEventProcessed(targetOrgId, event.id);
      if (!shouldProcess) {
        console.info("[stripe-webhook] duplicate event ignored", { eventId: event.id, eventType: event.type, orgId: targetOrgId });
        break;
      }

      const previousSubscription = await getOrgSubscription(targetOrgId);

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      // April 30, 2026 — multi-price subscriptions. Resolve tier by
      // scanning every line item, not just items[0]. The base flat
      // price (growth_base / scale_base) wins over metered overage
      // prices (which can sort to items[0] depending on Stripe's
      // ordering). See lib/billing/tier-resolve.ts.
      const tier = resolveTierFromSubscription(subscription);
      // Pick the base price for `stripePriceId` storage — the line
      // item that matches the resolved tier's base. Falls back to
      // items[0] for legacy single-line subscriptions.
      const priceId = pickBasePriceId(subscription, tier) ?? subscription.items.data[0]?.price?.id ?? null;
      // Workspace cap from the resolved tier (-1 = unlimited stored as
      // a sentinel; the create-workspace gate uses `getMaxOrgs()` to
      // turn it into POSITIVE_INFINITY).
      const maxWorkspaces = tier === "scale" ? -1 : tier === "growth" ? 3 : 1;
      const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
      const selfServiceEnabled = tier !== "free";
      // OpenClaw / layer2 metadata flags ride along on the base price
      // record. Look them up from the base price's metadata when we
      // have a base priceId.
      let openClawEnabled = false;
      let layer2Enabled = false;
      if (priceId) {
        try {
          const price = await stripe.prices.retrieve(priceId);
          openClawEnabled = selfServiceEnabled && isEnabledMetadataFlag(price.metadata?.openclaw);
          layer2Enabled = selfServiceEnabled && isEnabledMetadataFlag(price.metadata?.layer2);
        } catch (err) {
          console.warn(`[stripe-webhook] failed to retrieve price ${priceId}:`, err);
        }
      }

      await updateOrgSubscription(targetOrgId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId: priceId,
        tier,
        maxWorkspaces,
        selfServiceEnabled,
        openClawEnabled,
        layer2Enabled,
        selfServiceActivatedAt: selfServiceEnabled ? new Date().toISOString() : null,
        status: subscription.status as "active" | "trialing" | "past_due" | "canceled" | "unpaid",
        trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      });

      if (selfServiceEnabled && priceId) {
        await updateSelfServiceWorkspaceState({
          orgId: targetOrgId,
          enabled: true,
          priceId,
          activatedAt: new Date().toISOString(),
          openClawEnabled,
          layer2Enabled,
        });
      }

      const nextSubscription = await getOrgSubscription(targetOrgId);
      console.info("[stripe-webhook] checkout.session.completed applied", {
        eventId: event.id,
        orgId: targetOrgId,
        tier,
        previousStatus: previousSubscription.status ?? null,
        nextStatus: nextSubscription.status ?? null,
        previousTier: previousSubscription.tier ?? null,
        nextTier: nextSubscription.tier ?? null,
      });

      // May 1, 2026 — Measurement Layer 2. Plan-upgrade product event.
      // Fired only when the tier actually changed so we don't double-
      // count the same checkout firing multiple webhook events.
      if (previousSubscription.tier !== tier) {
        trackEvent(
          "plan_upgraded",
          {
            from_plan: previousSubscription.tier ?? "free",
            to_plan: tier,
            stripe_subscription_id: subscriptionId,
            stripe_price_id: priceId,
            self_service_enabled: selfServiceEnabled,
          },
          { orgId: targetOrgId }
        );
      }

      // P0 (post-launch fix): auto-flip the page-level white-label
      // flag (`org.settings.branding.removePoweredBy`) to match the
      // new tier's entitlement. The renderer already gates on plan,
      // but the page wrapper reads the per-org settings flag — so
      // this is the missing auto-toggle. Must run BEFORE the
      // re-render below so persisted HTML reflects the new state.
      await applyBrandingForTier(targetOrgId, tier).catch((err) =>
        console.warn(`[stripe-webhook] applyBrandingForTier failed for ${targetOrgId}:`, err)
      );

      // P0-3: re-render every blueprint surface so the white-label
      // flag (canRemoveBranding) flips in served HTML now that the
      // tier landed. Fire-and-forget — failures log but don't block
      // the webhook response (Stripe retries on non-2xx).
      void reRenderAllSurfacesForOrg(targetOrgId).catch((err) =>
        console.warn(`[stripe-webhook] rerender after checkout failed for ${targetOrgId}:`, err)
      );

      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.type === "self_service_workspace" ? subscription.metadata?.workspaceId : subscription.metadata?.orgId;

      if (!orgId) {
        break;
      }

      const tier = resolveTierFromSubscription(subscription);
      const priceId = pickBasePriceId(subscription, tier) ?? subscription.items.data[0]?.price?.id ?? null;
      const maxWorkspaces = tier === "scale" ? -1 : tier === "growth" ? 3 : 1;
      const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
      const selfServiceEnabled = tier !== "free";
      let openClawEnabled = false;
      let layer2Enabled = false;
      if (priceId) {
        try {
          const price = await stripe.prices.retrieve(priceId);
          openClawEnabled = selfServiceEnabled && isEnabledMetadataFlag(price.metadata?.openclaw);
          layer2Enabled = selfServiceEnabled && isEnabledMetadataFlag(price.metadata?.layer2);
        } catch (err) {
          console.warn(`[stripe-webhook] failed to retrieve price ${priceId}:`, err);
        }
      }

      await updateOrgSubscription(orgId, {
        stripeSubscriptionId: subscription.id,
        stripePriceId: priceId,
        tier,
        maxWorkspaces,
        selfServiceEnabled,
        openClawEnabled,
        layer2Enabled,
        selfServiceActivatedAt: selfServiceEnabled ? new Date().toISOString() : null,
        status: subscription.status as "active" | "trialing" | "past_due" | "canceled" | "unpaid",
        trialEndsAt: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : null,
      });

      if (selfServiceEnabled && priceId) {
        await updateSelfServiceWorkspaceState({
          orgId,
          enabled: true,
          priceId,
          activatedAt: new Date().toISOString(),
          openClawEnabled,
          layer2Enabled,
        });
      }

      // P0 (post-launch fix): auto-flip page-level white-label flag.
      // See checkout.session.completed branch above for rationale.
      await applyBrandingForTier(orgId, tier).catch((err) =>
        console.warn(`[stripe-webhook] applyBrandingForTier failed for ${orgId}:`, err)
      );

      // P0-3: re-render blueprint surfaces with the new white-label flag.
      void reRenderAllSurfacesForOrg(orgId).catch((err) =>
        console.warn(`[stripe-webhook] rerender after subscription update failed for ${orgId}:`, err)
      );

      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const orgId = subscription.metadata?.type === "self_service_workspace" ? subscription.metadata?.workspaceId : subscription.metadata?.orgId;

      if (!orgId) {
        break;
      }

      await updateOrgSubscription(orgId, {
        tier: "free",
        maxWorkspaces: 1,
        status: "canceled",
        stripeSubscriptionId: null,
        selfServiceEnabled: false,
        openClawEnabled: false,
        layer2Enabled: false,
        selfServiceActivatedAt: null,
      });

      await updateSelfServiceWorkspaceState({
        orgId,
        enabled: false,
        priceId: null,
        activatedAt: null,
        openClawEnabled: false,
        layer2Enabled: false,
      });

      // P0 (post-launch fix): flip page-level white-label flag back
      // to false so the badge returns. Tier is "free" → canRemoveBranding
      // is false → branding.removePoweredBy gets written as false.
      await applyBrandingForTier(orgId, "free").catch((err) =>
        console.warn(`[stripe-webhook] applyBrandingForTier failed for ${orgId}:`, err)
      );

      // P0-3: tier dropped to free → re-render to restore the
      // "Powered by SeldonFrame" badge on /, /book, /intake.
      void reRenderAllSurfacesForOrg(orgId).catch((err) =>
        console.warn(`[stripe-webhook] rerender after subscription delete failed for ${orgId}:`, err)
      );

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

      const resolvedOrgId = await resolveOrgIdForBillingEvent({
        metadata: invoice.metadata ?? undefined,
        customerId,
        subscriptionId,
      });

      const orgId = invoice.metadata?.type === "self_service_workspace" ? invoice.metadata?.workspaceId ?? resolvedOrgId : resolvedOrgId;

      if (!orgId) {
        break;
      }

      const shouldProcess = await markStripeEventProcessed(orgId, event.id);
      if (!shouldProcess) {
        console.info("[stripe-webhook] duplicate event ignored", { eventId: event.id, eventType: event.type, orgId });
        break;
      }

      const previousSubscription = await getOrgSubscription(orgId);

      let stripePriceId: string | null = null;
      let maxWorkspaces = 1;
      let tier: "free" | "growth" | "scale" = "free";
      let selfServiceEnabled = false;
      let openClawEnabled = false;
      let layer2Enabled = false;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        tier = resolveTierFromSubscription(subscription);
        stripePriceId = pickBasePriceId(subscription, tier) ?? subscription.items.data[0]?.price?.id ?? null;
        maxWorkspaces = tier === "scale" ? -1 : tier === "growth" ? 3 : 1;
        selfServiceEnabled = tier !== "free";

        if (stripePriceId) {
          try {
            const price = await stripe.prices.retrieve(stripePriceId);
            openClawEnabled = selfServiceEnabled && isEnabledMetadataFlag(price.metadata?.openclaw);
            layer2Enabled = selfServiceEnabled && isEnabledMetadataFlag(price.metadata?.layer2);
          } catch (err) {
            console.warn(`[stripe-webhook] failed to retrieve price ${stripePriceId}:`, err);
          }
        }
      }

      await updateOrgSubscription(orgId, {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripePriceId,
        tier,
        maxWorkspaces,
        selfServiceEnabled,
        openClawEnabled,
        layer2Enabled,
        selfServiceActivatedAt: selfServiceEnabled ? new Date().toISOString() : null,
        status: event.type === "invoice.payment_failed" ? "past_due" : "active",
      });

      if (stripePriceId && selfServiceEnabled) {
        await updateSelfServiceWorkspaceState({
          orgId,
          enabled: true,
          priceId: stripePriceId,
          activatedAt: new Date().toISOString(),
          openClawEnabled,
          layer2Enabled,
        });
      }

      const nextSubscription = await getOrgSubscription(orgId);
      console.info("[stripe-webhook] invoice status applied", {
        eventId: event.id,
        eventType: event.type,
        orgId,
        previousStatus: previousSubscription.status ?? null,
        nextStatus: nextSubscription.status ?? null,
        previousMaxWorkspaces: previousSubscription.maxWorkspaces ?? 1,
        nextMaxWorkspaces: nextSubscription.maxWorkspaces ?? 1,
      });

      break;
    }

    default:
      console.info("[stripe-webhook] unhandled event type", { eventId: event.id, eventType: event.type });
      break;
  }

  return NextResponse.json({ received: true });
}
