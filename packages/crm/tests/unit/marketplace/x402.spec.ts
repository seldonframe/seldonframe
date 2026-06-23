// x402 protocol — pure builder/parser/verifier for the metered rental rail.
//
// The rail (agent-mcp-handler) returns HTTP 402 with a standard x402
// payment-requirements body when a metered call is due, and verifies the
// renter's retry `X-PAYMENT` header before serving. This module is the pure
// protocol layer: build the 402 body, parse the header, and run a PLUGGABLE
// settlement verifier.
//
// MONEY-SAFETY: the only verifier shipped is `devStubVerifier`, which validates
// shape + amount and returns a fake txRef WITHOUT any chain/network call. The
// real Coinbase-facilitator verifier is a documented seam — NOT implemented —
// so prod cannot move USDC until Max wires it.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  X402_VERSION,
  USDC_DECIMALS,
  BASE_USDC_ASSET,
  centsToUsdcBaseUnits,
  buildPaymentRequired,
  parseXPaymentHeader,
  devStubVerifier,
  type PaymentRequirements,
} from "../../../src/lib/marketplace/x402";

describe("centsToUsdcBaseUnits — 6-decimal conversion", () => {
  test("USDC has 6 decimals", () => {
    assert.equal(USDC_DECIMALS, 6);
  });

  test("$0.02 (2 cents) → 20_000 base units", () => {
    // 2 cents = $0.02 = 0.02 * 1e6 = 20_000 atomic units.
    assert.equal(centsToUsdcBaseUnits(2), "20000");
  });

  test("$1.00 (100 cents) → 1_000_000 base units", () => {
    assert.equal(centsToUsdcBaseUnits(100), "1000000");
  });

  test("$2.00 (200 cents) → 2_000_000 base units", () => {
    assert.equal(centsToUsdcBaseUnits(200), "2000000");
  });

  test("$10.00 (1000 cents) → 10_000_000 base units", () => {
    assert.equal(centsToUsdcBaseUnits(1000), "10000000");
  });

  test("returns a decimal STRING (no float rounding, no bigint leakage)", () => {
    const v = centsToUsdcBaseUnits(123_456);
    assert.equal(typeof v, "string");
    // 123_456 cents = $1234.56 → 1234.56 * 1e6 = 1_234_560_000.
    assert.equal(v, "1234560000");
  });

  test("non-finite / negative → '0' (defensive)", () => {
    assert.equal(centsToUsdcBaseUnits(Number.NaN), "0");
    assert.equal(centsToUsdcBaseUnits(-5), "0");
    assert.equal(centsToUsdcBaseUnits(Number.POSITIVE_INFINITY), "0");
  });

  test("fractional cents are rounded to whole cents before conversion", () => {
    // 2.4 cents → 2 cents → 20_000.
    assert.equal(centsToUsdcBaseUnits(2.4), "20000");
  });
});

describe("buildPaymentRequired — the x402 402 body", () => {
  const reqs = buildPaymentRequired({
    amountCents: 200,
    resource: "https://app.seldonframe.com/api/v1/agents/plumber-bot/mcp",
    payTo: "0xPayToAddress",
  });

  test("top-level shape: x402Version + error + accepts[]", () => {
    assert.equal(reqs.x402Version, X402_VERSION);
    assert.equal(reqs.error, "payment_required");
    assert.ok(Array.isArray(reqs.accepts));
    assert.equal(reqs.accepts.length, 1);
  });

  test("the accepts entry carries the exact-scheme settlement requirements", () => {
    const a = reqs.accepts[0];
    assert.equal(a.scheme, "exact");
    assert.equal(a.network, "base"); // default network
    // The amount is in USDC base units (6 decimals), as a string — $2.00.
    assert.equal(a.maxAmountRequired, "2000000");
    assert.equal(a.resource, "https://app.seldonframe.com/api/v1/agents/plumber-bot/mcp");
    assert.equal(a.payTo, "0xPayToAddress");
    assert.equal(a.asset, BASE_USDC_ASSET);
    assert.equal(a.maxTimeoutSeconds, 60);
    assert.equal(typeof a.description, "string");
  });

  test("network override is honored", () => {
    const r = buildPaymentRequired({
      amountCents: 100,
      resource: "https://x/y",
      payTo: "0xabc",
      network: "base-sepolia",
    });
    assert.equal(r.accepts[0].network, "base-sepolia");
  });
});

describe("parseXPaymentHeader — base64 JSON, never throws", () => {
  function encode(obj: unknown): string {
    return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
  }

  test("a well-formed X-PAYMENT header decodes to a typed payment", () => {
    const header = encode({
      x402Version: 1,
      scheme: "exact",
      network: "base",
      payload: { signature: "0xdeadbeef", authorization: { value: "2000000" } },
    });
    const res = parseXPaymentHeader(header);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.payment.x402Version, 1);
      assert.equal(res.payment.scheme, "exact");
      assert.equal(res.payment.network, "base");
      assert.ok(res.payment.payload);
    }
  });

  test("null / empty header → { ok:false }", () => {
    assert.equal(parseXPaymentHeader(null).ok, false);
    assert.equal(parseXPaymentHeader("").ok, false);
    assert.equal(parseXPaymentHeader("   ").ok, false);
  });

  test("non-base64 garbage → { ok:false }, does NOT throw", () => {
    const res = parseXPaymentHeader("!!!! not base64 @@@");
    assert.equal(res.ok, false);
  });

  test("valid base64 but not JSON → { ok:false }", () => {
    const notJson = Buffer.from("hello world", "utf8").toString("base64");
    const res = parseXPaymentHeader(notJson);
    assert.equal(res.ok, false);
  });

  test("JSON missing required fields → { ok:false } with a reason", () => {
    const res = parseXPaymentHeader(encode({ scheme: "exact" })); // no version/payload
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(typeof res.reason, "string");
  });

  test("wrong x402Version type → { ok:false }", () => {
    const res = parseXPaymentHeader(encode({ x402Version: "1", scheme: "exact", network: "base", payload: {} }));
    assert.equal(res.ok, false);
  });
});

describe("devStubVerifier — validates shape + amount, MOVES NO MONEY", () => {
  const requirements: PaymentRequirements["accepts"][number] = {
    scheme: "exact",
    network: "base",
    maxAmountRequired: "2000000", // $2.00 in base units
    resource: "https://x/y",
    payTo: "0xabc",
    asset: BASE_USDC_ASSET,
    maxTimeoutSeconds: 60,
    description: "Rental call",
  };

  test("accepts a well-formed payment that meets the required amount → ok + dev txRef", async () => {
    const payment = {
      x402Version: 1,
      scheme: "exact",
      network: "base",
      payload: { authorization: { value: "2000000" } },
    };
    const res = await devStubVerifier(payment, requirements);
    assert.equal(res.ok, true);
    if (res.ok) {
      // The txRef is a clearly-fake dev marker — proves no real settlement.
      assert.match(res.txRef, /^dev-/);
    }
  });

  test("a payment over the required amount is accepted (overpay ok)", async () => {
    const payment = { x402Version: 1, scheme: "exact", network: "base", payload: { authorization: { value: "5000000" } } };
    const res = await devStubVerifier(payment, requirements);
    assert.equal(res.ok, true);
  });

  test("underpayment is rejected", async () => {
    const payment = { x402Version: 1, scheme: "exact", network: "base", payload: { authorization: { value: "1000000" } } };
    const res = await devStubVerifier(payment, requirements);
    assert.equal(res.ok, false);
    if (!res.ok) assert.match(res.reason, /amount|underpay|insufficient/i);
  });

  test("scheme mismatch is rejected", async () => {
    const payment = { x402Version: 1, scheme: "upto", network: "base", payload: { authorization: { value: "2000000" } } };
    const res = await devStubVerifier(payment, requirements);
    assert.equal(res.ok, false);
  });

  test("network mismatch is rejected", async () => {
    const payment = { x402Version: 1, scheme: "exact", network: "ethereum", payload: { authorization: { value: "2000000" } } };
    const res = await devStubVerifier(payment, requirements);
    assert.equal(res.ok, false);
  });

  test("a payment with no decodable amount is rejected (never assume paid)", async () => {
    const payment = { x402Version: 1, scheme: "exact", network: "base", payload: {} };
    const res = await devStubVerifier(payment, requirements);
    assert.equal(res.ok, false);
  });
});
