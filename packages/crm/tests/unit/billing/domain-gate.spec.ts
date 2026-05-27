// packages/crm/tests/unit/billing/domain-gate.spec.ts
//
// 2026-05-27 — Tier-gate decision for /settings/domain. Pure-function
// unit tests around decideDomainGate. The page composes
// resolveDomainGate (DB-bound) on top of the same decision matrix; the
// DB wrapper isn't covered here because the DB is mocked at the
// drizzle layer in integration tests, not unit ones.
//
// Decision matrix the gate enforces:
//
//   tier  | card on file | outcome
//   ------|--------------|---------------------------
//   free  | no           | render-upsell
//   free  | yes          | render-form (free-tier-with-card)
//   growth| -            | render-form (paid-tier)
//   scale | -            | render-form (paid-tier)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { decideDomainGate } from "@/lib/billing/domain-gate";

describe("decideDomainGate — free tier", () => {
  test("free + no card → render-upsell", () => {
    const decision = decideDomainGate({ tier: "free", hasCardOnFile: false });
    assert.equal(decision.kind, "render-upsell");
    if (decision.kind === "render-upsell") {
      assert.equal(decision.tier, "free");
    }
  });

  test("free + card on file → render-form (free-tier-with-card)", () => {
    // Free-tier operators who already cleared the card hurdle once
    // fall through to the form. The actual entitlement check fires
    // server-side at action time in lib/domains/actions.ts via
    // getOrgFeatures(tier).customDomains; they can't accidentally
    // bypass payment by submitting.
    const decision = decideDomainGate({ tier: "free", hasCardOnFile: true });
    assert.equal(decision.kind, "render-form");
    if (decision.kind === "render-form") {
      assert.equal(decision.reason, "free-tier-with-card");
      assert.equal(decision.tier, "free");
    }
  });
});

describe("decideDomainGate — paid tiers", () => {
  test("growth tier always renders form regardless of card flag", () => {
    // Card-on-file is irrelevant for paid tiers — the upgrade already
    // happened. Both flag values render the form.
    for (const hasCardOnFile of [true, false]) {
      const decision = decideDomainGate({ tier: "growth", hasCardOnFile });
      assert.equal(decision.kind, "render-form", `growth+card=${hasCardOnFile}`);
      if (decision.kind === "render-form") {
        assert.equal(decision.reason, "paid-tier");
        assert.equal(decision.tier, "growth");
      }
    }
  });

  test("scale tier always renders form regardless of card flag", () => {
    for (const hasCardOnFile of [true, false]) {
      const decision = decideDomainGate({ tier: "scale", hasCardOnFile });
      assert.equal(decision.kind, "render-form", `scale+card=${hasCardOnFile}`);
      if (decision.kind === "render-form") {
        assert.equal(decision.reason, "paid-tier");
        assert.equal(decision.tier, "scale");
      }
    }
  });
});

describe("decideDomainGate — discriminated union shape", () => {
  test("render-upsell only ever has tier=free", () => {
    // TypeScript-level invariant: a paid tier should never produce
    // render-upsell. Verified at the call-site shape (the type
    // signature forbids it), confirmed at runtime here so a future
    // edit can't widen the union without breaking the test.
    const decision = decideDomainGate({ tier: "free", hasCardOnFile: false });
    if (decision.kind === "render-upsell") {
      assert.equal(decision.tier, "free");
    } else {
      assert.fail("expected render-upsell for free + no card");
    }
  });

  test("render-form carries the resolved tier through", () => {
    const decisions = (
      [
        { tier: "growth", hasCardOnFile: false },
        { tier: "scale", hasCardOnFile: true },
        { tier: "free", hasCardOnFile: true },
      ] as const
    ).map(decideDomainGate);

    assert.equal(decisions[0].kind, "render-form");
    if (decisions[0].kind === "render-form") assert.equal(decisions[0].tier, "growth");

    assert.equal(decisions[1].kind, "render-form");
    if (decisions[1].kind === "render-form") assert.equal(decisions[1].tier, "scale");

    assert.equal(decisions[2].kind, "render-form");
    if (decisions[2].kind === "render-form") assert.equal(decisions[2].tier, "free");
  });
});
