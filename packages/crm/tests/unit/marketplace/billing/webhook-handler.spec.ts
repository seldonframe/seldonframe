// Unit tests for lib/marketplace/billing/webhook-handler.ts — the #139 P4 PURE
// decision. No Stripe client, no db, no network: we hand the pure function a
// minimal fake Stripe.Event and assert the (lookupBy, lookupKey, status, patch)
// it returns. This is the airtight proof of the event→status table, the right
// reconciliation key per event, the no-op for unknown/keyless events, and that a
// re-delivery produces the SAME decision (idempotent by construction).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type Stripe from "stripe";
import {
  handleMarketplaceStripeEvent,
  type MarketplaceWebhookDecision,
} from "../../../../src/lib/marketplace/billing/webhook-handler";

// ─── tiny event builders (only the fields the handler reads) ─────────────────

function ev(type: string, object: unknown, id = "evt_1"): Stripe.Event {
  return { id, type, data: { object } } as unknown as Stripe.Event;
}

function checkoutCompleted(opts?: {
  sessionId?: string;
  subscription?: string | null;
  customer?: string | null;
}): Stripe.Event {
  return ev("checkout.session.completed", {
    id: opts?.sessionId ?? "cs_test_123",
    subscription: opts?.subscription ?? null,
    customer: opts?.customer ?? null,
  });
}

function invoice(type: string, opts?: { subscription?: string | null; customer?: string | null }): Stripe.Event {
  return ev(type, {
    subscription: opts?.subscription ?? "sub_123",
    customer: opts?.customer ?? null,
  });
}

function subscriptionDeleted(opts?: { id?: string }): Stripe.Event {
  return ev("customer.subscription.deleted", { id: opts?.id ?? "sub_123" });
}

function expectHandled(d: MarketplaceWebhookDecision): Extract<MarketplaceWebhookDecision, { handled: true }> {
  if (!d.handled) throw new Error(`expected handled:true, got handled:false (${d.reason})`);
  return d;
}

// ─── checkout.session.completed → active by CHECKOUT id ──────────────────────

describe("handleMarketplaceStripeEvent — checkout.session.completed", () => {
  test("looks up by CHECKOUT id and sets status:active", () => {
    const d = expectHandled(handleMarketplaceStripeEvent(checkoutCompleted({ sessionId: "cs_abc" })));
    assert.equal(d.lookupBy, "checkout");
    assert.equal(d.lookupKey, "cs_abc");
    assert.equal(d.status, "active");
    assert.equal(d.patch.status, "active");
  });

  test("stamps the SUBSCRIPTION id from session.subscription (string)", () => {
    const d = expectHandled(
      handleMarketplaceStripeEvent(checkoutCompleted({ subscription: "sub_from_session" })),
    );
    assert.equal(d.patch.stripeSubscriptionId, "sub_from_session");
  });

  test("stamps the SUBSCRIPTION id from an expanded session.subscription object", () => {
    const e = ev("checkout.session.completed", {
      id: "cs_obj",
      subscription: { id: "sub_obj" },
      customer: { id: "cus_obj" },
    });
    const d = expectHandled(handleMarketplaceStripeEvent(e));
    assert.equal(d.patch.stripeSubscriptionId, "sub_obj");
    assert.equal(d.patch.stripeCustomerId, "cus_obj");
  });

  test("one-time (mode=payment, no subscription) → active, no subscription stamp", () => {
    const d = expectHandled(handleMarketplaceStripeEvent(checkoutCompleted({ subscription: null, customer: "cus_1" })));
    assert.equal(d.status, "active");
    assert.equal(d.patch.stripeSubscriptionId, undefined);
    assert.equal(d.patch.stripeCustomerId, "cus_1");
  });

  test("no session id → no-op (handled:false)", () => {
    const e = ev("checkout.session.completed", { id: "", subscription: "sub_x" });
    const d = handleMarketplaceStripeEvent(e);
    assert.equal(d.handled, false);
  });
});

// ─── invoice.paid / payment_succeeded → active by SUBSCRIPTION id ────────────

describe("handleMarketplaceStripeEvent — invoice paid", () => {
  for (const type of ["invoice.paid", "invoice.payment_succeeded"]) {
    test(`${type} looks up by SUBSCRIPTION id and sets status:active`, () => {
      const d = expectHandled(handleMarketplaceStripeEvent(invoice(type, { subscription: "sub_paid" })));
      assert.equal(d.lookupBy, "subscription");
      assert.equal(d.lookupKey, "sub_paid");
      assert.equal(d.status, "active");
    });
  }

  test("reads the subscription id from the newer parent.subscription_details shape", () => {
    const e = ev("invoice.paid", {
      subscription: null,
      parent: { subscription_details: { subscription: "sub_nested" } },
    });
    const d = expectHandled(handleMarketplaceStripeEvent(e));
    assert.equal(d.lookupKey, "sub_nested");
  });

  test("invoice with no subscription id → no-op (one-off invoice, not a sub)", () => {
    const e = ev("invoice.paid", { subscription: null, customer: "cus_1" });
    const d = handleMarketplaceStripeEvent(e);
    assert.equal(d.handled, false);
  });
});

// ─── invoice.payment_failed → past_due ───────────────────────────────────────

describe("handleMarketplaceStripeEvent — invoice.payment_failed", () => {
  test("looks up by SUBSCRIPTION id and sets status:past_due", () => {
    const d = expectHandled(handleMarketplaceStripeEvent(invoice("invoice.payment_failed", { subscription: "sub_pf" })));
    assert.equal(d.lookupBy, "subscription");
    assert.equal(d.lookupKey, "sub_pf");
    assert.equal(d.status, "past_due");
    assert.equal(d.patch.status, "past_due");
  });
});

// ─── customer.subscription.deleted → canceled ────────────────────────────────

describe("handleMarketplaceStripeEvent — customer.subscription.deleted", () => {
  test("looks up by SUBSCRIPTION id and sets status:canceled", () => {
    const d = expectHandled(handleMarketplaceStripeEvent(subscriptionDeleted({ id: "sub_del" })));
    assert.equal(d.lookupBy, "subscription");
    assert.equal(d.lookupKey, "sub_del");
    assert.equal(d.status, "canceled");
    assert.equal(d.patch.status, "canceled");
  });
});

// ─── unknown events → no-op ──────────────────────────────────────────────────

describe("handleMarketplaceStripeEvent — unknown / irrelevant events → no-op", () => {
  for (const type of [
    "customer.subscription.updated",
    "customer.subscription.created",
    "payment_intent.succeeded",
    "charge.refunded",
    "account.updated",
  ]) {
    test(`${type} → handled:false (never throws)`, () => {
      const d = handleMarketplaceStripeEvent(ev(type, { id: "x", subscription: "sub_1" }));
      assert.equal(d.handled, false);
    });
  }
});

// ─── idempotency: re-delivery yields the SAME decision ───────────────────────

describe("handleMarketplaceStripeEvent — idempotent by construction", () => {
  test("the SAME event delivered twice produces the SAME decision (no extra effect)", () => {
    const e = checkoutCompleted({ sessionId: "cs_dup", subscription: "sub_dup", customer: "cus_dup" });
    const first = expectHandled(handleMarketplaceStripeEvent(e));
    const second = expectHandled(handleMarketplaceStripeEvent(e));
    assert.deepEqual(first.patch, second.patch);
    assert.equal(first.lookupBy, second.lookupBy);
    assert.equal(first.lookupKey, second.lookupKey);
    assert.equal(first.status, second.status);
  });

  test("a row already in the target state → same patch (the store re-write is a no-op)", () => {
    // The decision is independent of current row state; applying status:active
    // over an already-active row writes the same value — no double-effect.
    const d = expectHandled(handleMarketplaceStripeEvent(invoice("invoice.paid", { subscription: "sub_same" })));
    assert.equal(d.status, "active");
    assert.equal(d.patch.status, "active");
  });
});
