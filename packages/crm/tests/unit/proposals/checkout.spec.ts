// packages/crm/tests/unit/proposals/checkout.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { buildCheckoutSessionParams } from "@/lib/proposals/checkout";

describe("buildCheckoutSessionParams", () => {
  const input = {
    proposalId: "prop_123",
    previewWorkspaceId: "ws_456",
    prospectEmail: "owner@example.com",
    prospectName: "Roofs by Shiloh",
    monthlyPriceCents: 49700,
    signedToken: "tok_xyzaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    baseUrl: "https://app.seldonframe.com",
  };

  test("creates a monthly subscription line item", () => {
    const params = buildCheckoutSessionParams(input);
    assert.equal(params.mode, "subscription");
    assert.equal(params.line_items?.[0]?.quantity, 1);
    assert.equal(params.line_items?.[0]?.price_data?.recurring?.interval, "month");
    assert.equal(params.line_items?.[0]?.price_data?.unit_amount, 49700);
    assert.equal(params.line_items?.[0]?.price_data?.currency, "usd");
  });

  test("uses the prospect email as customer_email", () => {
    const params = buildCheckoutSessionParams(input);
    assert.equal(params.customer_email, "owner@example.com");
  });

  test("uses the prospect name in product_data", () => {
    const params = buildCheckoutSessionParams(input);
    const name = params.line_items?.[0]?.price_data?.product_data?.name ?? "";
    assert.ok(name.includes("Roofs by Shiloh"), `Expected name to include "Roofs by Shiloh", got: ${name}`);
  });

  test("includes proposal_id + preview_workspace_id in subscription metadata", () => {
    const params = buildCheckoutSessionParams(input);
    assert.equal(params.subscription_data?.metadata?.proposal_id, "prop_123");
    assert.equal(params.subscription_data?.metadata?.preview_workspace_id, "ws_456");
  });

  test("takes a 2% GMV application fee on the connected-account subscription", () => {
    const params = buildCheckoutSessionParams(input);
    assert.equal(params.subscription_data?.application_fee_percent, 2);
  });

  test("still takes 2% GMV when a setup fee is present", () => {
    const params = buildCheckoutSessionParams({ ...input, setupFeeCents: 75000 });
    assert.equal(params.subscription_data?.application_fee_percent, 2);
  });

  test("sets success_url + cancel_url back to /p/[token]", () => {
    const params = buildCheckoutSessionParams(input);
    assert.ok(
      params.success_url?.includes("/p/tok_xyzaaaaaaaaaaaaaaaaaaaaaaaaaaaa/success"),
      `Expected success_url to include token path, got: ${params.success_url}`,
    );
    assert.ok(
      params.cancel_url?.includes("/p/tok_xyzaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cancel"),
      `Expected cancel_url to include token path, got: ${params.cancel_url}`,
    );
    assert.ok(
      params.success_url?.includes("session_id={CHECKOUT_SESSION_ID}"),
      `Expected success_url to include session_id placeholder, got: ${params.success_url}`,
    );
  });

  test("adds a non-recurring setup fee line item when setupFeeCents > 0", () => {
    const params = buildCheckoutSessionParams({ ...input, setupFeeCents: 75000 });
    assert.equal(params.line_items?.length, 2);
    const setupLine = params.line_items?.[0];
    assert.equal(setupLine?.price_data?.unit_amount, 75000);
    assert.equal(setupLine?.price_data?.recurring, undefined);
    assert.ok(setupLine?.price_data?.product_data?.name?.includes("setup fee"));
  });

  test("omits the setup fee line item when setupFeeCents is 0 or unset", () => {
    const without = buildCheckoutSessionParams(input);
    assert.equal(without.line_items?.length, 1);
    const withZero = buildCheckoutSessionParams({ ...input, setupFeeCents: 0 });
    assert.equal(withZero.line_items?.length, 1);
  });

  test("setup fee line item precedes the monthly line item", () => {
    const params = buildCheckoutSessionParams({ ...input, setupFeeCents: 50000 });
    assert.equal(params.line_items?.[0]?.price_data?.recurring, undefined);
    assert.equal(params.line_items?.[1]?.price_data?.recurring?.interval, "month");
  });
});
