import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import {
  BUILDER_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "@/lib/billing/price-ids";
import { resolveTierFromSubscription } from "@/lib/billing/tier-resolve";
import type { BillingTier } from "@/lib/billing/features";
import { getOrgSubscription, updateOrgSubscription } from "@/lib/billing/subscription";
import { applyBrandingForTier, reRenderAllSurfacesForOrg } from "@/lib/blueprint/rerender-org";
import { trackEvent } from "@/lib/analytics/track";
import { getPlan } from "@/lib/billing/plans";
import { sendPaidConversionAlert } from "@/lib/notifications/ops-notifications";

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
  tier: BillingTier
): string | null {
  const ids = subscription.items.data
    .map((item) => item.price?.id ?? null)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (tier === "agency") {
    if (ids.includes(AGENCY_BASE_PRICE_ID)) return AGENCY_BASE_PRICE_ID;
    if (ids.includes(SCALE_BASE_PRICE_ID)) return SCALE_BASE_PRICE_ID;
    if (ids.includes(LEGACY_CLOUD_PRO_PRICE_ID)) return LEGACY_CLOUD_PRO_PRICE_ID;
    if (ids.includes(LEGACY_CLOUD_AGENCY_PRICE_ID)) return LEGACY_CLOUD_AGENCY_PRICE_ID;
  }
  if (tier === "workspace") {
    if (ids.includes(WORKSPACE_PRICE_ID)) return WORKSPACE_PRICE_ID;
    if (ids.includes(GROWTH_BASE_PRICE_ID)) return GROWTH_BASE_PRICE_ID;
    if (ids.includes(LEGACY_CLOUD_STARTER_PRICE_ID)) return LEGACY_CLOUD_STARTER_PRICE_ID;
  }
  if (tier === "builder") {
    if (ids.includes(BUILDER_PRICE_ID)) return BUILDER_PRICE_ID;
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
      const maxWorkspaces = tier === "agency" ? -1 : tier === "workspace" ? 1 : 0;
      const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
      const selfServiceEnabled = tier !== "inactive";
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

    case "customer.subscription.created": {
      // 2026-05-26 — paid-conversion ops alert. customer.subscription.created
      // is the right "user just upgraded" signal in our SetupIntent flow:
      // the card is collected at signup (no charge), and the subscription
      // is created later when the user actually hits a paid trigger. This
      // event fires once per subscription creation.
      //
      // We DELIBERATELY do not duplicate the org-state-update logic from
      // checkout.session.completed / customer.subscription.updated here.
      // Those events still fire in their normal flow and apply the tier
      // change. This case ONLY sends the ops alert, then breaks. Stripe
      // sends ALL applicable events for one checkout (created + updated +
      // checkout.session.completed), so if we also wrote subscription
      // state here we'd race against the other handlers.
      //
      // Send is wrapped in try/catch and ops-notifications.ts itself never
      // throws — a Resend outage MUST NOT make this case return a non-2xx,
      // because that would trigger Stripe's automatic retry (3 attempts
      // over 3 days) and cause duplicate alerts once Resend recovers.
      try {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id ?? null;
        const tierId = resolveTierFromSubscription(subscription);
        if (tierId === "inactive" || !customerId) {
          // No-plan "subscriptions" (none expected in our setup, but
          // possible via stripe.subscriptions.create with only stray
          // items) shouldn't trigger a revenue alert. Bail without
          // logging — this is normal for non-revenue events.
          break;
        }

        const plan = getPlan(tierId);
        const tierName = plan?.name ?? tierId;
        // Sum every recurring line item's amount × quantity. Some
        // subscriptions ship a base flat price + metered overage lines
        // with unit_amount=0; treating them as 0-contribution gives the
        // right "expected MRR" for the alert.
        const mrrCents = subscription.items.data.reduce((sum, item) => {
          const unitAmount = item.price?.unit_amount ?? 0;
          const quantity = item.quantity ?? 0;
          return sum + unitAmount * quantity;
        }, 0);
        const firstItem = subscription.items.data[0];
        const currency = (firstItem?.price?.currency ?? "usd").toLowerCase();

        // Look up the user by Stripe customer id so we can include the
        // email in the alert. users.stripeCustomerId is populated by
        // the SetupIntent flow at signup time.
        const [userRow] = await db
          .select({
            id: users.id,
            email: users.email,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(eq(users.stripeCustomerId, customerId))
          .limit(1);

        if (!userRow) {
          // No mapping → skip the alert. Don't fall back to a Stripe
          // API call for customer.email because the alert is best-
          // effort and we don't want to add a network round-trip on
          // the webhook hot path.
          console.warn("[stripe-webhook] customer.subscription.created — no user mapped to customer", {
            customerId,
            subscriptionId: subscription.id,
          });
          break;
        }

        // signupToPaidDays — quick calc from the existing createdAt
        // column. Floor() because partial days read as noise in the
        // alert; the founder cares about same-day-paid vs week-1
        // vs month-2 conversions.
        const signupToPaidDays = Math.floor(
          (Date.now() - userRow.createdAt.getTime()) / 86_400_000,
        );

        await sendPaidConversionAlert({
          email: userRow.email,
          userId: userRow.id,
          tier: tierName,
          mrrCents,
          currency,
          subscriptionId: subscription.id,
          signupToPaidDays,
        });
      } catch (err) {
        // ops-notifications.ts already swallows its own errors, but we
        // wrap here as belt-and-suspenders against an unexpected db or
        // tier-resolve regression. Webhook MUST always return 2xx.
        console.warn(
          `[stripe-webhook] customer.subscription.created ops-alert path threw (swallowed): ${err instanceof Error ? err.message : String(err)}`,
        );
      }

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
      const maxWorkspaces = tier === "agency" ? -1 : tier === "workspace" ? 1 : 0;
      const currentPeriodEnd = (subscription as Stripe.Subscription & { current_period_end?: number }).current_period_end;
      const selfServiceEnabled = tier !== "inactive";
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
        tier: "inactive",
        maxWorkspaces: 0,
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
      // to false so the badge returns. Tier is "inactive" →
      // canRemoveBranding is false → branding.removePoweredBy = false.
      await applyBrandingForTier(orgId, "inactive").catch((err) =>
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
      let maxWorkspaces = 0;
      let tier: BillingTier = "inactive";
      let selfServiceEnabled = false;
      let openClawEnabled = false;
      let layer2Enabled = false;

      if (subscriptionId) {
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        tier = resolveTierFromSubscription(subscription);
        stripePriceId = pickBasePriceId(subscription, tier) ?? subscription.items.data[0]?.price?.id ?? null;
        maxWorkspaces = tier === "agency" ? -1 : tier === "workspace" ? 1 : 0;
        selfServiceEnabled = tier !== "inactive";

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
