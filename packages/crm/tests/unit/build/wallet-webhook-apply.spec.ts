// wallet webhook apply — verify + credit, DI'd so the route is unit-testable
// WITHOUT a network or a real Stripe key (spec 1ff09dcb, P2 Task 2). Mirrors
// webhook-apply.ts's shape: the route reads the raw body + the signature, this
// owns the fail-closed verify gate, the pure decision, and the SINGLE credit call.
//
// MONEY-SAFE: FAIL-CLOSED. A bad/missing signature → NOT credited. A non-wallet
// or malformed event → NOT credited. The credit goes through the DI'd wallet
// store, which is idempotent on the session id — a re-delivery credits ONCE.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import {
  applyWalletTopupWebhook,
  type WalletTopupWebhookDeps,
} from "../../../src/lib/build/wallet-webhook-apply";

function completedEvent(metadata: Record<string, string>, id = "cs_topup_1"): Stripe.Event {
  return {
    type: "checkout.session.completed",
    data: { object: { id, metadata } as Stripe.Checkout.Session },
  } as Stripe.Event;
}

type Credited = { orgId: string; amountMicros: number; idempotencyKey: string; stripeMode: string };

function makeDeps(
  over: Partial<WalletTopupWebhookDeps> & { event?: Stripe.Event; verifyThrows?: boolean } = {},
): { deps: WalletTopupWebhookDeps; credited: Credited[] } {
  const credited: Credited[] = [];
  const deps: WalletTopupWebhookDeps = {
    verify: () => {
      if (over.verifyThrows) throw new Error("bad signature");
      return over.event ?? completedEvent({ type: "wallet_topup", orgId: "org-1", amountMicros: "20000000", stripeMode: "test" });
    },
    credit: async (input) => {
      credited.push(input);
      return { ok: true, balanceMicros: input.amountMicros, applied: true, duplicate: false };
    },
    ...over,
  };
  return { deps, credited };
}

const GOOD_INPUT = { rawBody: "{}", signature: "sig", secret: "whsec_1" };

describe("applyWalletTopupWebhook — credits", () => {
  test("a verified wallet_topup → ONE credit keyed by the session id", async () => {
    const { deps, credited } = makeDeps();
    const res = await applyWalletTopupWebhook(GOOD_INPUT, deps);
    assert.equal(res.status, 200);
    assert.equal(res.body.credited, true);
    assert.equal(credited.length, 1);
    assert.equal(credited[0]!.orgId, "org-1");
    assert.equal(credited[0]!.amountMicros, 20_000_000);
    assert.equal(credited[0]!.idempotencyKey, "cs_topup_1");
    assert.equal(credited[0]!.stripeMode, "test");
  });
});

describe("applyWalletTopupWebhook — fail-closed / no-ops", () => {
  test("missing secret → 400, NO credit", async () => {
    const { deps, credited } = makeDeps();
    const res = await applyWalletTopupWebhook({ ...GOOD_INPUT, secret: null }, deps);
    assert.equal(res.status, 400);
    assert.equal(credited.length, 0);
  });

  test("missing signature → 400, NO credit", async () => {
    const { deps, credited } = makeDeps();
    const res = await applyWalletTopupWebhook({ ...GOOD_INPUT, signature: null }, deps);
    assert.equal(res.status, 400);
    assert.equal(credited.length, 0);
  });

  test("bad signature (verify throws) → 400, NO credit", async () => {
    const { deps, credited } = makeDeps({ verifyThrows: true });
    const res = await applyWalletTopupWebhook(GOOD_INPUT, deps);
    assert.equal(res.status, 400);
    assert.equal(credited.length, 0);
  });

  test("a non-wallet event → 200, NO credit (handled elsewhere)", async () => {
    const { deps, credited } = makeDeps({
      event: completedEvent({ type: "marketplace_agent_purchase", buyerOrgId: "org-1" }),
    });
    const res = await applyWalletTopupWebhook(GOOD_INPUT, deps);
    assert.equal(res.status, 200);
    assert.equal(res.body.credited, false);
    assert.equal(credited.length, 0);
  });
});
