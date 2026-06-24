// AP2 → x402 bridge — pure composition over the EXISTING x402 protocol layer.
// TDD'd here BEFORE the implementation.
//
// The bridge is the seam where an AP2 CartMandate becomes an x402 402 (the
// payment-requirements the buyer's agent retries against) and where a
// PaymentMandate's `X-PAYMENT` is settled — by delegating to the INJECTED x402
// `SettlementVerifier` (default the inert `devStubVerifier`). It reuses x402's
// `buildPaymentRequired` + `parseXPaymentHeader` + verifier seam verbatim; it
// reimplements none of them.
//
// MONEY-SAFETY assertion baked into this suite: settlement only ever happens
// through the injected x402 verifier; the default is `devStubVerifier`, whose
// txRef is the unmistakable `dev-` shape → NO money moved.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  cartMandateToX402Requirements,
  settlePaymentMandateViaX402,
  buildAp2Receipt,
} from "../../../src/lib/ap2/bridge";
import { centsToUsdcBaseUnits, type SettlementVerifier } from "../../../src/lib/marketplace/x402";
import { signMandate, type CartMandatePayload, type PaymentMandatePayload } from "../../../src/lib/ap2/mandates";

const SECRET = "test-secret-at-least-16-chars-long";
const RESOURCE = "https://app.seldonframe.com/api/ap2/checkout";
const PAY_TO = "0x000000000000000000000000000000000000dEaD";

const cart: CartMandatePayload = {
  type: "cart",
  cart_id: "cart-42",
  items: [{ listing_slug: "acme-roofing", name: "Roof Inspection", amount: 4000 }],
  total: 4000,
  currency: "USD",
  merchant: "acme-roofing",
};

const payment: PaymentMandatePayload = {
  type: "payment",
  cart_ref: "cart-42",
  payment_method: { type: "x402" },
  amount: 4000,
  currency: "USD",
};

/** Build a base64 X-PAYMENT header the x402 devStubVerifier ACCEPTS for a given
 *  base-unit amount (scheme/network must match the requirement; the declared
 *  value lives at payload.authorization.value). */
function stubXPaymentHeader(baseUnits: string): string {
  const body = {
    x402Version: 1,
    scheme: "exact",
    network: "base",
    payload: { authorization: { value: baseUnits } },
  };
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}

// ── cartMandateToX402Requirements ────────────────────────────────────────────

describe("cartMandateToX402Requirements", () => {
  test("emits an x402 402 body whose required amount equals the cart total (in USDC base units)", () => {
    const out = cartMandateToX402Requirements(cart, { resource: RESOURCE, payTo: PAY_TO });
    assert.equal(out.requirements.error, "payment_required");
    assert.equal(out.requirements.x402Version, 1);
    const req = out.requirements.accepts[0];
    assert.equal(req.scheme, "exact");
    assert.equal(req.maxAmountRequired, centsToUsdcBaseUnits(4000)); // "40000000"
    assert.equal(req.resource, RESOURCE);
    assert.equal(req.payTo, PAY_TO);
  });

  test("echoes an AP2 challenge block carrying the cart ref + a deterministic nonce (no randomness)", () => {
    const a = cartMandateToX402Requirements(cart, { resource: RESOURCE, payTo: PAY_TO });
    const b = cartMandateToX402Requirements(cart, { resource: RESOURCE, payTo: PAY_TO });
    assert.equal(a.ap2.cart_ref, "cart-42");
    assert.equal(typeof a.ap2.payment_mandate_challenge, "string");
    assert.ok(a.ap2.payment_mandate_challenge.length > 0);
    // Deterministic: derived from the cart id, NOT random — two builds match.
    assert.equal(a.ap2.payment_mandate_challenge, b.ap2.payment_mandate_challenge);
  });
});

// ── settlePaymentMandateViaX402 ──────────────────────────────────────────────

describe("settlePaymentMandateViaX402", () => {
  test("a valid stub X-PAYMENT settles via devStubVerifier and returns a 'dev-' receipt (no money)", async () => {
    const signedPayment = signMandate(payment, SECRET);
    const header = stubXPaymentHeader(centsToUsdcBaseUnits(4000));
    const out = await settlePaymentMandateViaX402({
      paymentMandate: signedPayment,
      xPaymentHeader: header,
      resource: RESOURCE,
      payTo: PAY_TO,
      // verifier omitted → defaults to the inert devStubVerifier.
    });
    assert.equal(out.settled, true);
    assert.equal(out.receipt.cart_ref, "cart-42");
    assert.equal(out.receipt.amount, 4000);
    assert.equal(out.receipt.currency, "USD");
    assert.equal(out.receipt.method, "x402");
    // The settlement reference is the unmistakable dev-stub shape → NO on-chain
    // settlement occurred. This is the money-safety assertion.
    assert.match(out.receipt.payment_ref, /^dev-/);
  });

  test("a missing/empty X-PAYMENT does NOT settle", async () => {
    const signedPayment = signMandate(payment, SECRET);
    const out = await settlePaymentMandateViaX402({
      paymentMandate: signedPayment,
      xPaymentHeader: "",
      resource: RESOURCE,
      payTo: PAY_TO,
    });
    assert.equal(out.settled, false);
    assert.ok(out.reason && out.reason.length > 0);
  });

  test("an underpaying X-PAYMENT (below the cart total) does NOT settle", async () => {
    const signedPayment = signMandate(payment, SECRET);
    const header = stubXPaymentHeader(centsToUsdcBaseUnits(100)); // far below 4000c
    const out = await settlePaymentMandateViaX402({
      paymentMandate: signedPayment,
      xPaymentHeader: header,
      resource: RESOURCE,
      payTo: PAY_TO,
    });
    assert.equal(out.settled, false);
  });

  test("settlement delegates to the INJECTED verifier — a custom verifier is the only money path", async () => {
    const signedPayment = signMandate(payment, SECRET);
    let called = false;
    const spyVerifier: SettlementVerifier = async (_payment, _req) => {
      called = true;
      return { ok: true, txRef: "spy-ref-123" };
    };
    const out = await settlePaymentMandateViaX402({
      paymentMandate: signedPayment,
      xPaymentHeader: stubXPaymentHeader(centsToUsdcBaseUnits(4000)),
      resource: RESOURCE,
      payTo: PAY_TO,
      verifier: spyVerifier,
    });
    assert.equal(called, true, "the injected verifier must be the one consulted");
    assert.equal(out.settled, true);
    assert.equal(out.receipt.payment_ref, "spy-ref-123");
  });

  test("a rejecting verifier yields settled:false (never serve on rejection)", async () => {
    const signedPayment = signMandate(payment, SECRET);
    const rejectVerifier: SettlementVerifier = async () => ({ ok: false, reason: "nope" });
    const out = await settlePaymentMandateViaX402({
      paymentMandate: signedPayment,
      xPaymentHeader: stubXPaymentHeader(centsToUsdcBaseUnits(4000)),
      resource: RESOURCE,
      payTo: PAY_TO,
      verifier: rejectVerifier,
    });
    assert.equal(out.settled, false);
  });

  test("a throwing verifier is caught and yields settled:false (never crashes the bridge)", async () => {
    const signedPayment = signMandate(payment, SECRET);
    const boomVerifier: SettlementVerifier = async () => {
      throw new Error("facilitator exploded");
    };
    const out = await settlePaymentMandateViaX402({
      paymentMandate: signedPayment,
      xPaymentHeader: stubXPaymentHeader(centsToUsdcBaseUnits(4000)),
      resource: RESOURCE,
      payTo: PAY_TO,
      verifier: boomVerifier,
    });
    assert.equal(out.settled, false);
  });
});

// ── buildAp2Receipt ──────────────────────────────────────────────────────────

describe("buildAp2Receipt", () => {
  test("assembles a pure receipt from the payment mandate + settlement ref", () => {
    const receipt = buildAp2Receipt(payment, "dev-abc123");
    assert.deepEqual(receipt, {
      cart_ref: "cart-42",
      amount: 4000,
      currency: "USD",
      method: "x402",
      payment_ref: "dev-abc123",
    });
  });
});
