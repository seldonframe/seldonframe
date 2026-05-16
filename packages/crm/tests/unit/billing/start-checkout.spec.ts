// packages/crm/tests/unit/billing/start-checkout.spec.ts
//
// Cut B Phase 5 Task 28 — TDD coverage for the startCheckout helper that
// UpgradeModal (Cut A) calls. fetchImpl is the test seam so we never touch
// the global fetch.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { startCheckout } from "../../../src/lib/billing/start-checkout";

describe("startCheckout", () => {
  test("POSTs to /api/stripe/checkout with priceId + tier + successPath + cancelPath", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ url: "https://stripe.checkout/session-abc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await startCheckout({
      priceId: "price_growth_29",
      tier: "growth",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "/api/stripe/checkout");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.priceId, "price_growth_29");
    assert.equal(body.tier, "growth");
    assert.equal(body.successPath, "/dashboard?upgraded=growth");
    assert.equal(body.cancelPath, "/clients");
    assert.equal(result.url, "https://stripe.checkout/session-abc");
  });

  test("passes tier through to successPath query string (scale)", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ url: "https://stripe.checkout/session-xyz" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await startCheckout({
      priceId: "price_scale_99",
      tier: "scale",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.tier, "scale");
    assert.equal(body.successPath, "/dashboard?upgraded=scale");
  });

  test("throws with the API's error message when the API responds non-2xx", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });

    await assert.rejects(
      () =>
        startCheckout({
          priceId: "price_growth_29",
          tier: "growth",
          fetchImpl: fakeFetch as unknown as typeof fetch,
        }),
      /Unauthorized/,
    );
  });

  test("throws when the API responds without a url", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ error: "Stripe not configured" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });

    await assert.rejects(
      () =>
        startCheckout({
          priceId: "price_growth_29",
          tier: "growth",
          fetchImpl: fakeFetch as unknown as typeof fetch,
        }),
      /Stripe not configured|checkout failed/,
    );
  });

  test("throws 'missing url' when the response is 200 but lacks url", async () => {
    const fakeFetch = async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    await assert.rejects(
      () =>
        startCheckout({
          priceId: "price_growth_29",
          tier: "growth",
          fetchImpl: fakeFetch as unknown as typeof fetch,
        }),
      /missing url/,
    );
  });
});
