// AP2 → x402 bridge — the seam that settles an AP2 PaymentMandate through the
// EXISTING x402 rail, reusing its protocol layer verbatim.
//
// Two directions:
//   • cartMandateToX402Requirements — an AP2 CartMandate → the x402 402 body
//     (the payment-requirements the buyer's agent retries against), plus an
//     "ap2" block echoing the cart ref + a deterministic payment-mandate
//     challenge (derived from the cart id — NO randomness).
//   • settlePaymentMandateViaX402 — an AP2 PaymentMandate + its `X-PAYMENT`
//     header → parse via x402's parser → verify via the INJECTED x402
//     `SettlementVerifier` (default the inert `devStubVerifier`) → an AP2
//     receipt.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY: settlement is delegated ENTIRELY to the injected x402 verifier.
// The default is `devStubVerifier`, which validates the payment's SHAPE +
// amount and returns a fake `dev-` reference WITHOUT any network/chain call — it
// moves NO money. AP2 adds no settlement of its own; this bridge is pure
// composition over x402's existing, already-merged (inert) rail. To go live,
// Max swaps the verifier for x402's `coinbaseFacilitatorVerifier` (the same flip
// that turns the metered-rental rail live) — there is no separate AP2 money
// path to wire.
// ─────────────────────────────────────────────────────────────────────────────

import { createHmac } from "node:crypto";
import {
  buildPaymentRequired,
  parseXPaymentHeader,
  devStubVerifier,
  type PaymentRequirements,
  type SettlementVerifier,
} from "../marketplace/x402";
import type { CartMandatePayload, PaymentMandatePayload } from "./mandates";

// ─── cart → x402 requirements ────────────────────────────────────────────────

/** The AP2 echo block that rides alongside the x402 402: the cart this 402 is
 *  for, plus the deterministic challenge the buyer must bind into the
 *  PaymentMandate it returns. */
export type Ap2Challenge = {
  cart_ref: string;
  /** A deterministic per-cart nonce (HMAC of the cart id under a fixed label —
   *  NOT random) so the same cart always yields the same challenge and the
   *  buyer's PaymentMandate can be checked against it without server state. */
  payment_mandate_challenge: string;
};

export type CartToX402Result = {
  requirements: PaymentRequirements;
  ap2: Ap2Challenge;
};

export type CartToX402Opts = {
  /** The canonical resource URL the 402 advertises (the AP2 checkout endpoint). */
  resource: string;
  /** The USDC pay-to address (Max's setup; unset upstream ⇒ no 402 demanded). */
  payTo: string;
  /** Optional network override (defaults to x402's Base mainnet). */
  network?: string;
  /** Optional human description for the 402 line. */
  description?: string;
};

/**
 * Derive the deterministic payment-mandate challenge for a cart: HMAC-SHA256 of
 * the cart id under a fixed label, truncated. Deterministic (no randomness) so
 * it's reproducible across calls and verifiable statelessly. Not a secret — it
 * binds the PaymentMandate to THIS cart; the security boundary is the mandate
 * signatures + the x402 settlement, not this nonce.
 */
export function cartChallenge(cartId: string): string {
  return createHmac("sha256", "ap2-cart-challenge").update(cartId).digest("base64url").slice(0, 32);
}

/**
 * Turn an AP2 CartMandate into the x402 `402 Payment Required` body (via x402's
 * own `buildPaymentRequired` — not reimplemented) carrying the cart total in
 * USDC base units, plus the AP2 challenge block. The cart `total` is in CENTS,
 * which is exactly what `buildPaymentRequired` expects.
 */
export function cartMandateToX402Requirements(
  cart: CartMandatePayload,
  opts: CartToX402Opts,
): CartToX402Result {
  const requirements = buildPaymentRequired({
    amountCents: cart.total,
    resource: opts.resource,
    payTo: opts.payTo,
    network: opts.network,
    description: opts.description ?? `AP2 cart ${cart.cart_id} — ${cart.merchant}`,
  });
  return {
    requirements,
    ap2: {
      cart_ref: cart.cart_id,
      payment_mandate_challenge: cartChallenge(cart.cart_id),
    },
  };
}

// ─── payment mandate → x402 settlement (inert) ───────────────────────────────

/** The pure AP2 receipt — the proof-of-settlement artifact returned to the
 *  buyer + logged. `payment_ref` is the x402 settlement reference; under the
 *  dev stub it is a `dev-` value (no money moved). */
export type Ap2Receipt = {
  cart_ref: string;
  amount: number;
  currency: string;
  method: PaymentMandatePayload["payment_method"]["type"];
  payment_ref: string;
};

/**
 * Build the AP2 receipt from a PaymentMandate + the settlement reference. Pure.
 */
export function buildAp2Receipt(
  payment: PaymentMandatePayload,
  paymentRef: string,
): Ap2Receipt {
  return {
    cart_ref: payment.cart_ref,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.payment_method.type,
    payment_ref: paymentRef,
  };
}

export type SettleViaX402Input = {
  /** The AP2 PaymentMandate authorizing this settlement. */
  paymentMandate: PaymentMandatePayload;
  /** The raw `X-PAYMENT` header value the buyer retried with. */
  xPaymentHeader: string | null | undefined;
  /** The resource URL + pay-to to rebuild the x402 requirement to verify
   *  against (must match what the 402 advertised). */
  resource: string;
  payTo: string;
  network?: string;
  /** The x402 settlement verifier. DEFAULTS to the inert `devStubVerifier` —
   *  the ONLY money path, deliberately injected so prod stays money-safe until
   *  Max swaps in the real facilitator verifier. */
  verifier?: SettlementVerifier;
};

export type SettleViaX402Result =
  | { settled: true; receipt: Ap2Receipt; x402TxRef: string }
  | { settled: false; reason: string };

/**
 * Settle a PaymentMandate through the x402 rail. Parses the `X-PAYMENT` header
 * with x402's parser, rebuilds the x402 requirement for the mandate's amount,
 * and delegates to the INJECTED verifier (default `devStubVerifier`). On a
 * verified payment, returns the AP2 receipt carrying the settlement reference.
 *
 * MONEY-SAFETY: the verifier is the dev stub by default → it moves NO money and
 * returns a `dev-` reference. A rejecting OR throwing verifier yields
 * `settled:false` — the bridge NEVER serves on a failed/erroring settlement.
 */
export async function settlePaymentMandateViaX402(
  input: SettleViaX402Input,
): Promise<SettleViaX402Result> {
  const verifier = input.verifier ?? devStubVerifier;

  // Rebuild the x402 requirement the payment must satisfy — the mandate's amount
  // (cents) → the same 402 the buyer was shown.
  const requirements = buildPaymentRequired({
    amountCents: input.paymentMandate.amount,
    resource: input.resource,
    payTo: input.payTo,
    network: input.network,
  });
  const requirement = requirements.accepts[0];

  const parsed = parseXPaymentHeader(input.xPaymentHeader);
  if (!parsed.ok) {
    return { settled: false, reason: parsed.reason };
  }

  let verdict: Awaited<ReturnType<SettlementVerifier>>;
  try {
    verdict = await verifier(parsed.payment, requirement);
  } catch (err) {
    // A verifier crash is treated as "not settled" — never serve on an error.
    const detail = err instanceof Error ? err.message : String(err);
    return { settled: false, reason: `Settlement verification failed: ${detail}` };
  }
  if (!verdict.ok) {
    return { settled: false, reason: verdict.reason };
  }

  return {
    settled: true,
    receipt: buildAp2Receipt(input.paymentMandate, verdict.txRef),
    x402TxRef: verdict.txRef,
  };
}
