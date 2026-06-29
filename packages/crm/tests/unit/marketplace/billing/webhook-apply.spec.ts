// Unit tests for lib/marketplace/billing/webhook-apply.ts — the #139 P4
// verify+apply gate that the route delegates to. We fake BOTH seams (verify +
// store) so there is no network and no real Stripe key. The load-bearing proofs:
//   • a BAD signature → 400 AND the store is NEVER touched (fail-closed).
//   • a missing signature / missing secret → 400, no act (inert/fail-closed).
//   • a VALID event → 200 AND exactly ONE store update on the right key.
//   • an unknown event → 200, store NOT touched (no-op).
//   • idempotent re-delivery → the same single patch each time (no double-effect).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import type { MarketplacePurchaseRow } from "../../../../src/db/schema/marketplace-purchases";
import {
  handleMarketplaceWebhookRequest,
  type MarketplaceWebhookStore,
  type MarketplaceWebhookVerify,
} from "../../../../src/lib/marketplace/billing/webhook-apply";
import type { MarketplacePurchasePatch } from "../../../../src/lib/marketplace/billing/webhook-handler";

// ─── fakes ───────────────────────────────────────────────────────────────────

type StoreCall = { kind: "checkout" | "subscription" | "customer"; key: string; patch: MarketplacePurchasePatch };

function makeFakeStore(opts?: { matched?: boolean }): {
  store: MarketplaceWebhookStore;
  calls: StoreCall[];
} {
  const calls: StoreCall[] = [];
  const row = (opts?.matched ?? true)
    ? ({ id: "purchase-1" } as MarketplacePurchaseRow)
    : null;
  const store: MarketplaceWebhookStore = {
    async updateByCheckoutId(key, patch) {
      calls.push({ kind: "checkout", key, patch });
      return row;
    },
    async updateBySubscriptionId(key, patch) {
      calls.push({ kind: "subscription", key, patch });
      return row;
    },
    async updateByCustomerId(key, patch) {
      calls.push({ kind: "customer", key, patch });
      return row;
    },
  };
  return { store, calls };
}

/** A store where the SUBSCRIPTION-id lookup misses (no row carries the sub id yet
 *  — models an invoice racing ahead of checkout.session.completed) but the
 *  CUSTOMER-id lookup hits. Records every call. */
function makeRaceStore(): { store: MarketplaceWebhookStore; calls: StoreCall[] } {
  const calls: StoreCall[] = [];
  const matchedRow = { id: "purchase-race" } as MarketplacePurchaseRow;
  const store: MarketplaceWebhookStore = {
    async updateByCheckoutId(key, patch) {
      calls.push({ kind: "checkout", key, patch });
      return matchedRow;
    },
    async updateBySubscriptionId(key, patch) {
      calls.push({ kind: "subscription", key, patch });
      return null; // ← the race: no row carries the subscription id yet.
    },
    async updateByCustomerId(key, patch) {
      calls.push({ kind: "customer", key, patch });
      return matchedRow; // ← reconciled by customer id instead.
    },
  };
  return { store, calls };
}

/** A verify that ALWAYS succeeds, returning a fixed event. */
function verifyOk(event: Stripe.Event): MarketplaceWebhookVerify {
  return () => event;
}

/** A verify that ALWAYS throws — models a bad/forged signature. */
const verifyThrows: MarketplaceWebhookVerify = () => {
  throw new Error("No signatures found matching the expected signature for payload.");
};

function ev(type: string, object: unknown, id = "evt_1"): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

const GOOD_INPUT = { rawBody: "{}", signature: "t=1,v1=deadbeef", secret: "whsec_test" };

// ─── fail-closed: bad signature ──────────────────────────────────────────────

describe("handleMarketplaceWebhookRequest — fail-closed on signature", () => {
  test("BAD signature → 400 AND the store is NEVER touched", async () => {
    const { store, calls } = makeFakeStore();
    const res = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify: verifyThrows, store });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "invalid_signature");
    assert.equal(calls.length, 0); // ← money-safety: no act on a bad signature
  });

  test("missing signature header → 400, store untouched (verify not even called)", async () => {
    const { store, calls } = makeFakeStore();
    let verifyCalled = false;
    const verify: MarketplaceWebhookVerify = () => {
      verifyCalled = true;
      return ev("checkout.session.completed", { id: "cs_1" });
    };
    const res = await handleMarketplaceWebhookRequest({ ...GOOD_INPUT, signature: null }, { verify, store });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "missing_signature");
    assert.equal(verifyCalled, false);
    assert.equal(calls.length, 0);
  });

  test("missing secret (inert / unconfigured) → 400, no act", async () => {
    const { store, calls } = makeFakeStore();
    const res = await handleMarketplaceWebhookRequest(
      { ...GOOD_INPUT, secret: null },
      { verify: verifyOk(ev("checkout.session.completed", { id: "cs_1" })), store },
    );
    assert.equal(res.status, 400);
    assert.equal(res.body.error, "webhook_not_configured");
    assert.equal(calls.length, 0);
  });
});

// ─── verified event → exactly one store write on the right key ───────────────

describe("handleMarketplaceWebhookRequest — verified event applies once", () => {
  test("checkout.session.completed → 200 + ONE updateByCheckoutId(cs id, {active})", async () => {
    const { store, calls } = makeFakeStore();
    const event = ev("checkout.session.completed", { id: "cs_abc", subscription: "sub_abc", customer: "cus_abc" });
    const res = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify: verifyOk(event), store });
    assert.equal(res.status, 200);
    assert.equal(res.body.handled, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "checkout");
    assert.equal(calls[0].key, "cs_abc");
    assert.equal(calls[0].patch.status, "active");
    assert.equal(calls[0].patch.stripeSubscriptionId, "sub_abc");
    assert.equal(calls[0].patch.stripeCustomerId, "cus_abc");
  });

  test("invoice.payment_failed → 200 + ONE updateBySubscriptionId(sub id, {past_due})", async () => {
    const { store, calls } = makeFakeStore();
    const event = ev("invoice.payment_failed", { subscription: "sub_pf" });
    const res = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify: verifyOk(event), store });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "subscription");
    assert.equal(calls[0].key, "sub_pf");
    assert.equal(calls[0].patch.status, "past_due");
  });

  test("customer.subscription.deleted → 200 + ONE updateBySubscriptionId(sub id, {canceled})", async () => {
    const { store, calls } = makeFakeStore();
    const event = ev("customer.subscription.deleted", { id: "sub_del" });
    const res = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify: verifyOk(event), store });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, "subscription");
    assert.equal(calls[0].key, "sub_del");
    assert.equal(calls[0].patch.status, "canceled");
  });

  test("unknown purchase (no row, no customer) → still 200, matched:false, ONE attempt", async () => {
    const { store, calls } = makeFakeStore({ matched: false });
    const event = ev("invoice.paid", { subscription: "sub_unknown" });
    const res = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify: verifyOk(event), store });
    assert.equal(res.status, 200);
    assert.equal(res.body.matched, false);
    assert.equal(calls.length, 1); // no customer on the invoice → no fallback attempt
  });
});

// ─── P3 ordering race: subscription-id misses → customer-id fallback hits ─────

describe("handleMarketplaceWebhookRequest — ordering-race fallback", () => {
  test("invoice.paid that races ahead of the sub-id stamp reconciles by CUSTOMER id", async () => {
    const { store, calls } = makeRaceStore();
    // An invoice carrying BOTH a subscription id (no row has it yet) and a customer id.
    const event = ev("invoice.paid", { subscription: "sub_race", customer: "cus_race" });
    const res = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify: verifyOk(event), store });

    assert.equal(res.status, 200);
    // Tried the subscription key first (missed), then the customer key (hit).
    assert.equal(calls.length, 2);
    assert.equal(calls[0].kind, "subscription");
    assert.equal(calls[0].key, "sub_race");
    assert.equal(calls[1].kind, "customer");
    assert.equal(calls[1].key, "cus_race");
    // The customer-fallback write BACK-FILLS the subscription id so later invoices
    // match by subscription directly.
    assert.equal(calls[1].patch.stripeSubscriptionId, "sub_race");
    assert.equal(calls[1].patch.status, "active");
    // Activation succeeded (matched) + the body reports it matched by customer.
    assert.equal(res.body.matched, true);
    assert.equal(res.body.matchedBy, "customer");
  });

  test("when the subscription key already matches, the customer fallback is NOT tried", async () => {
    const { store, calls } = makeFakeStore(); // sub-id lookup hits
    const event = ev("invoice.paid", { subscription: "sub_ok", customer: "cus_ok" });
    const res = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify: verifyOk(event), store });
    assert.equal(res.status, 200);
    assert.equal(calls.length, 1); // ← no fallback attempt; primary matched
    assert.equal(calls[0].kind, "subscription");
    assert.equal(res.body.matchedBy, "subscription");
  });
});

// ─── unknown event → 200, no store write ─────────────────────────────────────

describe("handleMarketplaceWebhookRequest — unknown event no-op", () => {
  test("customer.subscription.updated → 200 handled:false, store NOT touched", async () => {
    const { store, calls } = makeFakeStore();
    const event = ev("customer.subscription.updated", { id: "sub_1" });
    const res = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify: verifyOk(event), store });
    assert.equal(res.status, 200);
    assert.equal(res.body.handled, false);
    assert.equal(calls.length, 0);
  });
});

// ─── idempotency: re-delivery applies the same single patch ──────────────────

describe("handleMarketplaceWebhookRequest — idempotent re-delivery", () => {
  test("the same verified event applied twice → one write each, identical patch (no double-effect)", async () => {
    const { store, calls } = makeFakeStore();
    const event = ev("invoice.paid", { subscription: "sub_dup", customer: "cus_dup" }, "evt_same");
    const verify = verifyOk(event);

    const r1 = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify, store });
    const r2 = await handleMarketplaceWebhookRequest(GOOD_INPUT, { verify, store });

    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(calls.length, 2);
    // Each delivery produces the SAME patch on the SAME key — the DB write is a
    // status re-stamp (no-op), never a duplicate charge.
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[0].patch.status, "active");
  });
});
