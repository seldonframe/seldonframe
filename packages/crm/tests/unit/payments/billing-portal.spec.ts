// packages/crm/tests/unit/payments/billing-portal.spec.ts
//
// Autopay console Task 3 — "Update card" via a Stripe billing-portal session
// on the CONNECTED account. Repurposes the marketplace pattern
// (lib/marketplace/billing/billing-portal.ts::resolveMarketplacePortalSession)
// verbatim in shape: inert without a customer id, inert without a connect
// account id, inert without a Stripe key. No money moves.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveRetainerBillingPortalSession,
  type RetainerBillingPortalDeps,
} from "@/lib/payments/billing-portal";

describe("resolveRetainerBillingPortalSession", () => {
  test("no customer id yet → skipped, no Stripe call", async () => {
    let stripeCalled = false;
    const deps: RetainerBillingPortalDeps = {
      getStripe: () => ({
        billingPortal: {
          sessions: {
            create: async () => {
              stripeCalled = true;
              return { url: "https://billing.stripe.com/p/1" };
            },
          },
        },
      }),
      returnUrl: "https://app.seldonframe.com/customer/acme/billing",
    };
    const result = await resolveRetainerBillingPortalSession(
      { stripeCustomerId: null, connectAccountId: "acct_1" },
      deps,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_customer");
    assert.equal(stripeCalled, false);
  });

  test("no connect account id → skipped, no Stripe call", async () => {
    let stripeCalled = false;
    const deps: RetainerBillingPortalDeps = {
      getStripe: () => ({
        billingPortal: {
          sessions: {
            create: async () => {
              stripeCalled = true;
              return { url: "https://billing.stripe.com/p/1" };
            },
          },
        },
      }),
      returnUrl: "https://app.seldonframe.com/customer/acme/billing",
    };
    const result = await resolveRetainerBillingPortalSession(
      { stripeCustomerId: "cus_1", connectAccountId: null },
      deps,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_connect_account");
    assert.equal(stripeCalled, false);
  });

  test("no Stripe key configured → skipped, inert", async () => {
    const deps: RetainerBillingPortalDeps = {
      getStripe: () => null,
      returnUrl: "https://app.seldonframe.com/customer/acme/billing",
    };
    const result = await resolveRetainerBillingPortalSession(
      { stripeCustomerId: "cus_1", connectAccountId: "acct_1" },
      deps,
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "stripe_unconfigured");
  });

  test("customer + connect account + Stripe key → creates the session ON the connected account", async () => {
    let capturedOptions: unknown;
    const deps: RetainerBillingPortalDeps = {
      getStripe: () => ({
        billingPortal: {
          sessions: {
            create: async (params, options) => {
              capturedOptions = options;
              assert.equal(params.customer, "cus_1");
              return { url: "https://billing.stripe.com/p/1" };
            },
          },
        },
      }),
      returnUrl: "https://app.seldonframe.com/customer/acme/billing",
    };
    const result = await resolveRetainerBillingPortalSession(
      { stripeCustomerId: "cus_1", connectAccountId: "acct_1" },
      deps,
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.url, "https://billing.stripe.com/p/1");
    assert.deepEqual(capturedOptions, { stripeAccount: "acct_1" });
  });
});
