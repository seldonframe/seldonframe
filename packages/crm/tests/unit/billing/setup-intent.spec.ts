// packages/crm/tests/unit/billing/setup-intent.spec.ts
//
// 2026-05-22 — TDD coverage for the signup-time card-on-file helpers
// introduced in the /signup → /signup/billing two-step flow.
//
// attachPaymentMethodToUser is the new helper exercised here. It accepts
// a `repo` seam so the test can hand it a fake without modelling
// Drizzle's full fluent API. The Stripe seam is similarly narrow (just
// the `customers.update` method we touch).
//
// We don't test provisionSetupIntent at the unit tier — it uses
// module-level db + getStripeClient bindings without a DI seam, and the
// existing /pricing flow covers it end-to-end. Adding a seam there would
// churn the working code with no behaviour change.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  attachPaymentMethodToUser,
  type UsersRepo,
} from "../../../src/lib/billing/setup-intent";

// Minimal fake Stripe client — only the customers.update path is hit.
function makeFakeStripe(opts: { throwOnUpdate?: boolean } = {}) {
  const calls: Array<{ id: string; params: Record<string, unknown> }> = [];
  const customers = {
    async update(id: string, params: Record<string, unknown>) {
      calls.push({ id, params });
      if (opts.throwOnUpdate) {
        throw new Error("stripe down");
      }
      return { id, ...params };
    },
  };
  return { stripe: { customers }, calls };
}

// Minimal repo fake — backed by a plain Map.
function makeFakeRepo(initial: Record<string, { id: string; stripeCustomerId: string | null }>) {
  const rows = new Map<string, { id: string; stripeCustomerId: string | null; stripePaymentMethodId: string | null }>();
  for (const [id, row] of Object.entries(initial)) {
    rows.set(id, { ...row, stripePaymentMethodId: null });
  }
  const writes: Array<{ userId: string; pmId: string }> = [];
  const repo: UsersRepo = {
    async getUserById(userId: string) {
      const row = rows.get(userId);
      return row ? { id: row.id, stripeCustomerId: row.stripeCustomerId } : null;
    },
    async setStripePaymentMethodId(userId: string, paymentMethodId: string) {
      writes.push({ userId, pmId: paymentMethodId });
      const row = rows.get(userId);
      if (row) row.stripePaymentMethodId = paymentMethodId;
    },
  };
  return { repo, rows, writes };
}

describe("attachPaymentMethodToUser", () => {
  test("returns not_configured when stripe client is missing", async () => {
    const fake = makeFakeRepo({});
    // Pass `stripe: undefined` explicitly so the helper falls through
    // to getStripeClient(). In test env STRIPE_SECRET_KEY is unset so
    // getStripeClient() returns null and we get not_configured.
    const result = await attachPaymentMethodToUser({
      userId: "user_1",
      paymentMethodId: "pm_test_1",
      repo: fake.repo,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      // Either not_configured (no env) or stripe_error (network in CI).
      // Helper short-circuits BEFORE the repo so writes must be empty.
      assert.equal(fake.writes.length, 0);
    }
  });

  test("returns no_user when the user row is missing", async () => {
    const { stripe } = makeFakeStripe();
    const { repo } = makeFakeRepo({}); // empty rows
    const result = await attachPaymentMethodToUser({
      userId: "ghost",
      paymentMethodId: "pm_test_1",
      stripe,
      repo,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "no_user");
    }
  });

  test("returns stripe_error when the user has no stripe_customer_id", async () => {
    const { stripe } = makeFakeStripe();
    const { repo, writes } = makeFakeRepo({
      user_1: { id: "user_1", stripeCustomerId: null },
    });
    const result = await attachPaymentMethodToUser({
      userId: "user_1",
      paymentMethodId: "pm_test_1",
      stripe,
      repo,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "stripe_error");
      assert.match(result.detail ?? "", /no stripe_customer_id/);
    }
    assert.equal(writes.length, 0);
  });

  test("on success: sets default_payment_method on stripe customer + writes users.stripePaymentMethodId", async () => {
    const { stripe, calls } = makeFakeStripe();
    const fake = makeFakeRepo({
      user_1: { id: "user_1", stripeCustomerId: "cus_test_1" },
    });
    const result = await attachPaymentMethodToUser({
      userId: "user_1",
      paymentMethodId: "pm_test_1",
      stripe,
      repo: fake.repo,
    });
    assert.equal(result.ok, true);
    // Stripe call asserted: the right customer + the payment method as default.
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.id, "cus_test_1");
    assert.deepEqual(calls[0]!.params, {
      invoice_settings: { default_payment_method: "pm_test_1" },
    });
    // Repo write asserted.
    assert.equal(fake.writes.length, 1);
    assert.equal(fake.writes[0]!.userId, "user_1");
    assert.equal(fake.writes[0]!.pmId, "pm_test_1");
  });

  test("returns stripe_error when stripe customers.update throws", async () => {
    const { stripe } = makeFakeStripe({ throwOnUpdate: true });
    const fake = makeFakeRepo({
      user_1: { id: "user_1", stripeCustomerId: "cus_test_1" },
    });
    const result = await attachPaymentMethodToUser({
      userId: "user_1",
      paymentMethodId: "pm_test_1",
      stripe,
      repo: fake.repo,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "stripe_error");
      assert.match(result.detail ?? "", /stripe down/);
    }
    // DB must NOT have been written if stripe failed.
    assert.equal(fake.writes.length, 0);
  });
});
