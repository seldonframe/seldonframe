// packages/crm/tests/unit/payments/retainer-status.spec.ts
//
// Autopay console Task 2 — deriveRetainerStatus. Pure: renders the client
// card's retainer status WITHOUT calling Stripe (plan: "derive from
// proposals' stripeSubscriptionId + latest paymentRecords; do NOT call
// Stripe to render status").

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { deriveRetainerStatus } from "@/lib/payments/retainer";

describe("deriveRetainerStatus", () => {
  test("no subscription row at all → 'none'", () => {
    const status = deriveRetainerStatus({ subscription: null });
    assert.equal(status, "none");
  });

  test("subscription status 'active' → 'active'", () => {
    const status = deriveRetainerStatus({ subscription: { status: "active" } });
    assert.equal(status, "active");
  });

  test("subscription status 'past_due' → 'past_due'", () => {
    const status = deriveRetainerStatus({ subscription: { status: "past_due" } });
    assert.equal(status, "past_due");
  });

  test("subscription status 'canceled' → 'canceled'", () => {
    const status = deriveRetainerStatus({ subscription: { status: "canceled" } });
    assert.equal(status, "canceled");
  });

  test("subscription status 'unpaid' (Stripe's own terminology) → mapped to 'past_due'", () => {
    const status = deriveRetainerStatus({ subscription: { status: "unpaid" } });
    assert.equal(status, "past_due");
  });

  test("subscription status 'incomplete_expired' → mapped to 'canceled'", () => {
    const status = deriveRetainerStatus({ subscription: { status: "incomplete_expired" } });
    assert.equal(status, "canceled");
  });

  test("subscription status 'trialing' → 'active' (still billing on schedule)", () => {
    const status = deriveRetainerStatus({ subscription: { status: "trialing" } });
    assert.equal(status, "active");
  });

  test("unknown/unexpected status string → falls back to 'active' (never throws, never hides a real subscription)", () => {
    const status = deriveRetainerStatus({ subscription: { status: "some_future_stripe_status" } });
    assert.equal(status, "active");
  });
});
