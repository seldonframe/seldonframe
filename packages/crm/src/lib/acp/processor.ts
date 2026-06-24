// ACP payment PROCESSOR — the pluggable charge seam. Mirrors the x402
// pluggable-verifier idiom (lib/marketplace/x402.ts): one interface, a no-charge
// dev stub wired by default, and the real settlement left as a deliberate,
// documented seam that prod CANNOT reach without an explicit flag + creds.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY (v1) — airtight, non-negotiable:
//   • The ONLY AcpPaymentProcessor wired by default is `devStubProcessor`, which
//     returns a FAKE paymentRef ("acp_stub_<sessionId>" / "acp_free") and makes
//     ZERO external calls. It moves NO money.
//   • `resolveProcessor()` returns the dev stub UNLESS `process.env.ACP_LIVE ===
//     "true"`. In v1 the live branch `throw`s ("ACP live processor not
//     configured") — so a deploy that flips the flag fails LOUDLY instead of
//     silently charging. There is no code path in this module that calls Stripe.
//   • The real `stripeDelegatedProcessor` below is a THROW-ONLY stub with a
//     clearly-marked TODO describing what it WOULD do (create a Stripe
//     PaymentIntent from the delegated Shared Payment Token + apply the SF 5%
//     application fee to the platform account). It is intentionally NOT
//     implemented and charges nothing.
// To go live, Max implements stripeDelegatedProcessor for real, wires it into
// resolveProcessor's live branch, and sets ACP_LIVE=true + the Stripe
// delegated-payment creds. Until then: stub = zero charges.
// ─────────────────────────────────────────────────────────────────────────────

/** What the complete handler hands the processor to (maybe) charge. Amounts are
 *  integer cents. `feeCents` is the SF 5% marketplace cut (computed via
 *  computeMarketplaceFeeCents) — recorded/applied, never invented here. */
export type AcpAuthorizeInput = {
  /** The checkout session id (used as the stub ref + idempotency anchor). */
  sessionId: string;
  /** Total to charge, integer cents. ≤ 0 → free path (no charge). */
  amountCents: number;
  /** Lowercase ISO-4217 currency ("usd"). */
  currency: string;
  /** The delegated Shared Payment Token the merchant WOULD charge via Stripe.
   *  In v1 it is validated for presence by the route but never charged. */
  paymentToken: string;
  /** The agent creator's org — the destination/fee attribution for the real
   *  processor (the side the 5% accrues to). Optional. */
  sellerOrgId?: string;
  /** SF's 5% marketplace fee in cents (computed, recorded — not charged in v1). */
  feeCents: number;
};

/** The processor result: a settlement reference on success, or a structured
 *  error the complete handler maps to a 402/processing_error. */
export type AcpAuthorizeResult =
  | { ok: true; paymentRef: string }
  | { ok: false; error: { code: string; message: string } };

/** The pluggable charge seam. An impl authorizes + captures the delegated
 *  payment and returns a reference. DI'd through resolveProcessor so prod stays
 *  money-safe (dev stub) until the real Stripe processor is wired. */
export interface AcpPaymentProcessor {
  authorizeAndCapture(input: AcpAuthorizeInput): Promise<AcpAuthorizeResult>;
}

/**
 * DEV STUB processor — the only impl wired in v1. Returns a CLEARLY-FAKE
 * paymentRef and charges NOTHING. No fetch, no Stripe client, no network: it
 * resolves in-process so the create→complete flow is exercised end-to-end in
 * tests + dev WITHOUT moving a cent.
 *
 *   • amountCents ≤ 0 (free/zero path) → { ok, paymentRef: "acp_free" }.
 *   • otherwise                         → { ok, paymentRef: "acp_stub_<sessionId>" }.
 *
 * The "acp_stub_" / "acp_free" prefixes are the tell that NO real settlement
 * occurred. Never throws — a malformed input still resolves ok (the route does
 * the shape validation; the processor must never be the thing that crashes a
 * complete).
 */
export const devStubProcessor: AcpPaymentProcessor = {
  async authorizeAndCapture(input: AcpAuthorizeInput): Promise<AcpAuthorizeResult> {
    const amount = Number(input?.amountCents);
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: true, paymentRef: "acp_free" };
    }
    const sessionId = typeof input?.sessionId === "string" && input.sessionId ? input.sessionId : "unknown";
    return { ok: true, paymentRef: `acp_stub_${sessionId}` };
  },
};

/**
 * Resolve the active processor. Returns the no-charge dev stub UNLESS
 * `process.env.ACP_LIVE === "true"`. In v1 the live branch THROWS — there is no
 * real processor registered, so enabling the flag is a loud failure rather than
 * a silent charge. This is the single deliberate switch that (once
 * stripeDelegatedProcessor is implemented + wired) turns real charging on.
 */
export function resolveProcessor(): AcpPaymentProcessor {
  if (process.env.ACP_LIVE === "true") {
    // No real processor is wired in v1. Throwing here guarantees a deploy that
    // flips ACP_LIVE cannot silently charge — it must first wire a real
    // processor below. This is the money-safety backstop.
    throw new Error(
      "ACP live processor not configured. Implement stripeDelegatedProcessor and wire it here before setting ACP_LIVE=true.",
    );
  }
  return devStubProcessor;
}

// ─────────────────────────────────────────────────────────────────────────────
// TODO(Max): stripeDelegatedProcessor — THE REAL CHARGE SEAM (NOT IMPLEMENTED)
//
// When SeldonFrame is enrolled in Stripe's agentic-commerce (delegated payments)
// program AND the OpenAI Instant-Checkout merchant program, implement an
// AcpPaymentProcessor that charges the delegated Shared Payment Token via the
// merchant's own Stripe, applying the SF 5% as an application fee. Sketch:
//
//   export const stripeDelegatedProcessor: AcpPaymentProcessor = {
//     async authorizeAndCapture({ amountCents, currency, paymentToken,
//                                 sellerOrgId, feeCents }) {
//       // 1) Resolve the seller's Stripe Connect account from sellerOrgId
//       //    (reuse the connected-account lookup in
//       //    lib/payments/providers/stripe.ts — but DO NOT call its charge
//       //    methods here; this is a distinct PaymentIntent flow).
//       // 2) stripe.paymentIntents.create({
//       //      amount: amountCents, currency,
//       //      confirm: true,
//       //      payment_method: <derived from the delegated Shared Payment Token>,
//       //      application_fee_amount: feeCents,   // SF's recorded 5% cut
//       //    }, { stripeAccount: <seller connected acct> })
//       // 3) On a confirmed/captured intent → { ok:true, paymentRef: pi.id };
//       //    otherwise { ok:false, error:{ code, message } }.
//       // NOTHING here may return ok without a real captured charge.
//     },
//   };
//
// Wiring (Max): implement the above, change resolveProcessor's live branch to
// `return stripeDelegatedProcessor;`, then set ACP_LIVE=true + the Stripe
// delegated-payment creds. Until all three happen, resolveProcessor throws on
// ACP_LIVE and the rail charges nothing.
// ─────────────────────────────────────────────────────────────────────────────
