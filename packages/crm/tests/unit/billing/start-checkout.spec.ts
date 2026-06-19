// packages/crm/tests/unit/billing/start-checkout.spec.ts
//
// TDD coverage for the startCheckout helper that UpgradeModal calls.
// fetchImpl is the test seam so we never touch the global fetch.
//
// 2026-06-18 pricing migration (Phase 3) — the helper now speaks the new
// tier ladder (builder | workspace | agency). Legacy "growth"/"scale"
// are gone from the client surface; the checkout route still remaps them
// server-side for replayed/old links, but the modal sends new tiers.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { startCheckout } from "../../../src/lib/billing/start-checkout";
import {
  WORKSPACE_PRICE_ID,
  AGENCY_BASE_PRICE_ID,
} from "../../../src/lib/billing/price-ids";

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
      priceId: WORKSPACE_PRICE_ID,
      tier: "workspace",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, "/api/stripe/checkout");
    assert.equal(calls[0]!.init.method, "POST");
    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.priceId, WORKSPACE_PRICE_ID);
    assert.equal(body.tier, "workspace");
    assert.equal(body.successPath, "/dashboard?upgraded=workspace");
    assert.equal(body.cancelPath, "/clients");
    assert.equal(result.url, "https://stripe.checkout/session-abc");
  });

  test("passes tier through to successPath query string (agency)", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ url: "https://stripe.checkout/session-xyz" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await startCheckout({
      priceId: AGENCY_BASE_PRICE_ID,
      tier: "agency",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.tier, "agency");
    assert.equal(body.successPath, "/dashboard?upgraded=agency");
  });

  test("supports the builder tier", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ url: "https://stripe.checkout/session-b" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    await startCheckout({
      priceId: "price_builder_19",
      tier: "builder",
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    const body = JSON.parse(String(calls[0]!.init.body));
    assert.equal(body.tier, "builder");
    assert.equal(body.successPath, "/dashboard?upgraded=builder");
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
          priceId: WORKSPACE_PRICE_ID,
          tier: "workspace",
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
          priceId: WORKSPACE_PRICE_ID,
          tier: "workspace",
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
          priceId: WORKSPACE_PRICE_ID,
          tier: "workspace",
          fetchImpl: fakeFetch as unknown as typeof fetch,
        }),
      /missing url/,
    );
  });
});
