// Unit tests for tier resolution from a Stripe Subscription's price
// items. Pins the contract used by the webhook handler so a change to
// the price-ids constants doesn't silently regress tier resolution.
//
// 2026-06-18 pricing migration — base prices map to the new ladder:
//   BUILDER_PRICE_ID   → builder
//   WORKSPACE_PRICE_ID → workspace   (legacy growth/starter also → workspace)
//   AGENCY_BASE_PRICE_ID → agency    (legacy scale/pro/agency also → agency)
// The no-subscription sentinel is "inactive" (was "free").

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveTierFromPriceIds,
  resolveTierFromSubscription,
} from "@/lib/billing/tier-resolve";
import {
  BUILDER_PRICE_ID,
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
  LEGACY_CLOUD_STARTER_PRICE_ID,
  LEGACY_CLOUD_PRO_PRICE_ID,
  LEGACY_CLOUD_AGENCY_PRICE_ID,
} from "@/lib/billing/price-ids";

describe("resolveTierFromPriceIds", () => {
  test("returns 'inactive' for empty input", () => {
    assert.equal(resolveTierFromPriceIds([]), "inactive");
    assert.equal(resolveTierFromPriceIds([null, null]), "inactive");
    assert.equal(resolveTierFromPriceIds([undefined, ""]), "inactive");
  });

  test("resolves each new base price id", () => {
    assert.equal(resolveTierFromPriceIds([BUILDER_PRICE_ID]), "builder");
    assert.equal(resolveTierFromPriceIds([WORKSPACE_PRICE_ID]), "workspace");
    assert.equal(resolveTierFromPriceIds([AGENCY_BASE_PRICE_ID]), "agency");
  });

  test("workspace base still wins alongside arbitrary metered/overage ids", () => {
    assert.equal(
      resolveTierFromPriceIds([
        "price_metered_xxx",
        WORKSPACE_PRICE_ID,
        "price_other_yyy",
      ]),
      "workspace"
    );
  });

  test("agency takes precedence when multiple base ids appear (mid-cycle upgrade safety)", () => {
    assert.equal(
      resolveTierFromPriceIds([BUILDER_PRICE_ID, AGENCY_BASE_PRICE_ID]),
      "agency"
    );
    assert.equal(
      resolveTierFromPriceIds([WORKSPACE_PRICE_ID, AGENCY_BASE_PRICE_ID]),
      "agency"
    );
  });

  test("legacy starter price grandfathers to workspace", () => {
    assert.equal(resolveTierFromPriceIds([LEGACY_CLOUD_STARTER_PRICE_ID]), "workspace");
  });

  test("legacy cloud_pro / cloud_agency grandfather to agency", () => {
    assert.equal(resolveTierFromPriceIds([LEGACY_CLOUD_PRO_PRICE_ID]), "agency");
    assert.equal(resolveTierFromPriceIds([LEGACY_CLOUD_AGENCY_PRICE_ID]), "agency");
  });

  test("unknown price id resolves to inactive", () => {
    assert.equal(resolveTierFromPriceIds(["price_unknown_xxx"]), "inactive");
  });
});

describe("resolveTierFromSubscription", () => {
  test("extracts price ids from items.data and resolves tier", () => {
    const subscription = {
      items: {
        data: [
          { price: { id: "price_metered_xxx" } },
          { price: { id: WORKSPACE_PRICE_ID } },
        ],
      },
    };
    assert.equal(resolveTierFromSubscription(subscription), "workspace");
  });

  test("handles missing price gracefully", () => {
    const subscription = {
      items: {
        data: [{ price: null }, { price: { id: AGENCY_BASE_PRICE_ID } }],
      },
    };
    assert.equal(resolveTierFromSubscription(subscription), "agency");
  });
});
