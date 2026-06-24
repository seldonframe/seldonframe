// AP2 (Agent Payments Protocol) — the PURE mandate layer.
//
// AP2 is Google's open, payment-method-agnostic protocol for agentic commerce:
// a user authorizes an agent to transact on their behalf via signed artifacts
// called MANDATES (a.k.a. "VDCs" — Verifiable Digital Credentials). There are
// three, forming a chain of consent:
//
//   • IntentMandate  — the user grants an agent authority to transact within
//                      constraints (max_amount, currency, merchants?, expiry).
//   • CartMandate    — the specific cart the user/agent approves (items, total,
//                      currency, merchant, optional intent_ref, expiry).
//   • PaymentMandate — authorizes payment for a cart via a method
//                      (cart_ref, payment_method:{type:"x402"|"card"}, amount).
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY: this module ONLY *verifies* mandates. It moves NO money and has
// NO settlement path — actual settlement is delegated to the existing x402
// `SettlementVerifier` (via lib/ap2/bridge), whose only wired impl is the inert
// `devStubVerifier`. AP2 adds zero new money path.
//
// SIGNATURES (v1): a real but simple HMAC-SHA256 DETACHED signature over the
// mandate's canonical JSON — verifiable, table-free, and mirroring the proven
// rental-token idiom (lib/marketplace/rental-token): canonical payload + HMAC +
// constant-time compare, never throwing on malformed input. The REAL W3C-VC/DID
// signature path is `vdcVerifier`, a documented throw-only stub — not v1.
//
// PURITY: every function is pure and takes its `secret` + `now` INJECTED — no
// Date.now, no randomness — so the whole layer unit-tests with no env, no clock,
// no Postgres.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac, timingSafeEqual } from "node:crypto";

// ─── mandate payloads ────────────────────────────────────────────────────────

/** A single approved line item in a CartMandate. `listing_slug` ties the item
 *  to a real published marketplace listing (the route resolves it). */
export type CartItem = {
  /** The marketplace listing slug this line item buys (resolved server-side). */
  listing_slug: string;
  /** Display name (echoed back on the receipt). */
  name?: string;
  /** Item price in CENTS (integer; mirrors marketplaceListings.price). */
  amount: number;
};

/** IntentMandate payload — the user's grant of authority to an agent. */
export type IntentMandatePayload = {
  type: "intent";
  /** The agent the authority is granted to. */
  agent_id: string;
  /** Spend ceiling in CENTS for any cart authorized under this intent. */
  max_amount: number;
  /** ISO-4217 currency the authority is denominated in (e.g. "USD"). */
  currency: string;
  /** Optional merchant allowlist (listing slugs / merchant ids). When absent or
   *  empty, any merchant is permitted (the user did not constrain by merchant). */
  merchants?: string[];
  /** Optional expiry — epoch ms. Closed-open: now >= expiry is expired. */
  expiry?: number;
};

/** CartMandate payload — the specific cart the user/agent approves. */
export type CartMandatePayload = {
  type: "cart";
  cart_id: string;
  items: CartItem[];
  /** Cart total in CENTS (the route also re-derives this from items). */
  total: number;
  currency: string;
  /** The merchant this cart is with (a listing slug / merchant id). */
  merchant: string;
  /** Optional back-reference to the IntentMandate's agent_id this cart is under. */
  intent_ref?: string;
  /** Optional expiry — epoch ms (closed-open). */
  expiry?: number;
};

/** The payment rail a PaymentMandate settles on. v1 wires x402 settlement only;
 *  "card" is accepted in the type for forward-compat but has no settlement path
 *  here (deferred). */
export type PaymentMethod = { type: "x402" | "card" };

/** PaymentMandate payload — authorizes payment for a specific cart. */
export type PaymentMandatePayload = {
  type: "payment";
  /** The CartMandate.cart_id this payment settles. */
  cart_ref: string;
  payment_method: PaymentMethod;
  /** Amount in CENTS — must equal the cart total. */
  amount: number;
  currency: string;
  /** Optional expiry — epoch ms (closed-open). */
  expiry?: number;
};

/** Any mandate payload (the signable shapes). */
export type MandatePayload =
  | IntentMandatePayload
  | CartMandatePayload
  | PaymentMandatePayload;

/** A signed mandate = its payload + a detached HMAC signature string. */
export type IntentMandate = IntentMandatePayload & { signature: string };
export type CartMandate = CartMandatePayload & { signature: string };
export type PaymentMandate = PaymentMandatePayload & { signature: string };
export type SignedMandate = MandatePayload & { signature: string };

/** The outcome of verifying a mandate. `valid` is the only pass; the failure
 *  kinds are distinguished so callers/UX can react precisely. */
export type MandateVerdict =
  | { kind: "valid" }
  | { kind: "invalid"; reason: string }
  | { kind: "expired"; reason: string }
  | { kind: "constraint_violation"; reason: string };

// ─── canonicalize ────────────────────────────────────────────────────────────

/**
 * Stable, deterministic JSON for signing: object keys sorted recursively so the
 * SAME logical payload always produces the SAME bytes regardless of key
 * insertion order (a signature must not depend on JS property ordering). Arrays
 * keep their order (it's semantically meaningful — line items). No whitespace.
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortDeep(obj[key]);
    }
    return out;
  }
  return value;
}

// ─── sign / verify (HMAC detached signature) ─────────────────────────────────

/** The `signature` field is excluded from the signed bytes (it's the detached
 *  signature OVER the rest). Strip it before canonicalizing. */
function payloadWithoutSignature<T extends { signature?: string }>(mandate: T): Omit<T, "signature"> {
  const { signature: _omit, ...rest } = mandate;
  return rest;
}

function hmacBase64Url(canonical: string, secret: string): string {
  return createHmac("sha256", secret).update(canonical).digest("base64url");
}

/**
 * Sign a mandate payload: HMAC-SHA256 over its canonical JSON, returned as a
 * base64url detached signature attached as `{ ...payload, signature }`. Pure —
 * the secret is injected by the caller (server-only).
 */
export function signMandate<T extends MandatePayload>(payload: T, secret: string): T & { signature: string } {
  const canonical = canonicalize(payload);
  const signature = hmacBase64Url(canonical, secret);
  return { ...payload, signature };
}

/**
 * Verify a signed mandate's detached signature with constant-time comparison.
 * NEVER throws — malformed/empty/non-base64url signatures return false (so a
 * tampered request can't crash the verifier). Mirrors rental-token's compare:
 * recompute the expected HMAC over the canonical payload-sans-signature, then
 * timingSafeEqual on equal-length buffers.
 */
export function verifyMandateSignature(mandate: SignedMandate, secret: string): boolean {
  const presented = typeof mandate.signature === "string" ? mandate.signature : "";
  if (!presented) return false;

  const canonical = canonicalize(payloadWithoutSignature(mandate));
  const expected = hmacBase64Url(canonical, secret);

  let presentedBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    presentedBuf = Buffer.from(presented, "base64url");
    expectedBuf = Buffer.from(expected, "base64url");
  } catch {
    return false;
  }
  if (presentedBuf.length === 0) return false;
  if (presentedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(presentedBuf, expectedBuf);
}

// ─── verifier seam ───────────────────────────────────────────────────────────

/** Context a verifier needs: the signing secret + the current time (injected
 *  for deterministic, closed-open expiry checks). */
export type MandateVerifyContext = {
  secret: string;
  now: Date;
};

/** The pluggable mandate-verification seam. The route DI's this so v1 can run
 *  the real-but-simple HMAC verifier while the W3C-VC/DID path stays an explicit
 *  unimplemented stub. */
export interface MandateVerifier {
  verify(mandate: SignedMandate, ctx: MandateVerifyContext): MandateVerdict;
}

/** Read a mandate payload's optional `expiry` (epoch ms), or null if unset. */
function readExpiry(mandate: SignedMandate): number | null {
  const exp = (mandate as { expiry?: unknown }).expiry;
  return typeof exp === "number" ? exp : null;
}

/**
 * The REAL v1 verifier: validate the HMAC detached signature, then the expiry.
 * Verdict order: bad signature → invalid; good signature but past expiry →
 * expired; otherwise valid. A mandate with no `expiry` passes on signature
 * alone. Pure (secret + now injected). MOVES NO MONEY — it only checks
 * authenticity + freshness.
 */
export const devStubVerifier: MandateVerifier = {
  verify(mandate, ctx) {
    if (!verifyMandateSignature(mandate, ctx.secret)) {
      return { kind: "invalid", reason: "Mandate signature is invalid or tampered." };
    }
    const expiry = readExpiry(mandate);
    // Closed-open: now < expiry is fresh; now >= expiry is expired.
    if (expiry !== null && ctx.now.getTime() >= expiry) {
      return { kind: "expired", reason: "Mandate has expired." };
    }
    return { kind: "valid" };
  },
};

/**
 * The REAL W3C-VC / DID signature verifier — NOT IMPLEMENTED in v1.
 *
 * AP2's production mandates are Verifiable Digital Credentials signed with the
 * user's / agent's DID key and verified against a DID document + the AP2 trust
 * registry. That is a substantial dependency (DID resolution, JSON-LD canonical-
 * ization, did:web/did:key support) and is deliberately deferred: v1 uses the
 * HMAC detached signature above. This throw-only stub marks the seam so wiring
 * the real path later is a single, deliberate swap (mirrors x402's
 * coinbaseFacilitatorVerifier stub). It MUST NOT silently pass.
 */
export const vdcVerifier: MandateVerifier = {
  verify() {
    throw new Error(
      "AP2 VDC verification not configured — the real W3C-VC/DID signature path is not implemented in v1 (use devStubVerifier).",
    );
  },
};

// ─── constraint checks (pure) ────────────────────────────────────────────────

/**
 * Verify a CartMandate is within the authority of an IntentMandate:
 *   • the intent is not expired (now < intent.expiry),
 *   • cart.total ≤ intent.max_amount,
 *   • cart.currency === intent.currency,
 *   • cart.merchant is in intent.merchants (when that allowlist is non-empty).
 *
 * Pure; `now` injected. Returns `expired` if the INTENT itself has lapsed,
 * `constraint_violation` for an over-budget / wrong-currency / disallowed-
 * merchant cart, else `valid`. (Signature validity is checked separately by the
 * verifier; this is the AUTHORITY check.)
 */
export function verifyIntentConstraints(
  intent: IntentMandatePayload,
  cart: CartMandatePayload,
  now: Date,
): MandateVerdict {
  if (typeof intent.expiry === "number" && now.getTime() >= intent.expiry) {
    return { kind: "expired", reason: "Intent mandate has expired." };
  }
  if (cart.currency !== intent.currency) {
    return {
      kind: "constraint_violation",
      reason: `Cart currency ${cart.currency} does not match intent currency ${intent.currency}.`,
    };
  }
  if (cart.total > intent.max_amount) {
    return {
      kind: "constraint_violation",
      reason: `Cart total ${cart.total} exceeds intent max_amount ${intent.max_amount}.`,
    };
  }
  const allow = intent.merchants ?? [];
  if (allow.length > 0 && !allow.includes(cart.merchant)) {
    return {
      kind: "constraint_violation",
      reason: `Merchant ${cart.merchant} is not in the intent's allowed merchants.`,
    };
  }
  return { kind: "valid" };
}

/**
 * Verify a PaymentMandate matches the CartMandate it claims to settle:
 *   • payment.cart_ref === cart.cart_id,
 *   • payment.amount === cart.total,
 *   • payment.currency === cart.currency.
 *
 * Pure. Returns `invalid` on any mismatch, else `valid`. (This is the cart↔
 * payment agreement check; signature validity is the verifier's job.)
 */
export function verifyCartMatchesPayment(
  cart: CartMandatePayload,
  payment: PaymentMandatePayload,
): MandateVerdict {
  if (payment.cart_ref !== cart.cart_id) {
    return { kind: "invalid", reason: `Payment cart_ref ${payment.cart_ref} does not match cart ${cart.cart_id}.` };
  }
  if (payment.currency !== cart.currency) {
    return { kind: "invalid", reason: `Payment currency ${payment.currency} does not match cart currency ${cart.currency}.` };
  }
  if (payment.amount !== cart.total) {
    return { kind: "invalid", reason: `Payment amount ${payment.amount} does not match cart total ${cart.total}.` };
  }
  return { kind: "valid" };
}
