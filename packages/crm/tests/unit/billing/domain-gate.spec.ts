// packages/crm/tests/unit/billing/domain-gate.spec.ts
//
// 2026-05-27 — Tier-gate decision for /settings/domain. Pure-function
// unit tests around decideDomainGate. The page composes
// resolveDomainGate (DB-bound) on top of the same decision matrix.
//
// 2026-06-18 pricing migration — "free" replaced by "inactive" (no
// active plan). Any paid tier (builder/workspace/agency) renders the
// form; inactive-with-card falls through to the form; inactive-without-
// card sees the upsell.
//
//   tier      | card on file | outcome
//   ----------|--------------|---------------------------
//   inactive  | no           | render-upsell
//   inactive  | yes          | render-form (free-tier-with-card)
//   builder   | -            | render-form (paid-tier)
//   workspace | -            | render-form (paid-tier)
//   agency    | -            | render-form (paid-tier)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { decideDomainGate } from "@/lib/billing/domain-gate";

describe("decideDomainGate — inactive (no plan)", () => {
  test("inactive + no card → render-upsell", () => {
    const decision = decideDomainGate({ tier: "inactive", hasCardOnFile: false });
    assert.equal(decision.kind, "render-upsell");
    if (decision.kind === "render-upsell") {
      assert.equal(decision.tier, "inactive");
    }
  });

  test("inactive + card on file → render-form (free-tier-with-card)", () => {
    const decision = decideDomainGate({ tier: "inactive", hasCardOnFile: true });
    assert.equal(decision.kind, "render-form");
    if (decision.kind === "render-form") {
      assert.equal(decision.reason, "free-tier-with-card");
      assert.equal(decision.tier, "inactive");
    }
  });
});

describe("decideDomainGate — paid tiers", () => {
  for (const tier of ["builder", "workspace", "agency"] as const) {
    test(`${tier} tier always renders form regardless of card flag`, () => {
      for (const hasCardOnFile of [true, false]) {
        const decision = decideDomainGate({ tier, hasCardOnFile });
        assert.equal(decision.kind, "render-form", `${tier}+card=${hasCardOnFile}`);
        if (decision.kind === "render-form") {
          assert.equal(decision.reason, "paid-tier");
          assert.equal(decision.tier, tier);
        }
      }
    });
  }
});

describe("decideDomainGate — discriminated union shape", () => {
  test("render-upsell only ever has tier=inactive", () => {
    const decision = decideDomainGate({ tier: "inactive", hasCardOnFile: false });
    if (decision.kind === "render-upsell") {
      assert.equal(decision.tier, "inactive");
    } else {
      assert.fail("expected render-upsell for inactive + no card");
    }
  });

  test("render-form carries the resolved tier through", () => {
    const decisions = (
      [
        { tier: "builder", hasCardOnFile: false },
        { tier: "agency", hasCardOnFile: true },
        { tier: "inactive", hasCardOnFile: true },
      ] as const
    ).map(decideDomainGate);

    assert.equal(decisions[0].kind, "render-form");
    if (decisions[0].kind === "render-form") assert.equal(decisions[0].tier, "builder");

    assert.equal(decisions[1].kind, "render-form");
    if (decisions[1].kind === "render-form") assert.equal(decisions[1].tier, "agency");

    assert.equal(decisions[2].kind, "render-form");
    if (decisions[2].kind === "render-form") assert.equal(decisions[2].tier, "inactive");
  });
});
