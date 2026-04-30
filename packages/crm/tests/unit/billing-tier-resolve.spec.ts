// Unit tests for tier resolution from a Stripe Subscription's price
// items. Pins the contract used by the webhook handler so a change to
// the price-ids constants doesn't silently regress tier resolution.
//
// April 30, 2026 — pricing migration. Multi-price subscriptions
// (base + metered) made the items[0]?.price?.id approach brittle: the
// metered overage line could sort to items[0] depending on Stripe's
// item ordering, defaulting the tier to "free" for an active paying
// customer. resolveTierFromPriceIds scans every price id and picks
// the highest tier present.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveTierFromPriceIds,
  resolveTierFromSubscription,
} from "@/lib/billing/tier-resolve";
import {
  GROWTH_BASE_PRICE_ID,
  SCALE_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "@/lib/billing/price-ids";

describe("resolveTierFromPriceIds", () => {
  test("returns 'free' for empty input", () => {
    assert.equal(resolveTierFromPriceIds([]), "free");
    assert.equal(resolveTierFromPriceIds([null, null]), "free");
    assert.equal(resolveTierFromPriceIds([undefined, ""]), "free");
  });

  test("returns 'growth' for the growth base id alone", () => {
    assert.equal(resolveTierFromPriceIds([GROWTH_BASE_PRICE_ID]), "growth");
  });

  test("returns 'scale' for the scale base id alone", () => {
    assert.equal(resolveTierFromPriceIds([SCALE_BASE_PRICE_ID]), "scale");
  });

  test("returns 'growth' when growth base + metered overage prices are present", () => {
    // Multi-price subscription: base flat + 2 metered overages. The
    // metered prices are arbitrary strings (env-driven, may be unset
    // in tests); the key thing is that the growth base still wins
    // the lookup.
    assert.equal(
      resolveTierFromPriceIds([
        "price_growth_metered_contacts_xxx",
        GROWTH_BASE_PRICE_ID,
        "price_growth_metered_runs_xxx",
      ]),
      "growth"
    );
  });

  test("scale takes precedence when both growth and scale ids appear (mid-cycle upgrade safety)", () => {
    // Defensive — if a subscription somehow carries both base prices
    // (e.g. mid-upgrade race), pick the heavier tier so the operator
    // doesn't get downgraded entitlements transiently.
    assert.equal(
      resolveTierFromPriceIds([GROWTH_BASE_PRICE_ID, SCALE_BASE_PRICE_ID]),
      "scale"
    );
  });

  test("legacy starter price grandfathers to growth", () => {
    assert.equal(resolveTierFromPriceIds([LEGACY_CLOUD_STARTER_PRICE_ID]), "growth");
  });

  test("legacy cloud_pro grandfathers to scale", () => {
    assert.equal(resolveTierFromPriceIds([LEGACY_CLOUD_PRO_PRICE_ID]), "scale");
  });

  test("legacy cloud_agency grandfathers to scale", () => {
    assert.equal(resolveTierFromPriceIds([LEGACY_CLOUD_AGENCY_PRICE_ID]), "scale");
  });

  test("unknown price id resolves to free (no price id allowlist match)", () => {
    assert.equal(resolveTierFromPriceIds(["price_unknown_xxx"]), "free");
  });
});

describe("resolveTierFromSubscription", () => {
  test("extracts price ids from items.data and resolves tier", () => {
    const subscription = {
      items: {
        data: [
          { price: { id: "price_metered_xxx" } },
          { price: { id: GROWTH_BASE_PRICE_ID } },
        ],
      },
    };
    assert.equal(resolveTierFromSubscription(subscription), "growth");
  });

  test("handles missing price gracefully", () => {
    const subscription = {
      items: {
        data: [{ price: null }, { price: { id: SCALE_BASE_PRICE_ID } }],
      },
    };
    assert.equal(resolveTierFromSubscription(subscription), "scale");
  });
});
