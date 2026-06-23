// x402 protocol — the pure builder / parser / pluggable verifier for the
// metered MCP rental rail.
//
// x402 (the "HTTP 402 Payment Required, revived" standard) lets a server demand
// a stablecoin micropayment for a request: the server replies 402 with a
// machine-readable `accepts[]` of payment requirements; the client retries with
// a base64 `X-PAYMENT` header carrying a signed payment authorization; the
// server verifies that payment (against a "facilitator") before serving. This
// module is the PURE protocol layer the rail (agent-mcp-handler) calls:
//   - buildPaymentRequired → the 402 body
//   - parseXPaymentHeader  → decode + validate the retry header (never throws)
//   - SettlementVerifier   → the pluggable verify seam (DI'd into the rail)
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY (v1): the ONLY verifier implemented here is `devStubVerifier`,
// which validates the payment's SHAPE + that its amount ≥ the required amount,
// then returns a FAKE txRef ("dev-…") WITHOUT any network/chain call. It moves
// NO money. The REAL settlement (POST the payment to the Coinbase x402
// facilitator's /verify + /settle) is a documented seam below
// (coinbaseFacilitatorVerifier) that is intentionally NOT implemented — so prod
// CANNOT move USDC until Max wires the facilitator URL + key + a USDC pay-to
// address. The rail defaults to devStubVerifier; swapping in the real verifier
// is the single, deliberate switch that turns settlement on.
// ─────────────────────────────────────────────────────────────────────────────

/** The x402 protocol version this server speaks (matches the v1 spec body). */
export const X402_VERSION = 1 as const;

/** USDC is a 6-decimal token: 1 USDC = 1_000_000 atomic "base units". */
export const USDC_DECIMALS = 6;

/**
 * USDC contract address on Base mainnet (the default x402 settlement asset).
 * Max can override the network/asset when wiring the real facilitator; this is
 * the canonical Base USDC so the 402 body is correct out of the box.
 */
export const BASE_USDC_ASSET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Default settlement network for the 402 body. */
export const DEFAULT_NETWORK = "base";

/** One settlement option in the 402 `accepts[]`. Mirrors the x402 spec fields
 *  for the `exact` scheme. */
export type PaymentRequirement = {
  /** The payment scheme. We use "exact" (pay exactly maxAmountRequired). */
  scheme: "exact";
  /** The settlement network ("base", "base-sepolia", …). */
  network: string;
  /** The required amount, in the asset's BASE UNITS, as a decimal string. */
  maxAmountRequired: string;
  /** The resource being paid for (the canonical rental endpoint URL). */
  resource: string;
  /** The address that receives the payment (a USDC pay-to address Max sets). */
  payTo: string;
  /** The settlement asset contract address (USDC). */
  asset: string;
  /** How long the client has to settle before the requirement is stale. */
  maxTimeoutSeconds: number;
  /** Human description of the charge. */
  description: string;
};

/** The full x402 `402 Payment Required` body. */
export type PaymentRequirements = {
  x402Version: typeof X402_VERSION;
  error: "payment_required";
  accepts: PaymentRequirement[];
};

/**
 * Convert whole US cents to USDC base units (6 decimals) as a DECIMAL STRING.
 *
 * USDC base units = dollars * 1e6 = cents * 1e4. We do the arithmetic in
 * integer cents with BigInt so there is no float rounding and no precision loss
 * for large amounts. Returns "0" for non-finite / non-positive input.
 *
 * Examples: 2c → "20000" ($0.02); 100c → "1000000" ($1.00).
 */
export function centsToUsdcBaseUnits(cents: number): string {
  const v = Number(cents);
  if (!Number.isFinite(v) || v <= 0) return "0";
  // Round to whole cents first (defensive against fractional-cent inputs), then
  // multiply by 1e4 to reach 6-decimal base units. BigInt keeps it exact for
  // large amounts. (BigInt(...) not a `10n` literal — the tsconfig targets
  // ES2017, which disallows BigInt literals but ships the BigInt runtime.)
  const wholeCents = Math.round(v);
  const baseUnitsPerCent = BigInt(10) ** BigInt(USDC_DECIMALS - 2); // 1e4
  return (BigInt(wholeCents) * baseUnitsPerCent).toString();
}

/**
 * Build the x402 `402 Payment Required` body for a metered rental call.
 * `amountCents` is the charge in cents (from resolveRentalCharge); it is
 * converted to USDC base units for the wire. `payTo` is the USDC address Max
 * configures; `network` defaults to Base mainnet.
 */
export function buildPaymentRequired(input: {
  amountCents: number;
  resource: string;
  payTo: string;
  network?: string;
  asset?: string;
  description?: string;
}): PaymentRequirements {
  const network = input.network ?? DEFAULT_NETWORK;
  return {
    x402Version: X402_VERSION,
    error: "payment_required",
    accepts: [
      {
        scheme: "exact",
        network,
        maxAmountRequired: centsToUsdcBaseUnits(input.amountCents),
        resource: input.resource,
        payTo: input.payTo,
        asset: input.asset ?? BASE_USDC_ASSET,
        maxTimeoutSeconds: 60,
        description: input.description ?? "Per-call payment for an MCP rental request.",
      },
    ],
  };
}

/** A decoded, shape-validated X-PAYMENT payload (the client's retry). */
export type XPayment = {
  x402Version: number;
  scheme: string;
  network: string;
  /** The scheme-specific signed payload (authorization + signature). Opaque to
   *  us — the facilitator validates the signature; we only read the amount. */
  payload: Record<string, unknown>;
};

export type ParseXPaymentResult =
  | { ok: true; payment: XPayment }
  | { ok: false; reason: string };

/**
 * Decode + validate the `X-PAYMENT` header: base64 → JSON → shape-check
 * `{ x402Version:number, scheme:string, network:string, payload:object }`.
 * NEVER throws — any malformed input returns `{ ok:false, reason }` so the rail
 * can answer 402 instead of crashing.
 */
export function parseXPaymentHeader(headerValue: string | null | undefined): ParseXPaymentResult {
  const raw = (headerValue ?? "").trim();
  if (!raw) return { ok: false, reason: "Missing X-PAYMENT header." };

  let json: unknown;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    // Guard against base64 that decodes to junk: empty / non-JSON.
    if (!decoded.trim()) return { ok: false, reason: "Empty X-PAYMENT payload." };
    json = JSON.parse(decoded);
  } catch {
    return { ok: false, reason: "X-PAYMENT is not valid base64-encoded JSON." };
  }

  if (typeof json !== "object" || json === null) {
    return { ok: false, reason: "X-PAYMENT payload is not an object." };
  }
  const obj = json as Record<string, unknown>;
  if (typeof obj.x402Version !== "number") {
    return { ok: false, reason: "X-PAYMENT missing numeric x402Version." };
  }
  if (typeof obj.scheme !== "string" || typeof obj.network !== "string") {
    return { ok: false, reason: "X-PAYMENT missing scheme/network." };
  }
  if (typeof obj.payload !== "object" || obj.payload === null) {
    return { ok: false, reason: "X-PAYMENT missing payload object." };
  }

  return {
    ok: true,
    payment: {
      x402Version: obj.x402Version,
      scheme: obj.scheme,
      network: obj.network,
      payload: obj.payload as Record<string, unknown>,
    },
  };
}

/**
 * The pluggable settlement verifier seam. Given a parsed payment + the
 * requirement it should satisfy, decide whether the payment is good and return
 * a settlement reference. The rail DI's this so prod can stay money-safe (dev
 * stub) until the real facilitator is wired.
 */
export type SettlementVerifier = (
  payment: XPayment,
  requirement: PaymentRequirement,
) => Promise<{ ok: true; txRef: string } | { ok: false; reason: string }>;

/** Best-effort read of the payment's declared amount (base units, as bigint).
 *  Different x402 client builds nest the value differently; we check the
 *  common `payload.authorization.value` slot plus a couple of fallbacks.
 *  Returns null when no amount is decodable — the stub then REJECTS (never
 *  assume a payment is sufficient). */
function readDeclaredBaseUnits(payment: XPayment): bigint | null {
  const p = payment.payload as Record<string, unknown>;
  const candidates: unknown[] = [
    (p.authorization as Record<string, unknown> | undefined)?.value,
    p.value,
    p.amount,
    p.maxAmountRequired,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && /^\d+$/.test(c)) return BigInt(c);
    if (typeof c === "number" && Number.isInteger(c) && c >= 0) return BigInt(c);
  }
  return null;
}

/**
 * DEV STUB verifier — validates the payment SHAPE + that its declared amount is
 * ≥ the required amount, then returns a CLEARLY-FAKE txRef ("dev-<nonce>").
 *
 * IT MOVES NO MONEY. There is no network call, no facilitator, no chain. It
 * exists so the rail's 402 → verify → serve flow is exercised end-to-end in
 * tests + dev WITHOUT settling anything. Prod uses this by default and stays
 * money-safe until Max swaps in coinbaseFacilitatorVerifier.
 */
export const devStubVerifier: SettlementVerifier = async (payment, requirement) => {
  if (payment.scheme !== requirement.scheme) {
    return { ok: false, reason: `Payment scheme "${payment.scheme}" does not match required "${requirement.scheme}".` };
  }
  if (payment.network !== requirement.network) {
    return { ok: false, reason: `Payment network "${payment.network}" does not match required "${requirement.network}".` };
  }
  const declared = readDeclaredBaseUnits(payment);
  if (declared === null) {
    return { ok: false, reason: "Payment carries no decodable amount." };
  }
  let required: bigint;
  try {
    required = BigInt(requirement.maxAmountRequired);
  } catch {
    return { ok: false, reason: "Requirement amount is malformed." };
  }
  if (declared < required) {
    return { ok: false, reason: `Underpayment: ${declared} < required ${required} base units.` };
  }
  // A fake, obviously-non-real settlement reference. The "dev-" prefix is the
  // tell that NO on-chain settlement occurred.
  const nonce = Math.random().toString(36).slice(2, 12);
  return { ok: true, txRef: `dev-${nonce}` };
};

// ─────────────────────────────────────────────────────────────────────────────
// TODO: coinbaseFacilitatorVerifier — THE REAL SETTLEMENT SEAM (NOT IMPLEMENTED)
//
// When Max is ready to move real USDC, implement a SettlementVerifier that POSTs
// the payment to the Coinbase x402 facilitator and ONLY returns ok on a
// confirmed settlement. Sketch:
//
//   export function coinbaseFacilitatorVerifier(opts: {
//     facilitatorUrl: string;   // process.env.X402_FACILITATOR_URL
//     apiKey: string;           // process.env.X402_FACILITATOR_KEY
//   }): SettlementVerifier {
//     return async (payment, requirement) => {
//       // 1) POST { x402Version, paymentPayload: payment, paymentRequirements:
//       //    requirement } to `${facilitatorUrl}/verify` (Authorization: apiKey).
//       // 2) If verify.isValid, POST the same to `${facilitatorUrl}/settle` to
//       //    broadcast/settle on-chain.
//       // 3) On a confirmed settlement return { ok:true, txRef: <real tx hash> };
//       //    otherwise { ok:false, reason }.
//       // NOTHING here may return ok without a real settled transaction.
//     };
//   }
//
// Wiring (Max): set X402_FACILITATOR_URL + X402_FACILITATOR_KEY + a USDC pay-to
// address (X402_PAY_TO), then inject coinbaseFacilitatorVerifier(...) as the
// rail's settlementVerifier in app/api/v1/agents/[slug]/mcp/route.ts. Until
// then the rail uses devStubVerifier and settles nothing.
// ─────────────────────────────────────────────────────────────────────────────
