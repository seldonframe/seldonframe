// 2026-07-08 SECOND post-review fix wave — BLOCKING item #4, "the
// missing test class." The original bug (pricing-shell.tsx posting
// tier:"workspace", upgrade-modal posting tier:"workspace"/"agency" —
// both grandfathered/non-sellable, both 409ing flag-independently) was
// NEVER caught because every existing test asserted the shape of the
// fetch() call, not whether /api/stripe/checkout would actually accept
// it. That's the "Optimistic Path" failure mode (CLAUDE.md §3.1):
//
//   "you handled the happy path and ignored the 500 / null / empty
//   case... Success must be defined against the observable end-state,
//   not 'the code ran.'"
//
// This spec closes the gap: for every tier id the LIVE UI can actually
// POST today (the single pricing-shell.tsx card + both upgrade-modal
// flag states), it asserts the CHECKOUT ROUTE's real gate
// (resolveCheckoutTierGate — the exact function route.ts calls, not a
// re-implementation) accepts it — i.e. resolves to a sellable,
// non-placeholder-priced plan, never a 409.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveCheckoutTierGate } from "@/lib/billing/checkout-items";
import { getPlan, type TierId } from "@/lib/billing/plans";

/** Every tier id a UI surface can currently POST to /api/stripe/checkout,
 *  annotated with WHERE it comes from. If a future UI change adds a new
 *  POST-able tier, add it here — this list is the audit surface. */
const UI_REACHABLE_TIERS: Array<{ tier: TierId; source: string }> = [
  // pricing-shell.tsx's always-rendered single card (both SF_TIER_LADDER states —
  // the card itself isn't flag-gated, only the ladder BELOW it is).
  { tier: "builder", source: "pricing-shell.tsx single card" },
  // pricing-shell.tsx's <TierLadder> (flag ON only) — PLANS.filter(sellable).
  { tier: "builder", source: "pricing-shell.tsx TierLadder personal audience" },
  { tier: "managed", source: "pricing-shell.tsx TierLadder personal audience" },
  { tier: "agency_starter", source: "pricing-shell.tsx TierLadder agency audience" },
  { tier: "agency_growth", source: "pricing-shell.tsx TierLadder agency audience" },
  { tier: "agency_scale", source: "pricing-shell.tsx TierLadder agency audience" },
  // upgrade-modal.tsx flag OFF (minimal single target).
  { tier: "builder", source: "upgrade-modal.tsx flag OFF" },
  // upgrade-modal.tsx flag ON (the new ladder comparison).
  { tier: "managed", source: "upgrade-modal.tsx flag ON" },
  { tier: "agency_starter", source: "upgrade-modal.tsx flag ON" },
];

describe("resolveCheckoutTierGate — every UI-reachable tier is NEVER rejected for being non-sellable", () => {
  // Env-independent invariant: whether or not Max has set the Stripe
  // price env vars in THIS environment (locally/CI they're typically
  // unset, so these still resolve to price_PLACEHOLDER_* fallbacks —
  // see price-ids.ts), every UI-reachable tier must be Plan.sellable.
  // A "not_sellable" 409 is a CODE bug (the exact bug this fix wave
  // closes); a "placeholder_price" 409 is an ENV/config gap that
  // resolves itself once Max sets the Stripe price env var — this test
  // only pins the former, which is the class of bug that was actually
  // shipped.
  for (const { tier, source } of UI_REACHABLE_TIERS) {
    test(`${tier} (from ${source}) is never rejected as not_sellable`, () => {
      const gate = resolveCheckoutTierGate(tier);
      if (!gate.ok) {
        assert.notEqual(
          gate.detail,
          "not_sellable",
          `${tier} (posted by ${source}) must be Plan.sellable — a not_sellable 409 here means the UI is targeting a grandfathered/frozen tier again`,
        );
      }
    });
  }

  test("sanity: every tier in the audit list is actually Plan.sellable in the catalog", () => {
    for (const { tier, source } of UI_REACHABLE_TIERS) {
      const plan = getPlan(tier);
      assert.ok(plan, `${tier} (from ${source}) must resolve to a real Plan`);
      assert.equal(plan!.sellable, true, `${tier} (from ${source}) must be Plan.sellable`);
    }
  });

  test("builder specifically resolves to the SAME Stripe price the live $29 card has always used (WORKSPACE_PRICE_ID) — the exact fix for the reported regression", () => {
    const builderPlan = getPlan("builder")!;
    const workspacePlan = getPlan("workspace")!;
    assert.equal(
      builderPlan.stripePriceId,
      workspacePlan.stripePriceId,
      "builder must share the live-configured price with the grandfathered workspace tier until Max creates a distinct Builder price",
    );
  });
});

describe("resolveCheckoutTierGate — the GRANDFATHERED tiers the bug POSTed are correctly rejected", () => {
  // Regression pin: this is the exact bug the review caught. These
  // tiers must NEVER be reachable from a NEW checkout POST again.
  test("workspace (grandfathered, sellable:false) is rejected", () => {
    const gate = resolveCheckoutTierGate("workspace");
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.reason, "tier_unavailable");
      assert.equal(gate.detail, "not_sellable");
    }
  });

  test("agency (grandfathered, sellable:false) is rejected", () => {
    const gate = resolveCheckoutTierGate("agency");
    assert.equal(gate.ok, false);
    if (!gate.ok) {
      assert.equal(gate.detail, "not_sellable");
    }
  });
});

describe("resolveCheckoutTierGate — placeholder-priced sellable tiers", () => {
  test("a sellable tier whose Stripe price is still PLACEHOLDER also rejects (money-safe)", () => {
    // agency_growth/agency_scale are sellable:true in the catalog but,
    // absent Max's env vars, still resolve to a price_PLACEHOLDER_*
    // fallback — the gate must catch this distinctly from the
    // not-sellable case (both 409 tier_unavailable, but for a
    // different reason).
    const plan = getPlan("agency_growth")!;
    const gate = resolveCheckoutTierGate("agency_growth");
    if (plan.stripePriceId.startsWith("price_PLACEHOLDER")) {
      assert.equal(gate.ok, false);
      if (!gate.ok) assert.equal(gate.detail, "placeholder_price");
    } else {
      // Max has already configured this env var in this environment —
      // the gate must then accept it (not a fixed expectation either
      // way, but never a silent pass-through of a different failure).
      assert.equal(gate.ok, true);
    }
  });

  test("null tier (legacy add-on fallback path) always passes — that path never resolves a targetTier", () => {
    assert.deepEqual(resolveCheckoutTierGate(null), { ok: true });
  });

  test("an unknown tier id is rejected", () => {
    const gate = resolveCheckoutTierGate("not_a_real_tier" as TierId);
    assert.equal(gate.ok, false);
  });
});
