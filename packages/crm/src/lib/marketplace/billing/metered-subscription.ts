// #139 P3 — metered (per_usage / per_outcome) agent SUBSCRIPTION + usage report.
//
// THE PROOF: a Stripe Checkout Session in `mode:"subscription"` whose recurring
// Price is METERED (usage-based), at the listing's per-call (per_usage) or
// per-outcome (per_outcome) amount, created as a DIRECT charge ON the seller's
// connected account ({ stripeAccount }) — same 5% application_fee_percent +
// idempotency + a persisted pending purchase row as the monthly path, with NO
// transfer_data (a direct charge: the seller bears Stripe's fee + SF's 5% arrives
// clean). The renter is billed only for what they consume; SeldonFrame reports the
// usage (the meter lives on the connected account too — see recurring-price.ts).
//
// reportAgentUsage(...) pushes ONE usage record / meter event to Stripe. It is
// wired (behind the flag, fail-soft) at the existing `agent_rental_call` accrual
// so a RENTED metered agent reports 1 unit per run. It is a NO-OP when there's
// no metered subscription, the flag is off, or no Stripe key is configured, and
// it NEVER throws into the rental path.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY (same contract as P1/P2):
//   • DI'd seam → unit tests use a FAKE Stripe (no network/key/charge).
//   • INERT without a Stripe key (getStripe() → null → skip / no-op).
//   • Subscribes ONLY when SF_MARKETPLACE_BILLING is ON, the model is per_usage
//     or per_outcome with a positive amount, the seller is Connect-ready, AND a
//     key is configured. Any miss → { skipped } + NO Stripe call.
//   • reportAgentUsage swallows every error (fail-soft) so a metering hiccup can
//     never break a rented agent's reply.
// ─────────────────────────────────────────────────────────────────────────────

import { storefrontPriceFromRow } from "@/lib/marketplace/pricing-model";
import type {
  MarketplacePurchaseRow,
  MarketplaceStripeMode,
  NewMarketplacePurchase,
} from "@/db/schema/marketplace-purchases";
import { MARKETPLACE_FEE_PERCENT } from "@/lib/billing/gmv";
import {
  isBillingEnabled,
  resolveBillingMode,
} from "./billing-mode";
import {
  skip,
  type RecurringCheckoutListing,
  type RecurringPriceRef,
  type SubscriptionCheckoutDeps,
  type SubscriptionCheckoutResult,
} from "./subscription-deps";

export type CreateMeteredAgentSubscriptionInput = {
  listing: RecurringCheckoutListing;
  buyerOrgId: string;
  /** The seller / agent-creator's org (the fee-attribution + ledger side). */
  sellerOrgId: string;
};

/** The metered models this creator settles (per call / per outcome). */
const METERED_MODELS = new Set(["per_usage", "per_outcome"]);

/** The amount (cents) the chosen metered model bills per reported unit. */
function meteredUnitAmountCents(listing: RecurringCheckoutListing): number {
  if (listing.priceModel === "per_usage") {
    const c = Number(listing.perCallPriceCents ?? 0);
    return Number.isFinite(c) && c > 0 ? Math.round(c) : 0;
  }
  if (listing.priceModel === "per_outcome") {
    const c = Number(listing.perOutcomePriceCents ?? 0);
    return Number.isFinite(c) && c > 0 ? Math.round(c) : 0;
  }
  return 0;
}

/**
 * Build a METERED subscription Checkout Session for a `per_usage` / `per_outcome`
 * agent listing as a PLATFORM destination charge (session + metered price + meter
 * on the platform; seller paid via transfer_data.destination), persist a pending
 * purchase row, and return the Checkout URL. Returns { skipped } (NO Stripe call)
 * when the billing flag is OFF, the model isn't metered, the per-unit amount is
 * non-positive, the seller isn't Connect-ready, or no Stripe key is configured.
 */
export async function createMeteredAgentSubscription(
  input: CreateMeteredAgentSubscriptionInput,
  deps: SubscriptionCheckoutDeps,
): Promise<SubscriptionCheckoutResult> {
  const { listing, buyerOrgId, sellerOrgId } = input;

  // 1) Feature-flag gate (default OFF → free install).
  if (!isBillingEnabled(deps.env)) return skip("billing_disabled");

  // 2) Pricing gate — metered models only, with a positive per-unit amount.
  if (!METERED_MODELS.has(String(listing.priceModel))) return skip("not_metered");
  // storefrontPriceFromRow already resolves the per-call/per-outcome amount.
  const resolved = storefrontPriceFromRow(listing);
  const unitAmountCents = meteredUnitAmountCents(listing) || (resolved.isPaid ? resolved.priceCents : 0);
  if (unitAmountCents <= 0) return skip("not_paid");

  // 3) Connect gate — a not-ready seller keeps the free-install fallback.
  const connect = await deps.readConnectStatus(sellerOrgId);
  const destination = connect.accountId;
  if (!connect.ready || !destination) return skip("seller_not_connected");

  // 4) INERT without a Stripe key.
  const stripe = deps.getStripe();
  if (!stripe) return skip("stripe_unconfigured");

  // 5) Resolve test vs live.
  const stripeMode: MarketplaceStripeMode = resolveBillingMode(deps.env);
  const feePercent = MARKETPLACE_FEE_PERCENT;
  const idempotencyKey = `mkt-metered-${buyerOrgId}-${listing.id}`;

  // 6) Create-or-lookup a METERED recurring price on the SELLER's CONNECTED
  //    account (usage_type:"metered" + a meter on that account the usage records
  //    report to). A direct charge: the price + meter live on the connected
  //    account, matching the session below.
  const priceRef: RecurringPriceRef = await stripe.resolveRecurringPrice({
    listingId: listing.id,
    listingName: listing.name,
    unitAmountCents,
    interval: "month",
    usageType: "metered",
    connectAccountId: destination,
  });

  // 7) Create the metered SUBSCRIPTION Checkout Session as a DIRECT charge ON the
  //    seller's connected account ({ stripeAccount: destination }). NO
  //    transfer_data (a direct charge); SF takes application_fee_percent.
  const session = await stripe.checkout.sessions.create(
    {
      mode: "subscription",
      success_url: `${deps.baseUrl}/marketplace/${listing.slug}?purchased=true`,
      cancel_url: `${deps.baseUrl}/marketplace/${listing.slug}`,
      // A metered line item carries NO quantity (Stripe bills reported usage).
      line_items: [{ price: priceRef.priceId }],
      subscription_data: {
        application_fee_percent: feePercent,
      },
      metadata: {
        type: "marketplace_agent_subscription",
        priceModel: String(listing.priceModel),
        listingId: listing.id,
        listingSlug: listing.slug,
        buyerOrgId,
        sellerOrgId,
        ...(priceRef.meterId ? { meterId: priceRef.meterId } : {}),
      },
    },
    { idempotencyKey, stripeAccount: destination },
  );

  // 8) Persist the pending settlement row (subscription id reconciled by P4).
  const purchase: MarketplacePurchaseRow = await deps.createPurchase({
    listingId: listing.id,
    slug: listing.slug,
    buyerOrgId,
    sellerOrgId,
    priceModel: listing.priceModel === "per_outcome" ? "per_outcome" : "per_usage",
    // The per-unit amount; the per-cycle total is computed by Stripe from usage.
    amountCents: unitAmountCents,
    feeCents: 0,
    stripeMode,
    stripeCheckoutId: session.id,
    status: "pending",
  } satisfies NewMarketplacePurchase);

  return { ok: true, url: session.url ?? null, purchaseId: purchase.id, stripeMode };
}

// ─── usage reporting ─────────────────────────────────────────────────────────

/** The narrow Stripe seam reportAgentUsage drives — just the usage push. The
 *  real dep maps this to the live Stripe meter-event call (on the connected
 *  account); the test fakes it and records the args. */
export type UsageReportSeam = {
  reportUsage(input: {
    /** The metered subscription item the usage accrues to (on the connected account). */
    subscriptionItemId: string;
    /** The seller's connected account id the subscription + meter live on. */
    connectAccountId: string;
    /** Units consumed (1 per agent call by default). */
    quantity: number;
    /** Idempotency key so a retried report doesn't double-count. */
    idempotencyKey: string;
  }): Promise<void>;
};

export type ReportAgentUsageInput = {
  subscriptionItemId: string;
  /** The seller's connected account id (the metered subscription is a direct
   *  charge — the subscription + meter live there). */
  connectAccountId: string;
  quantity: number;
  idempotencyKey: string;
};

export type ReportAgentUsageDeps = {
  /** The usage seam, or null when no key is configured (→ no-op). */
  getUsageReporter: () => UsageReportSeam | null;
  /** The environment (for the SF_MARKETPLACE_BILLING flag). */
  env: Record<string, string | undefined>;
};

export type ReportAgentUsageResult =
  | { ok: true }
  | { ok: false; skipped: true; reason: string };

/**
 * Push ONE usage record / meter event to Stripe for a metered agent rental.
 * Wired (behind the flag, fail-soft) at the `agent_rental_call` accrual: when a
 * RENTED agent backed by a metered purchase runs, this reports `quantity` units.
 *
 * NO-OP (→ { skipped }) when: the billing flag is OFF, no Stripe key is
 * configured (getUsageReporter() === null), there's no subscription item, or the
 * quantity is non-positive. NEVER THROWS — any error from the Stripe push is
 * swallowed and returned as { skipped, reason:"report_failed" } so a metering
 * failure can never break the rented agent's reply.
 */
export async function reportAgentUsage(
  input: ReportAgentUsageInput,
  deps: ReportAgentUsageDeps,
): Promise<ReportAgentUsageResult> {
  try {
    if (!isBillingEnabled(deps.env)) return { ok: false, skipped: true, reason: "billing_disabled" };

    const subscriptionItemId = String(input.subscriptionItemId ?? "").trim();
    if (!subscriptionItemId) return { ok: false, skipped: true, reason: "no_subscription_item" };

    const connectAccountId = String(input.connectAccountId ?? "").trim();
    if (!connectAccountId) return { ok: false, skipped: true, reason: "no_connect_account" };

    const quantity = Number(input.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, skipped: true, reason: "non_positive_quantity" };
    }

    const reporter = deps.getUsageReporter();
    if (!reporter) return { ok: false, skipped: true, reason: "stripe_unconfigured" };

    await reporter.reportUsage({
      subscriptionItemId,
      connectAccountId,
      quantity: Math.round(quantity),
      idempotencyKey: String(input.idempotencyKey ?? "").trim() || `mkt-usage-${subscriptionItemId}-${Date.now()}`,
    });
    return { ok: true };
  } catch (err) {
    // Fail-soft: NEVER let a metering error escape into the rental path.
    const detail = err instanceof Error ? err.message : String(err);
    console.error(`[marketplace-billing] report_usage_error item=${input.subscriptionItemId} err=${detail}`);
    return { ok: false, skipped: true, reason: "report_failed" };
  }
}
