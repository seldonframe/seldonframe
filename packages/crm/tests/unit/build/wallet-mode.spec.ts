// resolveWalletStripeMode — the metered-billing call sites' (voice webhook,
// SF-managed rent, the rent cron, Tier-0 readiness) shared "which wallet"
// resolver (spec 2026-07-01-voice-deploy-metered-billing, Task 10, Controller
// -assigned B). PURE, env-only, no I/O.
//
// Deliberately a thin re-export of resolveBillingMode
// (lib/marketplace/billing/billing-mode.ts) rather than a reimplementation:
// that function is ALREADY the exact key-derived resolver every existing
// credit/debit/read path uses (wallet-topup.ts credits through it;
// run-drawdown-deps.ts and the wallet/balance route debit/read through it).
// Re-exporting it under a wallet-billing-local name is "the same source the
// credit path uses" by construction — there is no second implementation to
// drift out of sync. This spec exists so the invariant (live key ⇒ "live",
// test key ⇒ "test", no key ⇒ "test"/inert) is pinned at the wallet-store
// import surface telephony call sites actually use, independent of the
// marketplace/billing module's own (already-passing) spec.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { resolveWalletStripeMode } from "../../../src/lib/build/wallet-store";

describe("resolveWalletStripeMode (pure, key-derived)", () => {
  test("a live Stripe key (sk_live_) ⇒ 'live'", () => {
    assert.equal(resolveWalletStripeMode({ STRIPE_SECRET_KEY: "sk_live_abc123" }), "live");
  });

  test("a restricted live key (rk_live_) ⇒ 'live'", () => {
    assert.equal(resolveWalletStripeMode({ STRIPE_SECRET_KEY: "rk_live_x" }), "live");
  });

  test("a test key (sk_test_) ⇒ 'test'", () => {
    assert.equal(resolveWalletStripeMode({ STRIPE_SECRET_KEY: "sk_test_abc123" }), "test");
  });

  test("no key configured ⇒ 'test' (dev stays inert)", () => {
    assert.equal(resolveWalletStripeMode({}), "test");
  });

  test("empty key ⇒ 'test'", () => {
    assert.equal(resolveWalletStripeMode({ STRIPE_SECRET_KEY: "" }), "test");
  });
});
