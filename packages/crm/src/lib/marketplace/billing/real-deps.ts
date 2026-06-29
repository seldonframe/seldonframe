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
import { resolveRecurringPriceLive } from "./recurring-price";
import type {
  ConnectStatus,
  CreateOneTimeAgentCheckoutDeps,
  StripeCheckoutSeam,
} from "./one-time-checkout";
import type {
  SubscriptionCheckoutDeps,
  SubscriptionCheckoutSeam,
} from "./subscription-deps";
import type {
  ReportAgentUsageDeps,
  UsageReportSeam,
} from "./metered-subscription";
import type {
  BillingPortalSeam,
  MarketplacePortalDeps,
} from "./billing-portal";

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
    baseUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com",
    now: () => new Date(),
  };
}

// ─── P2/P3: recurring (subscription) deps ────────────────────────────────────
//
// The recurring Price + Meter create-or-lookup lives in ./recurring-price.ts (so
// its PLATFORM-only behavior — no { stripeAccount } — is unit-testable with a fake
// Stripe). Here we just wrap the live client into the narrow seams.

/** Wrap the live Stripe client into the narrow SubscriptionCheckoutSeam, or null
 *  when no key is configured (→ the creator skips / stays inert). Both the
 *  Checkout session and the recurring price are created on the PLATFORM (no
 *  stripeAccount); the seller is paid via the session's transfer_data.destination. */
function getSubscriptionSeam(): SubscriptionCheckoutSeam | null {
  const stripe = getStripeClient();
  if (!stripe) return null;
  return {
    checkout: {
      sessions: {
        create: (params, options) => stripe.checkout.sessions.create(params, options),
      },
    },
    // The live Stripe client satisfies the narrower RecurringPriceStripe seam.
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
    baseUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com",
    now: () => new Date(),
  };
}

// ─── P3: usage reporting deps ────────────────────────────────────────────────

/** The live usage push. The metered subscription is a DIRECT charge — the
 *  subscription, the metered price + meter, the customer AND the meter events all
 *  live on the SELLER's connected account, so EVERY call passes
 *  { stripeAccount: connectAccountId }. The basil API meters by CUSTOMER via a
 *  meter event (the legacy subscriptionItems.createUsageRecord is gone), so we
 *  resolve the metered subscription item → its subscription → customer + the
 *  price's meter event_name, then fire ONE billing.meterEvent on that account.
 *  Fail-soft is the CALLER's job (reportAgentUsage swallows throws); this stays a
 *  thin live mapping. */
async function reportUsageLive(
  stripe: Stripe,
  input: { subscriptionItemId: string; connectAccountId: string; quantity: number; idempotencyKey: string },
): Promise<void> {
  const onAccount: Stripe.RequestOptions = { stripeAccount: input.connectAccountId };
  // The subscription item carries the price (→ meter) + its subscription (→ customer).
  const item = await stripe.subscriptionItems.retrieve(input.subscriptionItemId, {
    expand: ["price.recurring"],
    ...onAccount,
  });
  const meterId =
    typeof item.price?.recurring?.meter === "string" ? item.price.recurring.meter : null;
  // In the basil API a SubscriptionItem.subscription is the plain subscription id.
  const subscriptionId = item.subscription;
  if (!meterId || !subscriptionId) {
    throw new Error("metered subscription item missing meter or subscription");
  }
  const meter = await stripe.billing.meters.retrieve(meterId, onAccount);
  const subscription = await stripe.subscriptions.retrieve(subscriptionId, onAccount);
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
  if (!customerId) throw new Error("metered subscription missing customer");

  await stripe.billing.meterEvents.create(
    {
      event_name: meter.event_name,
      identifier: input.idempotencyKey,
      payload: {
        stripe_customer_id: customerId,
        value: String(input.quantity),
      },
    },
    onAccount,
  );
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

// ─── P4: buyer billing-portal deps ───────────────────────────────────────────

/** Build the production deps for resolveMarketplacePortalSession. The buyer's
 *  customer + subscription live on the SELLER's CONNECTED account (the
 *  subscriptions are direct charges), so the portal session is created on that
 *  account ({ stripeAccount }) — the caller passes the resolved
 *  sellerConnectAccountId on the PortalPurchase. The Stripe client itself is the
 *  same; the per-call { stripeAccount } scopes it. Inert without a Stripe key
 *  (getStripeClient() → null → the portal helper skips). */
export function buildMarketplacePortalDeps(returnUrl: string): MarketplacePortalDeps {
  return {
    getStripe: () => getStripeClient() as BillingPortalSeam | null,
    env: process.env as Record<string, string | undefined>,
    returnUrl,
  };
}

// ─── P3: resolve the renter's metered subscription item (rental-path wiring) ──

/** The resolved metered-subscription handle for a rental usage report: the
 *  subscription item the usage accrues to + the connected account it lives on
 *  (the metered subscription is a DIRECT charge). */
export type RenterMeteredSubscriptionItem = {
  subscriptionItemId: string;
  connectAccountId: string;
};

/**
 * Resolve the ACTIVE metered marketplace subscription item for a (renter org,
 * listing) pair, or null when there isn't one. Used at the `agent_rental_call`
 * accrual to decide whether to report a usage unit. Looks up the most recent
 * active metered purchase row for this buyer+listing, resolves the seller's
 * connected account (the subscription is a direct charge — it lives there), then
 * reads its subscription's first item id from Stripe ON that account. Returns null
 * (no report) on ANY miss — no flag, no key, no metered purchase, no connect
 * account, no subscription — so the rental path is unaffected unless a real
 * metered subscription exists.
 *
 * NEVER THROWS: a lookup failure returns null (the caller no-ops) so metering can
 * never break a rented agent.
 */
export async function resolveRenterMeteredSubscriptionItemId(input: {
  renterOrgId: string;
  listingId: string;
}): Promise<RenterMeteredSubscriptionItem | null> {
  try {
    const renterOrgId = String(input.renterOrgId ?? "").trim();
    const listingId = String(input.listingId ?? "").trim();
    if (!renterOrgId || !listingId) return null;

    const [row] = await db
      .select({
        subId: marketplacePurchases.stripeSubscriptionId,
        sellerOrgId: marketplacePurchases.sellerOrgId,
      })
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
    if (!subscriptionId || !row?.sellerOrgId) return null;

    // The subscription lives on the SELLER's connected account (direct charge).
    const connect = await readConnectStatus(row.sellerOrgId);
    const connectAccountId = connect.accountId?.trim();
    if (!connectAccountId) return null;

    const stripe = getStripeClient();
    if (!stripe) return null;

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      stripeAccount: connectAccountId,
    });
    const item = subscription.items?.data?.[0];
    if (!item?.id) return null;
    return { subscriptionItemId: item.id, connectAccountId };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[marketplace-billing] resolve_metered_item_error listing=${input.listingId} renter=${input.renterOrgId} err=${detail}`);
    return null;
  }
}
