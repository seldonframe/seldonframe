// ACP checkout-session math + validation — the PURE layer (no I/O).
//
// Everything here is a pure function: given the same input it returns the same
// output, with NO Date.now, NO Math.random, NO db. Line/order ids are DERIVED
// from the session id + slug (a short deterministic hash) so a session is fully
// reproducible and tests need no clock injection. The route layer (Task 5) wires
// these over the listing query + store + the no-charge processor.
//
// Tax is 0 in v1 (the `tax` field + the totals[] "tax" row both stay 0). Amounts
// are integer cents throughout.

import { createHash } from "node:crypto";
import type {
  AcpBuyer,
  AcpCompleteBody,
  AcpCreateBody,
  AcpError,
  AcpItemInput,
  AcpLineItem,
  AcpOrder,
  AcpProduct,
  AcpTotal,
  AcpUpdateBody,
  AcpValidation,
  CheckoutSession,
  CheckoutSessionStatus,
} from "./types";

/** The marketplace base the order permalink points at. */
const MARKETPLACE_BASE = "https://app.seldonframe.com/marketplace";

/** The computed totals bundle: the three scalar sums + the wire `totals[]`. */
export type ComputedTotals = {
  subtotal: number;
  tax: number;
  total: number;
  totals: AcpTotal[];
};

/** The server-internal session (what the store persists). The wire object is
 *  derived from this via toCheckoutSessionResponse — the internal form keeps the
 *  totals bundle + line items in a convenient shape. */
export type InternalSession = {
  id: string;
  status: CheckoutSessionStatus;
  currency: string;
  lineItems: AcpLineItem[];
  totals: ComputedTotals;
  buyer?: AcpBuyer;
  messages: CheckoutSession["messages"];
  order?: AcpOrder;
};

/** Short, stable hex digest of a string — the deterministic id seed. */
function shortHash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 12);
}

/** Coerce a quantity to a positive integer, clamping bad values up to 1. */
function normalizeQuantity(quantity: unknown): number {
  const n = Number(quantity);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return 1;
  return n;
}

/**
 * Build one ACP line item from a resolved product + a requested quantity.
 * base_amount = per-unit cents; subtotal = base × quantity; tax = 0 (v1);
 * total = subtotal. The line id is derived from the slug (stable, not random)
 * so the same product always yields the same line id within a session.
 */
export function buildLineItem(product: AcpProduct, quantity: number): AcpLineItem {
  const qty = normalizeQuantity(quantity);
  const base = Number.isFinite(product.priceCents) && product.priceCents > 0 ? Math.round(product.priceCents) : 0;
  const subtotal = base * qty;
  return {
    id: `li_${shortHash(product.slug)}_${product.slug}`,
    item: { id: product.slug, quantity: qty },
    base_amount: base,
    subtotal,
    tax: 0,
    total: subtotal,
  };
}

/**
 * Sum line items into subtotal / tax(0) / total + the wire `totals[]` ledger.
 * The ledger always carries exactly three rows (subtotal, tax, total) so the
 * client can render a consistent receipt.
 */
export function computeTotals(lineItems: AcpLineItem[]): ComputedTotals {
  const subtotal = lineItems.reduce((sum, li) => sum + (Number.isFinite(li.subtotal) ? li.subtotal : 0), 0);
  const tax = 0;
  const total = subtotal + tax;
  const totals: AcpTotal[] = [
    { type: "subtotal", display_text: "Subtotal", amount: subtotal },
    { type: "tax", display_text: "Tax", amount: tax },
    { type: "total", display_text: "Total", amount: total },
  ];
  return { subtotal, tax, total, totals };
}

/**
 * Decide a session's status from its line items. Terminal states
 * (completed/canceled) are preserved — they never regress to ready. Otherwise:
 * ≥1 line item with resolved (finite) amounts → ready_for_payment; else
 * not_ready_for_payment. A 0-total line still counts as resolved (an
 * install-via-ACP edge), so it is ready.
 */
export function resolveStatus(session: InternalSession): CheckoutSessionStatus {
  if (session.status === "completed" || session.status === "canceled") {
    return session.status;
  }
  const hasResolvedItems =
    session.lineItems.length > 0 &&
    session.lineItems.every((li) => Number.isFinite(li.total) && Number.isFinite(li.base_amount));
  return hasResolvedItems ? "ready_for_payment" : "not_ready_for_payment";
}

/**
 * Attach a buyer block to a session immutably. An undefined buyer is a no-op
 * (keeps any existing buyer). Never mutates the input session.
 */
export function applyBuyer(session: InternalSession, buyer: AcpBuyer | undefined): InternalSession {
  if (!buyer) return session;
  return { ...session, buyer: { ...buyer } };
}

/** Type guard: a plain object (not null, not an array). */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalid(code: string, message: string, param?: string): { ok: false; error: AcpError } {
  return { ok: false, error: { type: "invalid_request", code, message, ...(param ? { param } : {}) } };
}

/** Parse + normalize an items[] array (shared by create + update). Each item
 *  must be an object with a non-empty string id and a positive-integer quantity
 *  (missing quantity defaults to 1). Returns the normalized items or an error. */
function parseItems(raw: unknown): AcpValidation<AcpItemInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return invalid("missing_items", "At least one item is required.", "items");
  }
  const items: AcpItemInput[] = [];
  for (const entry of raw) {
    if (!isObject(entry) || typeof entry.id !== "string" || entry.id.trim() === "") {
      return invalid("invalid_item", "Each item needs a non-empty string id.", "items");
    }
    if (entry.quantity !== undefined) {
      const q = Number(entry.quantity);
      if (!Number.isFinite(q) || !Number.isInteger(q) || q < 1) {
        return invalid("invalid_quantity", "Item quantity must be a positive integer.", "items");
      }
    }
    items.push({ id: entry.id.trim(), quantity: normalizeQuantity(entry.quantity ?? 1) });
  }
  return { ok: true, value: items };
}

/** Parse an optional buyer block (lenient: only known string fields survive). */
function parseBuyer(raw: unknown): AcpBuyer | undefined {
  if (!isObject(raw)) return undefined;
  const buyer: AcpBuyer = {};
  if (typeof raw.first_name === "string") buyer.first_name = raw.first_name;
  if (typeof raw.last_name === "string") buyer.last_name = raw.last_name;
  if (typeof raw.email === "string") buyer.email = raw.email;
  if (typeof raw.phone_number === "string") buyer.phone_number = raw.phone_number;
  return Object.keys(buyer).length > 0 ? buyer : undefined;
}

/**
 * Validate the create body: `{ items:[{id,quantity?}], buyer? }`. items is
 * required + non-empty; each item needs an id + positive-integer quantity
 * (defaulting to 1). Returns the normalized AcpCreateBody or a structured error.
 */
export function validateCreateBody(body: unknown): AcpValidation<AcpCreateBody> {
  if (!isObject(body)) return invalid("invalid_body", "Request body must be a JSON object.");
  const items = parseItems(body.items);
  if (!items.ok) return items;
  return { ok: true, value: { items: items.value, buyer: parseBuyer(body.buyer) } };
}

/**
 * Validate the update body: `{ items?, buyer? }` — both optional. An empty body
 * is a valid no-op. A PRESENT items array must still be well-formed (non-empty,
 * valid ids/quantities).
 */
export function validateUpdateBody(body: unknown): AcpValidation<AcpUpdateBody> {
  if (!isObject(body)) return invalid("invalid_body", "Request body must be a JSON object.");
  const value: AcpUpdateBody = {};
  if (body.items !== undefined) {
    const items = parseItems(body.items);
    if (!items.ok) return items;
    value.items = items.value;
  }
  const buyer = parseBuyer(body.buyer);
  if (buyer) value.buyer = buyer;
  return { ok: true, value };
}

/**
 * Validate the complete body: `{ buyer?, payment_data:{ token, provider } }`.
 * payment_data + a non-empty token are required (the delegated Shared Payment
 * Token). NOTE: the token is NOT charged in v1 — the processor is a no-charge
 * stub. This only checks the SHAPE so the wire contract is honored.
 */
export function validateCompleteBody(body: unknown): AcpValidation<AcpCompleteBody> {
  if (!isObject(body)) return invalid("invalid_body", "Request body must be a JSON object.");
  const pd = body.payment_data;
  if (!isObject(pd)) {
    return invalid("missing_payment_data", "payment_data is required to complete a checkout.", "payment_data");
  }
  if (typeof pd.token !== "string" || pd.token.trim() === "") {
    return invalid("missing_payment_token", "A payment token is required.", "payment_data.token");
  }
  return {
    ok: true,
    value: {
      buyer: parseBuyer(body.buyer),
      payment_data: { token: pd.token.trim(), provider: "stripe" },
    },
  };
}

/**
 * Build the order stamped onto a completed session. The order id is DERIVED
 * from the session id (a short hash) — deterministic, no random — so completing
 * the same session is idempotent and the id is reproducible in tests. The
 * permalink points at the purchased agent's marketplace listing page.
 */
export function buildOrder(input: { sessionId: string; slug: string }): AcpOrder {
  return {
    id: `order_${shortHash(input.sessionId)}`,
    checkout_session_id: input.sessionId,
    permalink_url: `${MARKETPLACE_BASE}/${input.slug}`,
  };
}

/**
 * Project the server-internal session onto the ACP wire CheckoutSession the
 * endpoints return. The payment_provider is fixed (stripe + card — the
 * delegated-payment advertisement; the charge itself is stubbed). The buyer +
 * order are included only when present.
 */
export function toCheckoutSessionResponse(internal: InternalSession): CheckoutSession {
  return {
    id: internal.id,
    status: internal.status,
    currency: internal.currency,
    line_items: internal.lineItems,
    totals: internal.totals.totals,
    payment_provider: { provider: "stripe", supported_payment_methods: ["card"] },
    messages: internal.messages,
    ...(internal.buyer ? { buyer: internal.buyer } : {}),
    ...(internal.order ? { order: internal.order } : {}),
  };
}
