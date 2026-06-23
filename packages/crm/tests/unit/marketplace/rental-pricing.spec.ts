// Agent marketplace — the THREE-LANE rental charge resolver (pure, no DB).
//
// Every rental `tools/call` (deterministic tool or `ask`) is metered. This
// module is the single source of truth for WHICH lane a call falls into and
// HOW MUCH it costs — the x402 rail (agent-mcp-handler) reads it to decide
// whether to return a 402. Pure: same input → same output, no IO.
//
// The three lanes (confirmed by Max):
//   1. SeldonFrame first-party agents — FREE up to SF_FREE_CALLS/renter/listing
//      /month, then SF_FLOOR_CENTS_PER_CALL. SF keeps 100% (its own agent), so
//      feeCents = the whole charge.
//   2. Builders' agents — the listing's priceModel amount (per_usage
//      perCallPriceCents / per_outcome perOutcomePriceCents) + SF 5%
//      (computeMarketplaceFeeCents).
//   3. Deploy-into-workspace — NOT this rail.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveRentalCharge,
  SF_FREE_CALLS,
  SF_FLOOR_CENTS_PER_CALL,
  type RentalChargeListing,
} from "../../../src/lib/marketplace/rental-pricing";
import { computeMarketplaceFeeCents } from "../../../src/lib/billing/gmv";

/** A minimal listing-pricing projection the resolver reasons over. */
function listing(over: Partial<RentalChargeListing> = {}): RentalChargeListing {
  return {
    priceModel: "onetime",
    perCallPriceCents: null,
    perOutcomePriceCents: null,
    ...over,
  };
}

describe("constants are exported (UI/copy never hardcodes them)", () => {
  test("SF_FREE_CALLS is 100", () => {
    assert.equal(SF_FREE_CALLS, 100);
  });
  test("SF_FLOOR_CENTS_PER_CALL is 2", () => {
    assert.equal(SF_FLOOR_CENTS_PER_CALL, 2);
  });
});

describe("lane 1 — SeldonFrame first-party agents", () => {
  test("under the free allowance → sf_free, $0, no payment", () => {
    const c = resolveRentalCharge({ listing: listing(), isFirstParty: true, renterCallsThisMonth: 0 });
    assert.equal(c.lane, "sf_free");
    assert.equal(c.amountCents, 0);
    assert.equal(c.feeCents, 0);
    assert.equal(c.requiresPayment, false);
  });

  test("the LAST free call (99 prior calls = the 100th) is still free", () => {
    // renterCallsThisMonth counts calls ALREADY made this month. With 99 prior,
    // this is the 100th call → still inside SF_FREE_CALLS.
    const c = resolveRentalCharge({ listing: listing(), isFirstParty: true, renterCallsThisMonth: 99 });
    assert.equal(c.lane, "sf_free");
    assert.equal(c.requiresPayment, false);
  });

  test("the boundary: with 100 prior calls (the 101st) → sf_floor, floor charged, payment due", () => {
    const c = resolveRentalCharge({ listing: listing(), isFirstParty: true, renterCallsThisMonth: SF_FREE_CALLS });
    assert.equal(c.lane, "sf_floor");
    assert.equal(c.amountCents, SF_FLOOR_CENTS_PER_CALL);
    assert.equal(c.requiresPayment, true);
    // SF keeps 100% of its own agent's floor → fee is the entire charge.
    assert.equal(c.feeCents, SF_FLOOR_CENTS_PER_CALL);
  });

  test("well over the allowance → sf_floor every call", () => {
    const c = resolveRentalCharge({ listing: listing(), isFirstParty: true, renterCallsThisMonth: 5000 });
    assert.equal(c.lane, "sf_floor");
    assert.equal(c.amountCents, SF_FLOOR_CENTS_PER_CALL);
    assert.equal(c.requiresPayment, true);
  });
});

describe("lane 2 — builders' agents (priceModel + SF 5%)", () => {
  test("per_usage paid → builder lane, the per-call price, 5% fee", () => {
    const c = resolveRentalCharge({
      listing: listing({ priceModel: "per_usage", perCallPriceCents: 200 }),
      isFirstParty: false,
      renterCallsThisMonth: 0,
    });
    assert.equal(c.lane, "builder");
    assert.equal(c.amountCents, 200);
    assert.equal(c.requiresPayment, true);
    // Fee uses the SAME primitive as checkout — 5% of $2.00 = 10 cents.
    assert.equal(c.feeCents, computeMarketplaceFeeCents(200));
    assert.equal(c.feeCents, 10);
  });

  test("per_outcome paid → builder lane, the per-outcome price, 5% fee", () => {
    const c = resolveRentalCharge({
      listing: listing({ priceModel: "per_outcome", perOutcomePriceCents: 1000, outcomeType: "booking" }),
      isFirstParty: false,
      renterCallsThisMonth: 3,
    });
    assert.equal(c.lane, "builder");
    assert.equal(c.amountCents, 1000);
    assert.equal(c.requiresPayment, true);
    assert.equal(c.feeCents, computeMarketplaceFeeCents(1000));
    assert.equal(c.feeCents, 50);
  });

  test("builder allowance does NOT apply — even the first call is charged", () => {
    // First-party gets a free allowance; builders bill from call #1 (their meter).
    const c = resolveRentalCharge({
      listing: listing({ priceModel: "per_usage", perCallPriceCents: 200 }),
      isFirstParty: false,
      renterCallsThisMonth: 0,
    });
    assert.equal(c.lane, "builder");
    assert.equal(c.requiresPayment, true);
  });
});

describe("lane: free — builder agent with no metered price", () => {
  test("onetime / free listing → free lane, $0, no payment", () => {
    const c = resolveRentalCharge({ listing: listing({ priceModel: "onetime" }), isFirstParty: false, renterCallsThisMonth: 0 });
    assert.equal(c.lane, "free");
    assert.equal(c.amountCents, 0);
    assert.equal(c.feeCents, 0);
    assert.equal(c.requiresPayment, false);
  });

  test("per_usage but price unset (0/null) → free lane (nothing to charge)", () => {
    const c = resolveRentalCharge({
      listing: listing({ priceModel: "per_usage", perCallPriceCents: 0 }),
      isFirstParty: false,
      renterCallsThisMonth: 0,
    });
    assert.equal(c.lane, "free");
    assert.equal(c.requiresPayment, false);
  });

  test("monthly model → free on this PER-CALL rail (subscription settled elsewhere)", () => {
    // The per-call rail only meters per_usage / per_outcome. A monthly listing
    // isn't metered per call here, so a rental call is free on this rail.
    const c = resolveRentalCharge({
      listing: listing({ priceModel: "monthly", monthlyPriceCents: 2900 }),
      isFirstParty: false,
      renterCallsThisMonth: 0,
    });
    assert.equal(c.lane, "free");
    assert.equal(c.requiresPayment, false);
  });
});

describe("defensive — non-finite / negative guarded", () => {
  test("negative perCallPriceCents → free (junk price not chargeable)", () => {
    const c = resolveRentalCharge({
      listing: listing({ priceModel: "per_usage", perCallPriceCents: -50 }),
      isFirstParty: false,
      renterCallsThisMonth: 0,
    });
    assert.equal(c.lane, "free");
    assert.equal(c.requiresPayment, false);
  });

  test("NaN perOutcomePriceCents → free", () => {
    const c = resolveRentalCharge({
      listing: listing({ priceModel: "per_outcome", perOutcomePriceCents: Number.NaN, outcomeType: "booking" }),
      isFirstParty: false,
      renterCallsThisMonth: 0,
    });
    assert.equal(c.lane, "free");
  });

  test("negative renterCallsThisMonth on first-party → treated as inside allowance (sf_free)", () => {
    const c = resolveRentalCharge({ listing: listing(), isFirstParty: true, renterCallsThisMonth: -10 });
    assert.equal(c.lane, "sf_free");
    assert.equal(c.requiresPayment, false);
  });

  test("non-finite renterCallsThisMonth on first-party → safe (charges the floor, never free-by-accident)", () => {
    // A corrupt counter must NOT silently grant unlimited free calls. NaN is not
    // < allowance, so it falls through to the floor (fail-closed on money).
    const c = resolveRentalCharge({ listing: listing(), isFirstParty: true, renterCallsThisMonth: Number.NaN });
    assert.equal(c.lane, "sf_floor");
    assert.equal(c.requiresPayment, true);
  });

  test("amounts are always finite integers", () => {
    const c = resolveRentalCharge({
      listing: listing({ priceModel: "per_usage", perCallPriceCents: 199.6 }),
      isFirstParty: false,
      renterCallsThisMonth: 0,
    });
    assert.ok(Number.isInteger(c.amountCents));
    assert.ok(Number.isInteger(c.feeCents));
  });
});
