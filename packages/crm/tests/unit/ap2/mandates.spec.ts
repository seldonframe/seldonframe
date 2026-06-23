// AP2 mandate layer — pure types + HMAC detached signing/verification +
// constraint checks. TDD'd here BEFORE the implementation (red → green).
//
// AP2 (Google's Agent Payments Protocol) is a payment-method-agnostic MANDATE
// layer: signed artifacts ("VDCs") that prove user intent. This suite pins the
// three mandates (Intent / Cart / Payment), the HMAC detached-signature idiom
// (mirrors lib/marketplace/rental-token: canonical JSON + HMAC-SHA256 +
// constant-time compare), the verifier seam (real devStubVerifier =
// HMAC+expiry; vdcVerifier = throw-only documented stub), and the pure
// constraint checks (cart within intent; payment matches cart).
//
// EVERYTHING is pure + injected (secret + now) — no Date.now, no randomness — so
// it unit-tests with no env, no Postgres, no clock.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  canonicalize,
  signMandate,
  verifyMandateSignature,
  devStubVerifier,
  vdcVerifier,
  verifyIntentConstraints,
  verifyCartMatchesPayment,
  type IntentMandatePayload,
  type CartMandatePayload,
  type PaymentMandatePayload,
  type IntentMandate,
  type CartMandate,
  type PaymentMandate,
} from "../../../src/lib/ap2/mandates";

const SECRET = "test-secret-at-least-16-chars-long";
const NOW = new Date("2026-06-23T12:00:00.000Z");
const FUTURE = new Date("2026-06-23T13:00:00.000Z").getTime();
const PAST = new Date("2026-06-23T11:00:00.000Z").getTime();

// ── canonicalize ─────────────────────────────────────────────────────────────

describe("canonicalize", () => {
  test("produces identical output regardless of key insertion order", () => {
    const a = canonicalize({ b: 2, a: 1, c: { y: 2, x: 1 } });
    const b = canonicalize({ c: { x: 1, y: 2 }, a: 1, b: 2 });
    assert.equal(a, b);
  });

  test("is stable JSON (sorted keys, no whitespace surprises)", () => {
    assert.equal(canonicalize({ z: 1, a: 2 }), '{"a":2,"z":1}');
  });
});

// ── sign / verify round-trip ─────────────────────────────────────────────────

const intentPayload: IntentMandatePayload = {
  type: "intent",
  agent_id: "agent-007",
  max_amount: 5000,
  currency: "USD",
  merchants: ["acme-roofing"],
  expiry: FUTURE,
};

describe("signMandate / verifyMandateSignature", () => {
  test("a freshly signed mandate verifies true", () => {
    const signed = signMandate(intentPayload, SECRET);
    assert.equal(typeof signed.signature, "string");
    assert.ok(signed.signature.length > 0);
    assert.equal(verifyMandateSignature(signed, SECRET), true);
  });

  test("tampering with any payload field invalidates the signature", () => {
    const signed = signMandate(intentPayload, SECRET);
    const tampered: IntentMandate = {
      ...signed,
      max_amount: 999999, // bump the cap after signing
    };
    assert.equal(verifyMandateSignature(tampered, SECRET), false);
  });

  test("a wrong secret fails verification", () => {
    const signed = signMandate(intentPayload, SECRET);
    assert.equal(verifyMandateSignature(signed, "some-other-secret-16chars+"), false);
  });

  test("a malformed/empty signature never throws and returns false", () => {
    const bad = { ...intentPayload, signature: "" } as IntentMandate;
    assert.equal(verifyMandateSignature(bad, SECRET), false);
    const junk = { ...intentPayload, signature: "!!!not-base64url!!!" } as IntentMandate;
    assert.equal(verifyMandateSignature(junk, SECRET), false);
  });

  test("signature is independent of payload key order (canonical)", () => {
    const reordered = {
      expiry: FUTURE,
      currency: "USD",
      merchants: ["acme-roofing"],
      max_amount: 5000,
      agent_id: "agent-007",
      type: "intent",
    } as IntentMandatePayload;
    const a = signMandate(intentPayload, SECRET);
    const b = signMandate(reordered, SECRET);
    assert.equal(a.signature, b.signature);
  });
});

// ── devStubVerifier (real: HMAC + expiry) ────────────────────────────────────

describe("devStubVerifier", () => {
  test("valid signature + not expired → { kind: 'valid' }", () => {
    const signed = signMandate(intentPayload, SECRET);
    const verdict = devStubVerifier.verify(signed, { secret: SECRET, now: NOW });
    assert.equal(verdict.kind, "valid");
  });

  test("tampered mandate → { kind: 'invalid' }", () => {
    const signed = signMandate(intentPayload, SECRET);
    const tampered: IntentMandate = { ...signed, max_amount: 1 };
    const verdict = devStubVerifier.verify(tampered, { secret: SECRET, now: NOW });
    assert.equal(verdict.kind, "invalid");
  });

  test("good signature but past expiry → { kind: 'expired' }", () => {
    const expired = signMandate({ ...intentPayload, expiry: PAST }, SECRET);
    const verdict = devStubVerifier.verify(expired, { secret: SECRET, now: NOW });
    assert.equal(verdict.kind, "expired");
  });

  test("expiry is closed-open: now === expiry is expired", () => {
    const atBoundary = signMandate({ ...intentPayload, expiry: NOW.getTime() }, SECRET);
    const verdict = devStubVerifier.verify(atBoundary, { secret: SECRET, now: NOW });
    assert.equal(verdict.kind, "expired");
  });

  test("a mandate with no expiry verifies on signature alone (valid)", () => {
    const noExpiry = signMandate(
      { type: "cart", cart_id: "c1", items: [], total: 0, currency: "USD", merchant: "m" } as CartMandatePayload,
      SECRET,
    );
    const verdict = devStubVerifier.verify(noExpiry, { secret: SECRET, now: NOW });
    assert.equal(verdict.kind, "valid");
  });
});

// ── vdcVerifier (throw-only documented stub) ─────────────────────────────────

describe("vdcVerifier", () => {
  test("verify throws — real W3C-VC/DID path is not implemented", () => {
    const signed = signMandate(intentPayload, SECRET);
    assert.throws(
      () => vdcVerifier.verify(signed, { secret: SECRET, now: NOW }),
      /AP2 VDC verification not configured/,
    );
  });
});

// ── verifyIntentConstraints (cart ⊆ intent) ──────────────────────────────────

const cartPayload: CartMandatePayload = {
  type: "cart",
  cart_id: "cart-1",
  items: [{ listing_slug: "acme-roofing", name: "Roof Inspection", amount: 4000 }],
  total: 4000,
  currency: "USD",
  merchant: "acme-roofing",
  intent_ref: "agent-007",
  expiry: FUTURE,
};

describe("verifyIntentConstraints", () => {
  test("cart within the intent (amount, currency, merchant, not expired) → valid", () => {
    const verdict = verifyIntentConstraints(intentPayload, cartPayload, NOW);
    assert.equal(verdict.kind, "valid");
  });

  test("cart total over the intent max → constraint_violation", () => {
    const over: CartMandatePayload = { ...cartPayload, total: 5001 };
    const verdict = verifyIntentConstraints(intentPayload, over, NOW);
    assert.equal(verdict.kind, "constraint_violation");
  });

  test("cart total exactly equal to the intent max → valid (≤, not <)", () => {
    const exact: CartMandatePayload = { ...cartPayload, total: 5000 };
    const verdict = verifyIntentConstraints(intentPayload, exact, NOW);
    assert.equal(verdict.kind, "valid");
  });

  test("currency mismatch → constraint_violation", () => {
    const eur: CartMandatePayload = { ...cartPayload, currency: "EUR" };
    const verdict = verifyIntentConstraints(intentPayload, eur, NOW);
    assert.equal(verdict.kind, "constraint_violation");
  });

  test("merchant not in the intent's allowlist → constraint_violation", () => {
    const other: CartMandatePayload = { ...cartPayload, merchant: "rival-roofing" };
    const verdict = verifyIntentConstraints(intentPayload, other, NOW);
    assert.equal(verdict.kind, "constraint_violation");
  });

  test("an empty/undefined merchant allowlist permits any merchant", () => {
    const anyMerchant: IntentMandatePayload = { ...intentPayload, merchants: undefined };
    const verdict = verifyIntentConstraints(anyMerchant, cartPayload, NOW);
    assert.equal(verdict.kind, "valid");
  });

  test("expired intent → expired", () => {
    const expiredIntent: IntentMandatePayload = { ...intentPayload, expiry: PAST };
    const verdict = verifyIntentConstraints(expiredIntent, cartPayload, NOW);
    assert.equal(verdict.kind, "expired");
  });
});

// ── verifyCartMatchesPayment (payment ↔ cart) ────────────────────────────────

const paymentPayload: PaymentMandatePayload = {
  type: "payment",
  cart_ref: "cart-1",
  payment_method: { type: "x402" },
  amount: 4000,
  currency: "USD",
};

describe("verifyCartMatchesPayment", () => {
  test("amount + currency + cart_ref all agree → valid", () => {
    const verdict = verifyCartMatchesPayment(cartPayload, paymentPayload);
    assert.equal(verdict.kind, "valid");
  });

  test("amount mismatch → invalid", () => {
    const verdict = verifyCartMatchesPayment(cartPayload, { ...paymentPayload, amount: 3999 });
    assert.equal(verdict.kind, "invalid");
  });

  test("currency mismatch → invalid", () => {
    const verdict = verifyCartMatchesPayment(cartPayload, { ...paymentPayload, currency: "EUR" });
    assert.equal(verdict.kind, "invalid");
  });

  test("cart_ref points at a different cart → invalid", () => {
    const verdict = verifyCartMatchesPayment(cartPayload, { ...paymentPayload, cart_ref: "cart-2" });
    assert.equal(verdict.kind, "invalid");
  });
});
