// ACP (Agentic Commerce Protocol) — the wire TYPES for OpenAI Instant Checkout.
//
// ACP is how SeldonFrame's paid marketplace offerings get bought INSIDE ChatGPT,
// card-based. Two protocol surfaces: a product FEED (a catalog ChatGPT ingests)
// and an agentic CHECKOUT (REST endpoints ChatGPT calls: create → update →
// complete a checkout session, with delegated payment). This file is the shared
// type vocabulary for both; the pure math/validation lives in checkout.ts and
// the feed shapes in feed.ts.
//
// AMOUNTS: every money field is an INTEGER number of minor currency units
// (cents). Never a float, never a dollar string. `currency` is a lowercase
// ISO-4217 code ("usd"). `item.id` is a marketplace agent SLUG — the feed uses
// the slug as the product id, and checkout resolves it back to a listing.
//
// MONEY-SAFETY: these are just shapes. No charge happens at this layer. The only
// payment processor wired anywhere in ACP v1 is a no-charge dev stub
// (lib/acp/processor.ts) — see that file + the plan for the airtight rationale.

/** A checkout session's lifecycle state (mirrors the ACP spec literals). */
export type CheckoutSessionStatus =
  | "not_ready_for_payment"
  | "ready_for_payment"
  | "completed"
  | "canceled";

/** The buyer block ChatGPT may attach. All optional — a session can be created
 *  before the buyer is known and filled in on update/complete. */
export type AcpBuyer = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
};

/** What the buyer asked for: a product id (a marketplace agent slug) + a count.
 *  This is the INPUT shape on create/update bodies (`items[]`). */
export type AcpItemInput = {
  id: string;
  quantity: number;
};

/** A resolved line in the session. `item` echoes the requested id+quantity;
 *  `base_amount` is the per-unit price (cents); `subtotal` = base × quantity;
 *  `tax` is 0 in v1; `total` = subtotal + tax. */
export type AcpLineItem = {
  /** Stable line id derived from the slug (not random — see checkout.ts). */
  id: string;
  item: AcpItemInput;
  base_amount: number;
  subtotal: number;
  tax: number;
  total: number;
};

/** A single row in the session `totals[]` ledger. `type` is the row kind,
 *  `display_text` a human label, `amount` the integer-cents value. */
export type AcpTotalType = "subtotal" | "tax" | "total";
export type AcpTotal = {
  type: AcpTotalType;
  display_text: string;
  amount: number;
};

/** Which processor the merchant will charge through + the methods it accepts.
 *  v1 advertises Stripe + card (the delegated-payment shape) — but the actual
 *  charge is stubbed (no money). */
export type AcpPaymentProvider = {
  provider: "stripe";
  supported_payment_methods: ["card"];
};

/** An info/error message surfaced to the buyer agent (e.g. "item unavailable"). */
export type AcpMessageType = "info" | "error";
export type AcpMessage = {
  type: AcpMessageType;
  text: string;
};

/** The order stamped onto a session once it completes. `id` is derived from the
 *  session id (deterministic — see buildOrder); `permalink_url` points at the
 *  marketplace listing page for the purchased agent. */
export type AcpOrder = {
  id: string;
  checkout_session_id: string;
  permalink_url: string;
};

/** The full CheckoutSession wire object returned by every ACP checkout endpoint. */
export type CheckoutSession = {
  id: string;
  status: CheckoutSessionStatus;
  currency: string;
  line_items: AcpLineItem[];
  totals: AcpTotal[];
  buyer?: AcpBuyer;
  payment_provider: AcpPaymentProvider;
  messages: AcpMessage[];
  order?: AcpOrder;
};

/** The delegated-payment block on the complete body. `token` is the Shared
 *  Payment Token the merchant would charge via its own Stripe (NOT charged in
 *  v1 — the processor is a no-charge stub). */
export type AcpPaymentData = {
  token: string;
  provider: "stripe";
};

/** A structured ACP error (returned with the matching HTTP status). */
export type AcpErrorType = "invalid_request" | "processing_error";
export type AcpError = {
  type: AcpErrorType;
  code: string;
  message: string;
  /** The offending field, when the error is about one specific input. */
  param?: string;
};

/** The validated create-body shape (after validateCreateBody). */
export type AcpCreateBody = {
  items: AcpItemInput[];
  buyer?: AcpBuyer;
};

/** The validated update-body shape (after validateUpdateBody). Both fields are
 *  optional — an update may touch items, buyer, or both. */
export type AcpUpdateBody = {
  items?: AcpItemInput[];
  buyer?: AcpBuyer;
};

/** The validated complete-body shape (after validateCompleteBody). */
export type AcpCompleteBody = {
  buyer?: AcpBuyer;
  payment_data: AcpPaymentData;
};

/** A discriminated validation result — `ok:true` carries the parsed value,
 *  `ok:false` carries a structured AcpError the route maps to an HTTP status. */
export type AcpValidation<T> =
  | { ok: true; value: T }
  | { ok: false; error: AcpError };

/** The minimal product shape the checkout math needs to build a line item.
 *  Resolved by the route from a marketplace listing (slug → name → priceCents). */
export type AcpProduct = {
  slug: string;
  name: string;
  priceCents: number;
};
