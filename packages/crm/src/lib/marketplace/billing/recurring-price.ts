// #139 — the (live) create-or-lookup of a recurring Price (and, for metered, a
// Meter) on the PLATFORM Stripe account.
//
// THE INVARIANT (the whole reason this module exists separately): the recurring
// Price AND the Meter are created on the PLATFORM — NO connected-account
// (`{ stripeAccount }`) request option on any Stripe call here. They MUST live on
// the same account where monthly-/metered-subscription create the Checkout
// session (also the platform). The seller is still paid: the session carries
// `subscription_data.transfer_data.destination = seller` + `application_fee_percent`,
// i.e. a PLATFORM DESTINATION CHARGE — the customer + subscription + price + meter
// all live on the platform; only the funds settle out to the seller.
//
// This is split out of real-deps.ts (which imports @/db + the live Stripe client)
// so the platform-only behavior is unit-testable through a narrow DI seam with a
// FAKE Stripe — no @/db, no network, no real key. real-deps.ts wraps the live
// Stripe client into RecurringPriceStripe and calls resolveRecurringPriceLive.

import type Stripe from "stripe";
import type {
  RecurringPriceRef,
  ResolveRecurringPriceParams,
} from "./subscription-deps";

/** The narrow Stripe surface the recurring-price create-or-lookup actually uses —
 *  prices.list / prices.create and (metered only) billing.meters.list /
 *  billing.meters.create. The live Stripe client satisfies this; the unit test
 *  passes a fake that records the RequestOptions of every call (to prove none
 *  carry a `{ stripeAccount }` option). Typed against the real Stripe SDK so the
 *  call site can't drift. */
export type RecurringPriceStripe = {
  prices: {
    list(
      params: Stripe.PriceListParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.ApiList<Stripe.Price>>;
    create(
      params: Stripe.PriceCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Stripe.Price>;
  };
  billing: {
    meters: {
      list(
        params: Stripe.Billing.MeterListParams,
        options?: Stripe.RequestOptions,
      ): Promise<Stripe.ApiList<Stripe.Billing.Meter>>;
      create(
        params: Stripe.Billing.MeterCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<Stripe.Billing.Meter>;
    };
  };
};

/** A stable lookup_key so re-listing the same listing at the same amount reuses
 *  one Price on the PLATFORM (idempotent create-or-lookup). */
function recurringLookupKey(params: ResolveRecurringPriceParams): string {
  return [
    "sf",
    params.usageType === "metered" ? "metered" : "monthly",
    params.listingId,
    params.unitAmountCents,
  ].join("_");
}

/**
 * Create-or-lookup the recurring Price for a listing on the PLATFORM account. For
 * metered prices it also ensures a Stripe Meter exists (on the platform) and
 * points the price at it. NO `{ stripeAccount }` option is ever passed — the
 * price + meter live on the platform, matching the platform Checkout session that
 * references them. The seller destination is applied at the session level (the
 * caller), NOT here.
 */
export async function resolveRecurringPriceLive(
  stripe: RecurringPriceStripe,
  params: ResolveRecurringPriceParams,
): Promise<RecurringPriceRef> {
  const lookupKey = recurringLookupKey(params);

  // 1) Reuse an existing price with this lookup_key if present (PLATFORM).
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1,
    expand: ["data.recurring"],
  });
  const found = existing.data[0];
  if (found) {
    const meterId =
      typeof found.recurring?.meter === "string" ? found.recurring.meter : null;
    return { priceId: found.id, meterId };
  }

  // 2) For metered, ensure a meter exists on the PLATFORM (event_name stable per listing).
  let meterId: string | null = null;
  let eventName: string | undefined;
  if (params.usageType === "metered") {
    eventName = `sf_agent_usage_${params.listingId}`;
    const meters = await stripe.billing.meters.list({ status: "active", limit: 100 });
    const existingMeter = meters.data.find((m) => m.event_name === eventName);
    if (existingMeter) {
      meterId = existingMeter.id;
    } else {
      const meter = await stripe.billing.meters.create({
        display_name: `SeldonFrame agent usage — ${params.listingName}`.slice(0, 250),
        event_name: eventName,
        default_aggregation: { formula: "sum" },
      });
      meterId = meter.id;
    }
  }

  // 3) Create the recurring price on the PLATFORM (licensed flat monthly OR metered usage).
  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: params.unitAmountCents,
    lookup_key: lookupKey,
    product_data: { name: `SeldonFrame Agent: ${params.listingName}` },
    recurring: {
      interval: params.interval,
      usage_type: params.usageType,
      ...(meterId ? { meter: meterId } : {}),
    },
  });
  return { priceId: price.id, meterId };
}
