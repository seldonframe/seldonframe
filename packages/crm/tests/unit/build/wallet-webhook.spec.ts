// wallet webhook decision — the PURE map from a verified Stripe event to a wallet
// top-up CREDIT (spec 1ff09dcb, P2 Task 2). Pure: no Stripe import beyond the
// type, no db, no network, never throws. The route verifies the signature + applies
// the credit through the DI'd store; this only decides WHETHER to credit and BY
// HOW MUCH, reading the wallet_topup metadata the top-up Checkout stamped.
//
// MONEY-SAFE: only a `checkout.session.completed` whose metadata.type is
// "wallet_topup" AND that carries a positive amountMicros + an orgId + a session
// id is a credit. Everything else → { credit:false } (the route does nothing).
// The credit is idempotent on the SESSION id (the store dedupes), so a Stripe
// re-delivery credits ONCE.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import { decideWalletTopupCredit } from "../../../src/lib/build/wallet-webhook";

/** Build a minimal checkout.session.completed event with the given session. */
function completedEvent(session: Partial<Stripe.Checkout.Session>): Stripe.Event {
  return {
    type: "checkout.session.completed",
    data: { object: session as Stripe.Checkout.Session },
  } as Stripe.Event;
}

describe("decideWalletTopupCredit — credits", () => {
  test("a wallet_topup completion → credit with orgId + amountMicros + the session id", () => {
    const ev = completedEvent({
      id: "cs_topup_1",
      metadata: { type: "wallet_topup", orgId: "org-1", amountMicros: "20000000", stripeMode: "test" },
    });
    const d = decideWalletTopupCredit(ev);
    assert.equal(d.credit, true);
    if (!d.credit) return;
    assert.equal(d.orgId, "org-1");
    assert.equal(d.amountMicros, 20_000_000);
    assert.equal(d.sessionId, "cs_topup_1");
    assert.equal(d.stripeMode, "test");
  });

  test("reads stripeMode 'live' from the metadata", () => {
    const ev = completedEvent({
      id: "cs_topup_2",
      metadata: { type: "wallet_topup", orgId: "org-1", amountMicros: "5000000", stripeMode: "live" },
    });
    const d = decideWalletTopupCredit(ev);
    assert.equal(d.credit, true);
    if (!d.credit) return;
    assert.equal(d.stripeMode, "live");
  });
});

describe("decideWalletTopupCredit — no-ops (money-safe)", () => {
  test("a NON-wallet checkout (e.g. an agent purchase) → no credit", () => {
    const ev = completedEvent({
      id: "cs_agent_1",
      metadata: { type: "marketplace_agent_purchase", buyerOrgId: "org-1" },
    });
    assert.equal(decideWalletTopupCredit(ev).credit, false);
  });

  test("a different event type → no credit", () => {
    const ev = { type: "invoice.paid", data: { object: {} } } as Stripe.Event;
    assert.equal(decideWalletTopupCredit(ev).credit, false);
  });

  test("missing orgId → no credit (can't target a wallet)", () => {
    const ev = completedEvent({
      id: "cs_topup_3",
      metadata: { type: "wallet_topup", amountMicros: "20000000" },
    });
    assert.equal(decideWalletTopupCredit(ev).credit, false);
  });

  test("non-positive / junk amountMicros → no credit", () => {
    for (const amountMicros of ["0", "-5", "abc", ""]) {
      const ev = completedEvent({
        id: "cs_topup_x",
        metadata: { type: "wallet_topup", orgId: "org-1", amountMicros },
      });
      assert.equal(decideWalletTopupCredit(ev).credit, false);
    }
  });

  test("missing session id → no credit (no dedupe key)", () => {
    const ev = completedEvent({
      id: "",
      metadata: { type: "wallet_topup", orgId: "org-1", amountMicros: "20000000" },
    });
    assert.equal(decideWalletTopupCredit(ev).credit, false);
  });
});
