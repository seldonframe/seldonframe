// Unit tests for lib/marketplace/billing/recurring-price.ts — the #139 CONNECTED
// create-or-lookup of a recurring Price (and, for metered, a Meter). The whole
// point of this test: prove the Price AND the Meter are created on the SELLER's
// CONNECTED account — i.e. EVERY Stripe call carries the
// `{ stripeAccount: connectAccountId }` request option — so they exist on the same
// account where monthly-/metered-subscription create the direct-charge Checkout
// session. (The seller bears Stripe's fee; SF takes the % application fee at the
// session level — a DIRECT charge, no transfer_data.)
//
// A FAKE Stripe is the ONLY Stripe: it records the RequestOptions passed to every
// prices.list / prices.create / billing.meters.list / billing.meters.create call
// so we can assert `options?.stripeAccount === <seller>` on each. No network, no
// real key, no db.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import { resolveRecurringPriceLive } from "../../../../src/lib/marketplace/billing/recurring-price";
import type { RecurringPriceStripe } from "../../../../src/lib/marketplace/billing/recurring-price";
import type { ResolveRecurringPriceParams } from "../../../../src/lib/marketplace/billing/subscription-deps";

// ─── fake Stripe that records the RequestOptions of every call ────────────────

type ListCall = { params: Stripe.PriceListParams; options?: Stripe.RequestOptions };
type CreateCall = { params: Stripe.PriceCreateParams; options?: Stripe.RequestOptions };
type MeterListCall = { params: Stripe.Billing.MeterListParams; options?: Stripe.RequestOptions };
type MeterCreateCall = { params: Stripe.Billing.MeterCreateParams; options?: Stripe.RequestOptions };

function makeFakeStripe(opts?: {
  existingPrice?: { id: string; meter?: string | null };
  existingMeter?: { id: string; event_name: string };
  createdPriceId?: string;
  createdMeterId?: string;
}) {
  const priceListCalls: ListCall[] = [];
  const priceCreateCalls: CreateCall[] = [];
  const meterListCalls: MeterListCall[] = [];
  const meterCreateCalls: MeterCreateCall[] = [];

  const stripe: RecurringPriceStripe = {
    prices: {
      async list(params, options) {
        priceListCalls.push({ params, options });
        const data = opts?.existingPrice
          ? [
              {
                id: opts.existingPrice.id,
                recurring: { meter: opts.existingPrice.meter ?? null },
              } as unknown as Stripe.Price,
            ]
          : [];
        return { data } as Stripe.ApiList<Stripe.Price>;
      },
      async create(params, options) {
        priceCreateCalls.push({ params, options });
        return { id: opts?.createdPriceId ?? "price_created_1" } as Stripe.Price;
      },
    },
    billing: {
      meters: {
        async list(params, options) {
          meterListCalls.push({ params, options });
          const data = opts?.existingMeter
            ? [
                {
                  id: opts.existingMeter.id,
                  event_name: opts.existingMeter.event_name,
                } as unknown as Stripe.Billing.Meter,
              ]
            : [];
          return { data } as Stripe.ApiList<Stripe.Billing.Meter>;
        },
        async create(params, options) {
          meterCreateCalls.push({ params, options });
          return { id: opts?.createdMeterId ?? "mtr_created_1" } as Stripe.Billing.Meter;
        },
      },
    },
  };

  return { stripe, priceListCalls, priceCreateCalls, meterListCalls, meterCreateCalls };
}

const SELLER = "acct_seller_x";

const LICENSED: ResolveRecurringPriceParams = {
  listingId: "listing-m1",
  listingName: "Speed to Lead",
  unitAmountCents: 2900,
  interval: "month",
  usageType: "licensed",
  connectAccountId: SELLER,
};

const METERED: ResolveRecurringPriceParams = {
  listingId: "listing-u1",
  listingName: "Review Responder",
  unitAmountCents: 200,
  interval: "month",
  usageType: "metered",
  connectAccountId: SELLER,
};

/** Assert EVERY call carried the seller's connected-account request option. */
function assertOnConnectedAccount(calls: Array<{ options?: Stripe.RequestOptions }>) {
  for (const c of calls) {
    assert.equal(
      c.options?.stripeAccount,
      SELLER,
      "expected { stripeAccount: seller } option (must be created on the CONNECTED account — a direct charge)",
    );
  }
}

// ─── licensed (monthly) ───────────────────────────────────────────────────────

describe("resolveRecurringPriceLive — licensed (monthly), CONNECTED account", () => {
  test("creates the Price on the CONNECTED account (stripeAccount=seller) at the real amount", async () => {
    const fake = makeFakeStripe({ createdPriceId: "price_monthly_new" });
    const ref = await resolveRecurringPriceLive(fake.stripe, LICENSED);

    assert.equal(ref.priceId, "price_monthly_new");
    assert.equal(ref.meterId, null);

    // Looked up once, created once — both on the connected account.
    assert.equal(fake.priceListCalls.length, 1);
    assert.equal(fake.priceCreateCalls.length, 1);
    assertOnConnectedAccount(fake.priceListCalls);
    assertOnConnectedAccount(fake.priceCreateCalls);

    // Licensed → no meter touched at all.
    assert.equal(fake.meterListCalls.length, 0);
    assert.equal(fake.meterCreateCalls.length, 0);

    // The created price carries the real amount + a licensed monthly recurring.
    const created = fake.priceCreateCalls[0].params;
    assert.equal(created.unit_amount, 2900);
    assert.equal(created.currency, "usd");
    assert.equal(created.recurring?.interval, "month");
    assert.equal(created.recurring?.usage_type, "licensed");
  });

  test("reuses an existing Price by lookup_key (still CONNECTED, no create)", async () => {
    const fake = makeFakeStripe({ existingPrice: { id: "price_existing", meter: null } });
    const ref = await resolveRecurringPriceLive(fake.stripe, LICENSED);

    assert.equal(ref.priceId, "price_existing");
    assert.equal(fake.priceCreateCalls.length, 0);
    assert.equal(fake.priceListCalls.length, 1);
    assertOnConnectedAccount(fake.priceListCalls);
  });
});

// ─── metered (per_usage / per_outcome) ────────────────────────────────────────

describe("resolveRecurringPriceLive — metered, CONNECTED account", () => {
  test("creates BOTH the Meter and the Price on the CONNECTED account (stripeAccount=seller)", async () => {
    const fake = makeFakeStripe({ createdMeterId: "mtr_new", createdPriceId: "price_metered_new" });
    const ref = await resolveRecurringPriceLive(fake.stripe, METERED);

    assert.equal(ref.priceId, "price_metered_new");
    assert.equal(ref.meterId, "mtr_new");

    // Meter: listed once + created once — both on the connected account.
    assert.equal(fake.meterListCalls.length, 1);
    assert.equal(fake.meterCreateCalls.length, 1);
    assertOnConnectedAccount(fake.meterListCalls);
    assertOnConnectedAccount(fake.meterCreateCalls);

    // Price: listed once + created once — both on the connected account.
    assert.equal(fake.priceListCalls.length, 1);
    assert.equal(fake.priceCreateCalls.length, 1);
    assertOnConnectedAccount(fake.priceListCalls);
    assertOnConnectedAccount(fake.priceCreateCalls);

    // The created price is metered + points at the created meter.
    const created = fake.priceCreateCalls[0].params;
    assert.equal(created.unit_amount, 200);
    assert.equal(created.recurring?.usage_type, "metered");
    assert.equal(created.recurring?.meter, "mtr_new");

    // The created meter uses the stable per-listing event_name.
    assert.equal(fake.meterCreateCalls[0].params.event_name, "sf_agent_usage_listing-u1");
  });

  test("reuses an existing Meter by event_name (no meter create), Price still CONNECTED", async () => {
    const fake = makeFakeStripe({
      existingMeter: { id: "mtr_existing", event_name: "sf_agent_usage_listing-u1" },
      createdPriceId: "price_metered_new",
    });
    const ref = await resolveRecurringPriceLive(fake.stripe, METERED);

    assert.equal(ref.meterId, "mtr_existing");
    assert.equal(fake.meterCreateCalls.length, 0);
    assert.equal(fake.meterListCalls.length, 1);
    assertOnConnectedAccount(fake.meterListCalls);

    // Price still created on the connected account, pointing at the reused meter.
    assert.equal(fake.priceCreateCalls.length, 1);
    assertOnConnectedAccount(fake.priceCreateCalls);
    assert.equal(fake.priceCreateCalls[0].params.recurring?.meter, "mtr_existing");
  });
});
