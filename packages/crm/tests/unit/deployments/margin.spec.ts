// ICP-3 — TDD tests for the deployment PURE helpers (no DB).
//
// These power the Deploy-to-client stepper's live "margin readout" (Step 3) and
// the Clients-screen price column. They are display/estimate math only — NO
// billing happens here (Twilio/Stripe are later, gated tasks). Covers:
//   1. computeDeploymentMargin — fee = round(price*feePct); net = price - fee -
//      telephony - llm. Defaults: feePct 0.05, telephony 1200, llm 2500.
//   2. formatCentsMonthly — "$X/mo".
//   3. isDeploymentSurface / isDeploymentStatus validators (allow-list guards).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  computeDeploymentMargin,
  formatCentsMonthly,
  isDeploymentSurface,
  isDeploymentStatus,
  DEFAULT_SELDONFRAME_FEE_PCT,
  DEFAULT_TELEPHONY_CENTS,
  DEFAULT_LLM_CENTS,
} from "../../../src/lib/deployments/margin";

// ---------------------------------------------------------------------
// computeDeploymentMargin
// ---------------------------------------------------------------------

describe("computeDeploymentMargin", () => {
  test("applies the documented defaults (fee 5%, telephony 1200, llm 2500)", () => {
    // price $100.00 = 10000c. fee = round(10000 * 0.05) = 500. net = 10000 - 500 - 1200 - 2500 = 5800.
    const r = computeDeploymentMargin({ priceCents: 10000 });
    assert.equal(r.feeCents, 500);
    assert.equal(r.netCents, 5800);
  });

  test("the exported default constants have the documented values", () => {
    assert.equal(DEFAULT_SELDONFRAME_FEE_PCT, 0.05);
    assert.equal(DEFAULT_TELEPHONY_CENTS, 1200);
    assert.equal(DEFAULT_LLM_CENTS, 2500);
  });

  test("rounds the fee to the nearest cent (no fractional cents)", () => {
    // 9999 * 0.05 = 499.95 → rounds to 500.
    const r = computeDeploymentMargin({ priceCents: 9999 });
    assert.equal(r.feeCents, 500);
    assert.equal(Number.isInteger(r.feeCents), true);
    assert.equal(Number.isInteger(r.netCents), true);
  });

  test("honors caller overrides for feePct / telephonyCents / llmCents", () => {
    const r = computeDeploymentMargin({
      priceCents: 20000,
      feePct: 0.1, // fee = 2000
      telephonyCents: 1000,
      llmCents: 3000,
    });
    assert.equal(r.feeCents, 2000);
    assert.equal(r.netCents, 20000 - 2000 - 1000 - 3000); // 14000
  });

  test("net can go negative when costs exceed the price (honest readout)", () => {
    // price $10 = 1000c. fee = 50. net = 1000 - 50 - 1200 - 2500 = -2750.
    const r = computeDeploymentMargin({ priceCents: 1000 });
    assert.equal(r.netCents, -2750);
  });

  test("a zero price yields zero fee and a fully-negative net", () => {
    const r = computeDeploymentMargin({ priceCents: 0 });
    assert.equal(r.feeCents, 0);
    assert.equal(r.netCents, -(DEFAULT_TELEPHONY_CENTS + DEFAULT_LLM_CENTS));
  });

  test("clamps a negative price to 0 (defensive — UI should never send one)", () => {
    const r = computeDeploymentMargin({ priceCents: -5000 });
    assert.equal(r.feeCents, 0);
    assert.equal(r.netCents, -(DEFAULT_TELEPHONY_CENTS + DEFAULT_LLM_CENTS));
  });
});

// ---------------------------------------------------------------------
// formatCentsMonthly
// ---------------------------------------------------------------------

describe("formatCentsMonthly", () => {
  test("formats whole-dollar amounts without cents", () => {
    assert.equal(formatCentsMonthly(10000), "$100/mo");
    assert.equal(formatCentsMonthly(0), "$0/mo");
  });

  test("shows cents only when there is a fractional part", () => {
    assert.equal(formatCentsMonthly(9900), "$99/mo");
    assert.equal(formatCentsMonthly(9950), "$99.50/mo");
    assert.equal(formatCentsMonthly(12345), "$123.45/mo");
  });

  test("renders negative amounts with a leading minus", () => {
    assert.equal(formatCentsMonthly(-2750), "-$27.50/mo");
  });

  test("adds thousands separators", () => {
    assert.equal(formatCentsMonthly(150000), "$1,500/mo");
  });
});

// ---------------------------------------------------------------------
// surface / status validators
// ---------------------------------------------------------------------

describe("isDeploymentSurface", () => {
  test("accepts the known surfaces (incl. the sms + email text surfaces)", () => {
    assert.equal(isDeploymentSurface("phone"), true);
    assert.equal(isDeploymentSurface("embed"), true);
    assert.equal(isDeploymentSurface("link"), true);
    // Multi-surface runtime added these to DeploymentSurface; the validator
    // must accept them in lockstep with the type union.
    assert.equal(isDeploymentSurface("sms"), true);
    assert.equal(isDeploymentSurface("email"), true);
  });

  test("rejects anything else", () => {
    assert.equal(isDeploymentSurface("voice"), false); // not a deployment surface id
    assert.equal(isDeploymentSurface(""), false);
    assert.equal(isDeploymentSurface("PHONE"), false);
    assert.equal(isDeploymentSurface(undefined), false);
    assert.equal(isDeploymentSurface(42), false);
  });
});

describe("isDeploymentStatus", () => {
  test("accepts the four known statuses", () => {
    for (const s of ["draft", "active", "paused", "canceled"]) {
      assert.equal(isDeploymentStatus(s), true, `${s} should be valid`);
    }
  });

  test("rejects anything else", () => {
    assert.equal(isDeploymentStatus("live"), false);
    assert.equal(isDeploymentStatus("cancelled"), false); // British spelling not allowed
    assert.equal(isDeploymentStatus(""), false);
    assert.equal(isDeploymentStatus(null), false);
  });
});
