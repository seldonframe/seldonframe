// AP2 checkout handler — the DI'd two-step core behind /api/ap2/checkout.
//
// Lifted out of the route (mirrors lib/marketplace/agent-mcp-handler) so all the
// branching is unit-tested with fakes — no DB, no env, no x402 facilitator. The
// route binds the REAL deps (the AP2 signing secret, the published-listing
// resolver, the analytics logger, the inert x402 verifier) and maps the
// returned { status, body } onto NextResponse.
//
// STATELESSNESS: like the rental-key rail, there is NO server-side cart store.
// The buyer presents the SIGNED cart_mandate on BOTH steps; the handler
// re-verifies its signature each time and checks the payment_mandate against it.
// Trust comes from the HMAC signatures + the x402 settlement, not session state.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY: settlement is delegated to the INJECTED x402 verifier (default
// the inert devStubVerifier via the bridge) → NO money moves. The only thing the
// handler does on a settled payment is LOG an `ap2_settlement` event carrying
// amount_cents + fee_cents (computeMarketplaceFeeCents) attributed to the seller
// org — the exact accrual shape the x402 metered-rental rail uses, which the
// seller-earnings dashboard reads. AP2 adds no new money path.
// ─────────────────────────────────────────────────────────────────────────────

import {
  devStubVerifier as devStubMandateVerifier,
  verifyIntentConstraints,
  verifyCartMatchesPayment,
  type MandateVerifier,
  type IntentMandate,
  type CartMandate,
  type PaymentMandate,
} from "./mandates";
import {
  cartMandateToX402Requirements,
  settlePaymentMandateViaX402,
} from "./bridge";
import { computeMarketplaceFeeCents } from "../billing/gmv";
import type { SettlementVerifier } from "../marketplace/x402";

/** A published marketplace listing a cart item resolves to (the route fetches
 *  this from the DB; the seller org is who the settlement is attributed to). */
export type ResolvedListing = {
  slug: string;
  listingId: string;
  name: string;
  priceCents: number;
  /** The org that listed this agent — the seller the fee accrues to. */
  creatorOrgId: string;
};

/** The `ap2_settlement` accrual entry the handler emits on a settled payment.
 *  The route's logger maps this onto `seldonframe_events` (attributed to the
 *  seller org), exactly as the x402 rail logs `agent_rental_call`. */
export type Ap2SettlementLog = {
  cartRef: string;
  amountCents: number;
  feeCents: number;
  paymentRef: string;
  method: string;
  sellerOrgId: string;
  listingId: string;
};

export type Ap2CheckoutDeps = {
  /** Resolve the AP2 signing secret (throws if unconfigured → 500). */
  getSecret: () => string;
  /** Current time (injected for deterministic mandate expiry checks). */
  now: () => Date;
  /** Resolve a cart item's listing_slug to a real PUBLISHED listing (null =
   *  not found → 404). */
  resolveListing: (slug: string) => Promise<ResolvedListing | null>;
  /** The canonical resource URL the x402 402 advertises (this endpoint). */
  resource: string;
  /** The USDC pay-to address for the 402 body (Max's setup). */
  payTo: string;
  /** Fire-and-forget settlement logger (the seller-earnings accrual hook). */
  logSettlement: (entry: Ap2SettlementLog) => void;
  /** The mandate verifier (default: the real HMAC+expiry devStubVerifier). */
  mandateVerifier?: MandateVerifier;
  /** The x402 settlement verifier (default in the bridge: the inert
   *  devStubVerifier → NO money). Injected so tests can assert delegation and so
   *  Max can later swap in coinbaseFacilitatorVerifier. */
  settlementVerifier?: SettlementVerifier;
};

export type Ap2Outcome = {
  status: number;
  body: Record<string, unknown>;
};

/** The AP2 request envelope (both steps). The buyer re-presents the signed
 *  cart_mandate on step 2 alongside the payment_mandate (stateless). */
export type Ap2CheckoutBody = {
  cart_mandate?: CartMandate;
  intent_mandate?: IntentMandate;
  payment_mandate?: PaymentMandate;
};

function err(status: number, error: string, reason: string): Ap2Outcome {
  return { status, body: { error, reason } };
}

/**
 * Handle one AP2 checkout request. Dispatches on shape:
 *   • { payment_mandate } present → STEP 2 (pay): verify payment ↔ cart, settle
 *     via the inert x402 verifier, log accrual, return receipt.
 *   • else { cart_mandate } present → STEP 1 (present cart): verify + resolve
 *     listings + intent constraints, return 402 with x402 requirements.
 *   • neither → 400.
 *
 * `xPaymentHeader` is the buyer's `X-PAYMENT` retry header (step 2 only).
 */
export async function handleAp2Checkout(
  body: Ap2CheckoutBody,
  xPaymentHeader: string | null | undefined,
  deps: Ap2CheckoutDeps,
): Promise<Ap2Outcome> {
  // Resolve the signing secret once. A misconfigured deploy → clean 500.
  let secret: string;
  try {
    secret = deps.getSecret();
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error(`[ap2] secret_unavailable: ${detail}`);
    return err(500, "server_error", "AP2 signing is temporarily unavailable.");
  }

  const verifier = deps.mandateVerifier ?? devStubMandateVerifier;
  const now = deps.now();

  // ── STEP 2: pay ────────────────────────────────────────────────────────────
  if (body.payment_mandate) {
    // Stateless: the cart must be re-presented so we can check the payment
    // against it without server-side cart storage.
    if (!body.cart_mandate) {
      return err(400, "bad_request", "A payment_mandate must be accompanied by its cart_mandate.");
    }
    const cart = body.cart_mandate;
    const payment = body.payment_mandate;

    // Both mandates must be authentic + fresh.
    const cartVerdict = verifier.verify(cart, { secret, now });
    if (cartVerdict.kind !== "valid") {
      return verdictToError(cartVerdict, "cart_mandate");
    }
    const payVerdict = verifier.verify(payment, { secret, now });
    if (payVerdict.kind !== "valid") {
      return verdictToError(payVerdict, "payment_mandate");
    }

    // The payment must match the cart it claims to settle.
    const match = verifyCartMatchesPayment(cart, payment);
    if (match.kind !== "valid") {
      return err(422, "constraint_violation", match.reason ?? "Payment does not match cart.");
    }

    // Resolve the seller org (the listing the cart's first item buys) for
    // attribution. The cart already passed step-1 resolution conceptually, but
    // we re-resolve here so the seller attribution is authoritative + the item
    // is still published at settlement time.
    const firstItem = cart.items[0];
    if (!firstItem) {
      return err(422, "constraint_violation", "Cart has no items.");
    }
    const listing = await deps.resolveListing(firstItem.listing_slug);
    if (!listing) {
      return err(404, "not_found", `Cart item "${firstItem.listing_slug}" is not a published listing.`);
    }

    // Settle through x402 — INERT by default (devStubVerifier moves no money).
    const settlement = await settlePaymentMandateViaX402({
      paymentMandate: payment,
      xPaymentHeader,
      resource: deps.resource,
      payTo: deps.payTo,
      verifier: deps.settlementVerifier, // undefined → bridge default = dev stub
    });
    if (!settlement.settled) {
      // Payment not (yet) settled → the 402 stands, carrying fresh requirements.
      const { requirements, ap2 } = cartMandateToX402Requirements(cart, {
        resource: deps.resource,
        payTo: deps.payTo,
      });
      return {
        status: 402,
        body: { ...requirements, ap2, reason: settlement.reason },
      };
    }

    // Settled → accrue. fee_cents is the 5% marketplace cut on the cart total
    // (computeMarketplaceFeeCents), attributed to the SELLER org — the same
    // accrual the seller-earnings dashboard already reads for x402 rentals.
    const feeCents = computeMarketplaceFeeCents(settlement.receipt.amount);
    deps.logSettlement({
      cartRef: settlement.receipt.cart_ref,
      amountCents: settlement.receipt.amount,
      feeCents,
      paymentRef: settlement.receipt.payment_ref,
      method: settlement.receipt.method,
      sellerOrgId: listing.creatorOrgId,
      listingId: listing.listingId,
    });

    return {
      status: 200,
      body: {
        settled: true,
        receipt: { ...settlement.receipt, fee_cents: feeCents },
      },
    };
  }

  // ── STEP 1: present cart ─────────────────────────────────────────────────────
  if (body.cart_mandate) {
    const cart = body.cart_mandate;

    // Cart mandate must be authentic + fresh.
    const cartVerdict = verifier.verify(cart, { secret, now });
    if (cartVerdict.kind !== "valid") {
      return verdictToError(cartVerdict, "cart_mandate");
    }

    // If an intent mandate is supplied, it must be authentic AND the cart must
    // fall within its constraints (cap / currency / merchant / not expired).
    if (body.intent_mandate) {
      const intent = body.intent_mandate;
      const intentVerdict = verifier.verify(intent, { secret, now });
      if (intentVerdict.kind !== "valid") {
        return verdictToError(intentVerdict, "intent_mandate");
      }
      const constraints = verifyIntentConstraints(intent, cart, now);
      if (constraints.kind !== "valid") {
        const status = constraints.kind === "expired" ? 401 : 422;
        return err(status, constraints.kind, constraints.reason ?? "Cart violates the intent mandate.");
      }
    }

    // Every cart item must resolve to a REAL published listing.
    if (cart.items.length === 0) {
      return err(422, "constraint_violation", "Cart has no items.");
    }
    for (const item of cart.items) {
      const listing = await deps.resolveListing(item.listing_slug);
      if (!listing) {
        return err(404, "not_found", `Cart item "${item.listing_slug}" is not a published listing.`);
      }
    }

    // All good → 402 with the x402 payment-requirements + the AP2 challenge.
    const { requirements, ap2 } = cartMandateToX402Requirements(cart, {
      resource: deps.resource,
      payTo: deps.payTo,
    });
    return { status: 402, body: { ...requirements, ap2 } };
  }

  // Neither step's required mandate present.
  return err(400, "bad_request", "Provide a cart_mandate (step 1) or a payment_mandate + cart_mandate (step 2).");
}

/** Map a non-valid MandateVerdict to an AP2-shaped error outcome. An expired
 *  mandate is a 401 (re-issue); a tampered/invalid one is a 401; a constraint
 *  violation is a 422. */
function verdictToError(
  verdict: { kind: "invalid" | "expired" | "constraint_violation"; reason: string },
  which: string,
): Ap2Outcome {
  if (verdict.kind === "constraint_violation") {
    return err(422, "constraint_violation", `${which}: ${verdict.reason}`);
  }
  // invalid OR expired → 401 (the credential is not acceptable as presented).
  return err(401, verdict.kind, `${which}: ${verdict.reason}`);
}
