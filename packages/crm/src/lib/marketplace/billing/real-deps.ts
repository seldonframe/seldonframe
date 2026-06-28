// #139 — the REAL (production) deps for createOneTimeAgentCheckout. Kept out of
// the pure module so the unit tests never import a Stripe client or the db. The
// install action (a "use server" file) imports buildOneTimeCheckoutDeps() and
// passes it in; everything money-touching is therefore concentrated here behind
// the same DI seam the tests fake.
//
// readConnectStatus mirrors lib/marketplace/seller-actions.ts's private
// readConnectStatus EXACTLY (the same stripe_connections row the proposals flow
// onboards): ready = isActive === true, accountId = stripeAccountId.

import { and, desc, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema/payments";
import { marketplacePurchases } from "@/db/schema/marketplace-purchases";
import { getStripeClient } from "@seldonframe/payments";
import { createPurchase } from "./purchases-store";
import type {
  ConnectStatus,
  CreateOneTimeAgentCheckoutDeps,
  StripeCheckoutSeam,
} from "./one-time-checkout";
import type {
  RecurringPriceRef,
  ResolveRecurringPriceParams,
  SubscriptionCheckoutDeps,
  SubscriptionCheckoutSeam,
} from "./subscription-deps";
import type {
  ReportAgentUsageDeps,
  UsageReportSeam,
} from "./metered-subscription";

/** Read the seller org's Connect status from stripe_connections — the same row
 *  the proposals onboarding + the seller publish gate use. ready when isActive. */
export async function readConnectStatus(sellerOrgId: string): Promise<ConnectStatus> {
  const [row] = await db
    .select({
      stripeAccountId: stripeConnections.stripeAccountId,
      isActive: stripeConnections.isActive,
    })
    .from(stripeConnections)
    .where(eq(stripeConnections.orgId, sellerOrgId))
    .limit(1);
  if (!row) return { ready: false, accountId: null };
  return { ready: row.isActive === true, accountId: row.stripeAccountId ?? null };
}

/** Build the production deps. getStripeClient() returns null without
 *  STRIPE_SECRET_KEY → the checkout stays inert (skips). */
export function buildOneTimeCheckoutDeps(): CreateOneTimeAgentCheckoutDeps {
  return {
    getStripe: () => getStripeClient() as StripeCheckoutSeam | null,
    readConnectStatus,
    createPurchase,
    env: process.env as Record<string, string | undefined>,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    now: () => new Date(),
  };
}

// ─── P2/P3: recurring (subscription) deps ────────────────────────────────────

/** A stable lookup_key so re-listing the same listing at the same amount reuses
 *  one Price on the seller's connected account (idempotent create-or-lookup). */
function recurringLookupKey(params: ResolveRecurringPriceParams): string {
  return [
    "sf",
    params.usageType === "metered" ? "metered" : "monthly",
    params.listingId,
    params.unitAmountCents,
  ].join("_");
}

/** The (live) create-or-lookup of a recurring Price on the SELLER's connected
 *  account. For metered prices it also ensures a Stripe Meter exists and points
 *  the price at it. Runs on the connected account via `{ stripeAccount }`. */
async function resolveRecurringPriceLive(
  stripe: Stripe,
  params: ResolveRecurringPriceParams,
): Promise<RecurringPriceRef> {
  const requestOpts: Stripe.RequestOptions = { stripeAccount: params.connectedAccountId };
  const lookupKey = recurringLookupKey(params);

  // 1) Reuse an existing price with this lookup_key if present.
  const existing = await stripe.prices.list(
    { lookup_keys: [lookupKey], active: true, limit: 1, expand: ["data.recurring"] },
    requestOpts,
  );
  const found = existing.data[0];
  if (found) {
    const meterId =
      typeof found.recurring?.meter === "string" ? found.recurring.meter : null;
    return { priceId: found.id, meterId };
  }

  // 2) For metered, ensure a meter exists (event_name is stable per listing).
  let meterId: string | null = null;
  let eventName: string | undefined;
  if (params.usageType === "metered") {
    eventName = `sf_agent_usage_${params.listingId}`;
    const meters = await stripe.billing.meters.list({ status: "active", limit: 100 }, requestOpts);
    const existingMeter = meters.data.find((m) => m.event_name === eventName);
    if (existingMeter) {
      meterId = existingMeter.id;
    } else {
      const meter = await stripe.billing.meters.create(
        {
          display_name: `SeldonFrame agent usage — ${params.listingName}`.slice(0, 250),
          event_name: eventName,
          default_aggregation: { formula: "sum" },
        },
        requestOpts,
      );
      meterId = meter.id;
    }
  }

  // 3) Create the recurring price (licensed flat monthly OR metered usage).
  const price = await stripe.prices.create(
    {
      currency: "usd",
      unit_amount: params.unitAmountCents,
      lookup_key: lookupKey,
      product_data: { name: `SeldonFrame Agent: ${params.listingName}` },
      recurring: {
        interval: params.interval,
        usage_type: params.usageType,
        ...(meterId ? { meter: meterId } : {}),
      },
    },
    requestOpts,
  );
  return { priceId: price.id, meterId };
}

/** Wrap the live Stripe client into the narrow SubscriptionCheckoutSeam, or null
 *  when no key is configured (→ the creator skips / stays inert). */
function getSubscriptionSeam(): SubscriptionCheckoutSeam | null {
  const stripe = getStripeClient();
  if (!stripe) return null;
  return {
    checkout: {
      sessions: {
        create: (params, options) => stripe.checkout.sessions.create(params, options),
      },
    },
    resolveRecurringPrice: (params) => resolveRecurringPriceLive(stripe, params),
  };
}

/** Build the production deps for createMonthlyAgentSubscription /
 *  createMeteredAgentSubscription. Inert without a Stripe key (seam → null). */
export function buildSubscriptionCheckoutDeps(): SubscriptionCheckoutDeps {
  return {
    getStripe: getSubscriptionSeam,
    readConnectStatus,
    createPurchase,
    env: process.env as Record<string, string | undefined>,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    now: () => new Date(),
  };
}

// ─── P3: usage reporting deps ────────────────────────────────────────────────

/** The live usage push. The basil API meters by CUSTOMER via a meter event (the
 *  legacy subscriptionItems.createUsageRecord is gone), so we resolve the metered
 *  subscription item → its subscription → customer + the price's meter event_name,
 *  then fire ONE billing.meterEvent. Fail-soft is the CALLER's job
 *  (reportAgentUsage swallows throws); this stays a thin live mapping. */
async function reportUsageLive(
  stripe: Stripe,
  input: { subscriptionItemId: string; quantity: number; idempotencyKey: string },
): Promise<void> {
  // The subscription item carries the price (→ meter) + its subscription (→ customer).
  const item = await stripe.subscriptionItems.retrieve(input.subscriptionItemId, {
    expand: ["price.recurring"],
  });
  const meterId =
    typeof item.price?.recurring?.meter === "string" ? item.price.recurring.meter : null;
  // In the basil API a SubscriptionItem.subscription is the plain subscription id.
  const subscriptionId = item.subscription;
  if (!meterId || !subscriptionId) {
    throw new Error("metered subscription item missing meter or subscription");
  }
  const meter = await stripe.billing.meters.retrieve(meterId);
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) throw new Error("metered subscription missing customer");

  await stripe.billing.meterEvents.create({
    event_name: meter.event_name,
    identifier: input.idempotencyKey,
    payload: {
      stripe_customer_id: customerId,
      value: String(input.quantity),
    },
  });
}

/** Wrap the live Stripe client into the narrow UsageReportSeam, or null when no
 *  key is configured (→ reportAgentUsage is a no-op). */
function getUsageReporter(): UsageReportSeam | null {
  const stripe = getStripeClient();
  if (!stripe) return null;
  return { reportUsage: (input) => reportUsageLive(stripe, input) };
}

/** Build the production deps for reportAgentUsage. Inert without a Stripe key. */
export function buildUsageReportDeps(): ReportAgentUsageDeps {
  return {
    getUsageReporter,
    env: process.env as Record<string, string | undefined>,
  };
}

// ─── P3: resolve the renter's metered subscription item (rental-path wiring) ──

/**
 * Resolve the ACTIVE metered marketplace subscription item for a (renter org,
 * listing) pair, or null when there isn't one. Used at the `agent_rental_call`
 * accrual to decide whether to report a usage unit. Looks up the most recent
 * active metered purchase row for this buyer+listing, then reads its
 * subscription's first item id from Stripe. Returns null (no report) on ANY miss
 * — no flag, no key, no metered purchase, no subscription — so the rental path
 * is unaffected unless a real metered subscription exists.
 *
 * NEVER THROWS: a lookup failure returns null (the caller no-ops) so metering can
 * never break a rented agent.
 */
export async function resolveRenterMeteredSubscriptionItemId(input: {
  renterOrgId: string;
  listingId: string;
}): Promise<string | null> {
  try {
    const renterOrgId = String(input.renterOrgId ?? "").trim();
    const listingId = String(input.listingId ?? "").trim();
    if (!renterOrgId || !listingId) return null;

    const [row] = await db
      .select({ subId: marketplacePurchases.stripeSubscriptionId })
      .from(marketplacePurchases)
      .where(
        and(
          eq(marketplacePurchases.buyerOrgId, renterOrgId),
          eq(marketplacePurchases.listingId, listingId),
          eq(marketplacePurchases.status, "active"),
        ),
      )
      .orderBy(desc(marketplacePurchases.createdAt))
      .limit(1);

    const subscriptionId = row?.subId?.trim();
    if (!subscriptionId) return null;

    const stripe = getStripeClient();
    if (!stripe) return null;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const item = subscription.items?.data?.[0];
    return item?.id ?? null;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[marketplace-billing] resolve_metered_item_error listing=${input.listingId} renter=${input.renterOrgId} err=${detail}`);
    return null;
  }
}
