// AP2 checkout handler — the DI'd two-step core (present cart → 402; pay →
// receipt), lifted out of the route so every branch is exercised with fakes:
// no real DB, no env, no x402 facilitator. TDD'd here BEFORE the route.
//
// Step 1: { cart_mandate, intent_mandate? } → verify signatures + intent
//   constraints + that every cart item resolves to a REAL published listing →
//   402 carrying the x402 payment-requirements + the AP2 challenge.
// Step 2: { cart_mandate, payment_mandate } + X-PAYMENT → verify the payment
//   matches the cart → settle through the INJECTED x402 verifier (inert dev
//   stub) → log ap2_settlement (attributed to the seller org, fee via
//   computeMarketplaceFeeCents) → receipt.
//
// MONEY-SAFETY assertions: settlement runs only through the injected x402
// verifier (default the inert devStubVerifier → `dev-` ref); the logged event
// carries amount_cents + fee_cents for seller-earnings attribution (same shape
// as the x402 metered-rental rail).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { handleAp2Checkout, type Ap2CheckoutDeps, type ResolvedListing } from "../../../src/lib/ap2/handler";
import {
  signMandate,
  type IntentMandatePayload,
  type CartMandatePayload,
  type PaymentMandatePayload,
} from "../../../src/lib/ap2/mandates";
import { centsToUsdcBaseUnits } from "../../../src/lib/marketplace/x402";

const SECRET = "test-secret-at-least-16-chars-long";
const NOW = new Date("2026-06-23T12:00:00.000Z");
const FUTURE = new Date("2026-06-23T13:00:00.000Z").getTime();

const SELLER_ORG = "org-seller-1";

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

const intentPayload: IntentMandatePayload = {
  type: "intent",
  agent_id: "agent-007",
  max_amount: 5000,
  currency: "USD",
  merchants: ["acme-roofing"],
  expiry: FUTURE,
};

const paymentPayload: PaymentMandatePayload = {
  type: "payment",
  cart_ref: "cart-1",
  payment_method: { type: "x402" },
  amount: 4000,
  currency: "USD",
};

/** A fake published-listing resolver: knows only "acme-roofing". */
const resolveListing = async (slug: string): Promise<ResolvedListing | null> => {
  if (slug === "acme-roofing") {
    return { slug, listingId: "listing-1", name: "Acme Roofing Agent", priceCents: 4000, creatorOrgId: SELLER_ORG };
  }
  return null;
};

/** An X-PAYMENT the x402 dev stub accepts for the given base units. */
function stubXPayment(baseUnits: string): string {
  const body = { x402Version: 1, scheme: "exact", network: "base", payload: { authorization: { value: baseUnits } } };
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64");
}

function baseDeps(overrides: Partial<Ap2CheckoutDeps> = {}): { deps: Ap2CheckoutDeps; logged: Parameters<Ap2CheckoutDeps["logSettlement"]>[0][] } {
  const logged: Parameters<Ap2CheckoutDeps["logSettlement"]>[0][] = [];
  const deps: Ap2CheckoutDeps = {
    getSecret: () => SECRET,
    now: () => NOW,
    resolveListing,
    resource: "https://app.seldonframe.com/api/ap2/checkout",
    payTo: "0x000000000000000000000000000000000000dEaD",
    logSettlement: (entry) => { logged.push(entry); },
    ...overrides,
  };
  return { deps, logged };
}

// ── Step 1: present cart → 402 ───────────────────────────────────────────────

describe("handleAp2Checkout — step 1 (present cart)", () => {
  test("a valid cart (+ intent) → 402 with x402 requirements + AP2 challenge", async () => {
    const { deps } = baseDeps();
    const body = {
      cart_mandate: signMandate(cartPayload, SECRET),
      intent_mandate: signMandate(intentPayload, SECRET),
    };
    const out = await handleAp2Checkout(body, null, deps);
    assert.equal(out.status, 402);
    const b = out.body as Record<string, any>;
    assert.equal(b.error, "payment_required");
    assert.equal(b.accepts[0].maxAmountRequired, centsToUsdcBaseUnits(4000));
    assert.equal(b.ap2.cart_ref, "cart-1");
    assert.equal(typeof b.ap2.payment_mandate_challenge, "string");
  });

  test("a valid cart with NO intent still 402s (intent is optional)", async () => {
    const { deps } = baseDeps();
    const out = await handleAp2Checkout({ cart_mandate: signMandate(cartPayload, SECRET) }, null, deps);
    assert.equal(out.status, 402);
  });

  test("a tampered cart signature → 401, no 402/requirements", async () => {
    const { deps } = baseDeps();
    const signed = signMandate(cartPayload, SECRET);
    const tampered = { ...signed, total: 1 }; // mutate after signing
    const out = await handleAp2Checkout({ cart_mandate: tampered }, null, deps);
    assert.equal(out.status, 401);
    assert.equal((out.body as any).accepts, undefined);
  });

  test("a cart that exceeds the intent's max_amount → 422 constraint error", async () => {
    const { deps } = baseDeps();
    const bigCart = { ...cartPayload, cart_id: "cart-big", total: 9000, items: [{ listing_slug: "acme-roofing", amount: 9000 }] };
    const body = {
      cart_mandate: signMandate(bigCart, SECRET),
      intent_mandate: signMandate(intentPayload, SECRET),
    };
    const out = await handleAp2Checkout(body, null, deps);
    assert.equal(out.status, 422);
    assert.match((out.body as any).reason, /exceeds/);
  });

  test("a cart item that does not resolve to a published listing → 404", async () => {
    const { deps } = baseDeps();
    const ghost = { ...cartPayload, cart_id: "cart-ghost", merchant: "ghost", items: [{ listing_slug: "does-not-exist", amount: 4000 }] };
    const out = await handleAp2Checkout({ cart_mandate: signMandate(ghost, SECRET) }, null, deps);
    assert.equal(out.status, 404);
  });

  test("an expired cart mandate → 401 (expired verdict)", async () => {
    const { deps } = baseDeps();
    const expired = signMandate({ ...cartPayload, cart_id: "cart-exp", expiry: NOW.getTime() - 1 }, SECRET);
    const out = await handleAp2Checkout({ cart_mandate: expired }, null, deps);
    assert.equal(out.status, 401);
  });

  test("a malformed body (no cart_mandate, no payment_mandate) → 400", async () => {
    const { deps } = baseDeps();
    const out = await handleAp2Checkout({}, null, deps);
    assert.equal(out.status, 400);
  });
});

// ── Step 2: pay → receipt ────────────────────────────────────────────────────

describe("handleAp2Checkout — step 2 (pay)", () => {
  test("valid payment mandate + stub X-PAYMENT → 200 receipt, settled via dev stub (no money)", async () => {
    const { deps, logged } = baseDeps();
    const body = {
      cart_mandate: signMandate(cartPayload, SECRET),
      payment_mandate: signMandate(paymentPayload, SECRET),
    };
    const out = await handleAp2Checkout(body, stubXPayment(centsToUsdcBaseUnits(4000)), deps);
    assert.equal(out.status, 200);
    const b = out.body as Record<string, any>;
    assert.equal(b.settled, true);
    assert.equal(b.receipt.cart_ref, "cart-1");
    assert.equal(b.receipt.amount, 4000);
    assert.match(b.receipt.payment_ref, /^dev-/); // money-safe: dev stub ref

    // Exactly one ap2_settlement logged, attributed to the SELLER org, with the
    // 5% marketplace fee on the cart total (same accrual shape as x402).
    assert.equal(logged.length, 1);
    const e = logged[0];
    assert.equal(e.sellerOrgId, SELLER_ORG);
    assert.equal(e.cartRef, "cart-1");
    assert.equal(e.amountCents, 4000);
    assert.equal(e.feeCents, 200); // 5% of 4000
    assert.equal(e.method, "x402");
    assert.match(e.paymentRef, /^dev-/);
  });

  test("missing X-PAYMENT on a pay request → 402 (stays), nothing logged", async () => {
    const { deps, logged } = baseDeps();
    const body = {
      cart_mandate: signMandate(cartPayload, SECRET),
      payment_mandate: signMandate(paymentPayload, SECRET),
    };
    const out = await handleAp2Checkout(body, null, deps);
    assert.equal(out.status, 402);
    assert.equal(logged.length, 0);
  });

  test("payment mandate amount disagreeing with the cart → 422, nothing settled", async () => {
    const { deps, logged } = baseDeps();
    const body = {
      cart_mandate: signMandate(cartPayload, SECRET),
      payment_mandate: signMandate({ ...paymentPayload, amount: 3999 }, SECRET),
    };
    const out = await handleAp2Checkout(body, stubXPayment(centsToUsdcBaseUnits(4000)), deps);
    assert.equal(out.status, 422);
    assert.equal(logged.length, 0);
  });

  test("a tampered payment mandate signature → 401, nothing settled", async () => {
    const { deps, logged } = baseDeps();
    const signed = signMandate(paymentPayload, SECRET);
    const tampered = { ...signed, amount: 1 };
    const body = { cart_mandate: signMandate(cartPayload, SECRET), payment_mandate: tampered };
    const out = await handleAp2Checkout(body, stubXPayment(centsToUsdcBaseUnits(4000)), deps);
    assert.equal(out.status, 401);
    assert.equal(logged.length, 0);
  });

  test("an underpaying X-PAYMENT → 402, nothing logged (settlement rejected by stub)", async () => {
    const { deps, logged } = baseDeps();
    const body = {
      cart_mandate: signMandate(cartPayload, SECRET),
      payment_mandate: signMandate(paymentPayload, SECRET),
    };
    const out = await handleAp2Checkout(body, stubXPayment(centsToUsdcBaseUnits(1)), deps);
    assert.equal(out.status, 402);
    assert.equal(logged.length, 0);
  });

  test("step 2 requires the cart_mandate too (stateless) — payment alone → 400", async () => {
    const { deps } = baseDeps();
    const out = await handleAp2Checkout({ payment_mandate: signMandate(paymentPayload, SECRET) }, stubXPayment(centsToUsdcBaseUnits(4000)), deps);
    assert.equal(out.status, 400);
  });

  test("settlement delegates to the injected verifier — a rejecting verifier blocks the receipt", async () => {
    const { deps, logged } = baseDeps({ settlementVerifier: async () => ({ ok: false, reason: "facilitator says no" }) });
    const body = {
      cart_mandate: signMandate(cartPayload, SECRET),
      payment_mandate: signMandate(paymentPayload, SECRET),
    };
    const out = await handleAp2Checkout(body, stubXPayment(centsToUsdcBaseUnits(4000)), deps);
    assert.equal(out.status, 402);
    assert.equal(logged.length, 0);
  });
});

// ── secret-unavailable path ──────────────────────────────────────────────────

describe("handleAp2Checkout — misconfiguration", () => {
  test("an unavailable signing secret → 500, never crashes", async () => {
    const { deps } = baseDeps({ getSecret: () => { throw new Error("no secret"); } });
    const out = await handleAp2Checkout({ cart_mandate: signMandate(cartPayload, SECRET) }, null, deps);
    assert.equal(out.status, 500);
  });
});
