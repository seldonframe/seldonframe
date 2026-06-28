// Unit test for the #139 install ROUTER decision — selectInstallCreator. This is
// the pure mapping installAgentListingAction uses to pick which billing creator
// runs for a listing's pricing model (P1 one-time / P2 monthly / P3 metered /
// free). Proving the mapping here keeps the routing correct without standing up
// the action's auth + db.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { selectInstallCreator } from "../../../../src/lib/marketplace/billing/subscription-deps";

describe("selectInstallCreator — install router picks the right creator per priceModel", () => {
  test("onetime → the one-time Checkout (P1)", () => {
    assert.equal(selectInstallCreator("onetime"), "onetime");
  });

  test("monthly → the monthly subscription (P2)", () => {
    assert.equal(selectInstallCreator("monthly"), "monthly");
  });

  test("per_usage / per_outcome → the metered subscription (P3)", () => {
    assert.equal(selectInstallCreator("per_usage"), "metered");
    assert.equal(selectInstallCreator("per_outcome"), "metered");
  });

  test("unknown non-null model → free; null/undefined (legacy) → onetime default", () => {
    // A genuinely unknown model string → free (today's free-install path).
    assert.equal(selectInstallCreator("mystery"), "free");
    // A NULLISH model coerces to the onetime default (legacy rows have no model
    // column / null), so they keep the existing one-time behavior — never lost.
    assert.equal(selectInstallCreator(null), "onetime");
    assert.equal(selectInstallCreator(undefined), "onetime");
  });
});
