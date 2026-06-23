// ACP checkout HANDLERS — the DI'd logic the routes call. Each handler returns
// a plain `{ status, body }` so it unit-tests with fakes (in-memory store, stub
// listing resolver, the no-charge processor, a spy logEvent) — no Next.js, no
// Postgres, no money. The thin routes (app/api/acp/checkout_sessions/...) bind
// the REAL deps and map the outcome onto NextResponse.
//
// FLOW: create → (get / update) → complete → cancel.
//   • create   — validate body, resolve each slug → published + checkout-enabled
//                listing, build line items + totals + recorded feeCents (5% via
//                computeMarketplaceFeeCents) + sellerOrgId, persist (honoring
//                Idempotency-Key), return 201.
//   • complete — must be ready_for_payment; run resolveProcessor()/the DI'd
//                processor (a NO-CHARGE stub in v1) → on ok stamp the order +
//                status:completed + log acp_order_completed (so seller earnings
//                can attribute it, like the rental rail). NO real charge.
//
// MONEY-SAFETY: this module never imports a Stripe client and never charges. The
// only payment effect is whatever the injected `processor` does — which in
// production is the no-charge dev stub (resolveProcessor()).

import {
  buildLineItem,
  buildOrder,
  computeTotals,
  resolveStatus,
  applyBuyer,
  toCheckoutSessionResponse,
  validateCompleteBody,
  validateCreateBody,
  validateUpdateBody,
  type ComputedTotals,
  type InternalSession,
} from "./checkout";
import type { AcpPaymentProcessor } from "./processor";
import { computeMarketplaceFeeCents } from "@/lib/billing/gmv";
import type {
  AcpBuyer,
  AcpError,
  AcpItemInput,
  AcpLineItem,
  AcpOrder,
  CheckoutSession,
  CheckoutSessionStatus,
} from "./types";

/** What a resolved marketplace listing must give the handler. */
export type AcpResolvedListing = {
  slug: string;
  name: string;
  priceCents: number;
  niche: string;
  /** The agent creator's org — fee attribution + future charge destination. */
  sellerOrgId: string;
  isPublished: boolean;
  /** Whether ACP may transact it (paid agent). Free agents install via the App. */
  enableCheckout: boolean;
};

/** The persisted session shape (decoupled from the drizzle row so the store dep
 *  can be faked). Mirrors acp_checkout_sessions columns. */
export type AcpStoredSession = {
  id: string;
  status: CheckoutSessionStatus;
  currency: string;
  requested: AcpItemInput[];
  lineItems: AcpLineItem[];
  totals: ComputedTotals;
  buyer?: AcpBuyer | null;
  order?: AcpOrder | null;
  sellerOrgId?: string | null;
  listingSlug?: string | null;
  feeCents: number;
  idempotencyKey?: string | null;
};

/** The DI'd store seam (the real impl wraps lib/acp/store). */
export type AcpStoreDep = {
  create(session: AcpStoredSession): Promise<AcpStoredSession>;
  get(id: string): Promise<AcpStoredSession | null>;
  update(id: string, patch: Partial<AcpStoredSession>): Promise<AcpStoredSession | null>;
  findByIdempotencyKey(key: string | null | undefined): Promise<AcpStoredSession | null>;
};

/** Fire-and-forget event logger (the real impl is trackEvent). */
export type AcpLogEvent = (
  event: string,
  properties: Record<string, unknown>,
  ctx?: { orgId?: string | null },
) => void;

export type AcpHandlerDeps = {
  /** Resolve a marketplace agent slug → listing (or null if unknown). */
  resolveListing: (slug: string) => Promise<AcpResolvedListing | null>;
  store: AcpStoreDep;
  /** The payment processor (the no-charge dev stub in production). */
  processor: AcpPaymentProcessor;
  logEvent: AcpLogEvent;
  /** New session id generator (e.g. "acp_sess_<rand>"). */
  newId: () => string;
  now: () => Date;
};

/** The plain outcome the routes map onto NextResponse. body is the ACP wire
 *  object (CheckoutSession) or a structured AcpError. */
export type AcpOutcome = { status: number; body: CheckoutSession | AcpError };

function errorOutcome(status: number, error: AcpError): AcpOutcome {
  return { status, body: error };
}

function notFound(): AcpOutcome {
  return errorOutcome(404, {
    type: "invalid_request",
    code: "session_not_found",
    message: "Checkout session not found.",
  });
}

/** Rebuild the in-memory InternalSession (what the pure layer + wire shaper
 *  consume) from a stored row. */
function toInternal(stored: AcpStoredSession): InternalSession {
  return {
    id: stored.id,
    status: stored.status,
    currency: stored.currency,
    lineItems: stored.lineItems,
    totals: stored.totals,
    messages: [],
    ...(stored.buyer ? { buyer: stored.buyer } : {}),
    ...(stored.order ? { order: stored.order } : {}),
  };
}

/** Resolve a set of requested items → priced line items, or a structured error
 *  (unknown / unpublished / free-not-checkout-enabled). Also returns the seller
 *  org + slug to attribute the (recorded) fee + order to. v1 supports a single
 *  agent purchase; the first item drives the seller/slug attribution. */
async function resolveLineItems(
  items: AcpItemInput[],
  deps: AcpHandlerDeps,
): Promise<
  | { ok: true; lineItems: AcpLineItem[]; sellerOrgId: string; listingSlug: string }
  | { ok: false; error: AcpError }
> {
  const lineItems: AcpLineItem[] = [];
  let sellerOrgId = "";
  let listingSlug = "";
  for (const item of items) {
    const listing = await deps.resolveListing(item.id);
    if (!listing || !listing.isPublished) {
      return {
        ok: false,
        error: {
          type: "invalid_request",
          code: "item_unavailable",
          message: `Unknown or unavailable item "${item.id}".`,
          param: "items",
        },
      };
    }
    if (!listing.enableCheckout) {
      return {
        ok: false,
        error: {
          type: "invalid_request",
          code: "item_not_purchasable",
          message: `"${listing.name}" is a free agent — install it via the ChatGPT App, not checkout.`,
          param: "items",
        },
      };
    }
    lineItems.push(buildLineItem({ slug: listing.slug, name: listing.name, priceCents: listing.priceCents }, item.quantity));
    if (!sellerOrgId) {
      sellerOrgId = listing.sellerOrgId;
      listingSlug = listing.slug;
    }
  }
  return { ok: true, lineItems, sellerOrgId, listingSlug };
}

/** Wire-shape a stored session (with optional override messages). */
function wire(stored: AcpStoredSession): CheckoutSession {
  return toCheckoutSessionResponse(toInternal(stored));
}

// ─── create ──────────────────────────────────────────────────────────────────

/**
 * POST /api/acp/checkout_sessions — create a session. Honors Idempotency-Key:
 * a repeat with the same key returns the already-created session unchanged.
 */
export async function handleCreate(
  body: unknown,
  idempotencyKey: string | null,
  deps: AcpHandlerDeps,
): Promise<AcpOutcome> {
  // Idempotency: a prior session under this key wins (dedupe create).
  if (idempotencyKey) {
    const existing = await deps.store.findByIdempotencyKey(idempotencyKey);
    if (existing) return { status: 201, body: wire(existing) };
  }

  const parsed = validateCreateBody(body);
  if (!parsed.ok) return errorOutcome(400, parsed.error);

  const resolved = await resolveLineItems(parsed.value.items, deps);
  if (!resolved.ok) return errorOutcome(400, resolved.error);

  const totals = computeTotals(resolved.lineItems);
  const feeCents = computeMarketplaceFeeCents(totals.total);

  const id = deps.newId();
  const internal: InternalSession = {
    id,
    status: "not_ready_for_payment",
    currency: "usd",
    lineItems: resolved.lineItems,
    totals,
    messages: [],
    ...(parsed.value.buyer ? { buyer: parsed.value.buyer } : {}),
  };
  const status = resolveStatus(internal);

  const stored: AcpStoredSession = {
    id,
    status,
    currency: "usd",
    requested: parsed.value.items,
    lineItems: resolved.lineItems,
    totals,
    buyer: parsed.value.buyer ?? null,
    order: null,
    sellerOrgId: resolved.sellerOrgId || null,
    listingSlug: resolved.listingSlug || null,
    feeCents,
    idempotencyKey: idempotencyKey ?? null,
  };
  const saved = await deps.store.create(stored);
  return { status: 201, body: wire(saved) };
}

// ─── get ─────────────────────────────────────────────────────────────────────

export async function handleGet(id: string, deps: AcpHandlerDeps): Promise<AcpOutcome> {
  const stored = await deps.store.get(id);
  if (!stored) return notFound();
  return { status: 200, body: wire(stored) };
}

// ─── update ──────────────────────────────────────────────────────────────────

/**
 * POST /api/acp/checkout_sessions/{id} — update items and/or buyer. Re-resolves
 * items + recomputes totals/fee when items change; applies buyer when present.
 * A completed/canceled session is terminal (resolveStatus preserves it).
 */
export async function handleUpdate(id: string, body: unknown, deps: AcpHandlerDeps): Promise<AcpOutcome> {
  const stored = await deps.store.get(id);
  if (!stored) return notFound();

  const parsed = validateUpdateBody(body);
  if (!parsed.ok) return errorOutcome(400, parsed.error);

  const patch: Partial<AcpStoredSession> = {};

  if (parsed.value.items) {
    const resolved = await resolveLineItems(parsed.value.items, deps);
    if (!resolved.ok) return errorOutcome(400, resolved.error);
    const totals = computeTotals(resolved.lineItems);
    patch.requested = parsed.value.items;
    patch.lineItems = resolved.lineItems;
    patch.totals = totals;
    patch.feeCents = computeMarketplaceFeeCents(totals.total);
    patch.sellerOrgId = resolved.sellerOrgId || null;
    patch.listingSlug = resolved.listingSlug || null;
  }

  if (parsed.value.buyer) {
    const next = applyBuyer(toInternal(stored), parsed.value.buyer);
    patch.buyer = next.buyer ?? null;
  }

  // Recompute status off the merged line items.
  const merged: AcpStoredSession = { ...stored, ...patch };
  patch.status = resolveStatus(toInternal(merged));

  const saved = await deps.store.update(id, patch);
  if (!saved) return notFound();
  return { status: 200, body: wire(saved) };
}

// ─── complete ────────────────────────────────────────────────────────────────

/**
 * POST /api/acp/checkout_sessions/{id}/complete — run the processor + (on ok)
 * stamp the order. Idempotent: completing an already-completed session returns
 * the same order. MONEY-SAFE: the processor is the no-charge stub in v1; no
 * Stripe call happens here.
 */
export async function handleComplete(
  id: string,
  body: unknown,
  idempotencyKey: string | null,
  deps: AcpHandlerDeps,
): Promise<AcpOutcome> {
  const stored = await deps.store.get(id);
  if (!stored) return notFound();

  // Idempotent re-complete: already done → echo the completed session.
  if (stored.status === "completed") {
    return { status: 200, body: wire(stored) };
  }

  const parsed = validateCompleteBody(body);
  if (!parsed.ok) return errorOutcome(400, parsed.error);

  if (stored.status !== "ready_for_payment") {
    return errorOutcome(400, {
      type: "invalid_request",
      code: "not_ready_for_payment",
      message: `Session is "${stored.status}" and cannot be completed.`,
    });
  }

  // Apply any buyer sent on complete (best-effort, before charging).
  let buyer = stored.buyer ?? null;
  if (parsed.value.buyer) buyer = parsed.value.buyer;

  // Run the processor. In v1 this is the NO-CHARGE dev stub → returns a fake
  // ref (acp_stub_… / acp_free) and moves no money.
  const charge = await deps.processor.authorizeAndCapture({
    sessionId: stored.id,
    amountCents: stored.totals.total,
    currency: stored.currency,
    paymentToken: parsed.value.payment_data.token,
    sellerOrgId: stored.sellerOrgId ?? undefined,
    feeCents: stored.feeCents,
  });

  if (!charge.ok) {
    // Payment failed → 402; session stays ready so the buyer can retry.
    return errorOutcome(402, {
      type: "processing_error",
      code: charge.error.code,
      message: charge.error.message,
    });
  }

  const order = buildOrder({ sessionId: stored.id, slug: stored.listingSlug ?? "" });
  const saved = await deps.store.update(id, { status: "completed", order, buyer });
  if (!saved) return notFound();

  // Log the completed order so seller earnings can attribute it later (mirrors
  // the rental rail's agent_rental_call accrual: amount_cents + fee_cents +
  // payment_ref on the property bag, attributed to the seller org). RECORDED,
  // not charged — feeCents is the SF 5% cut computed at create/update.
  deps.logEvent(
    "acp_order_completed",
    {
      slug: stored.listingSlug,
      amount_cents: stored.totals.total,
      fee_cents: stored.feeCents,
      payment_ref: charge.paymentRef,
      sellerOrgId: stored.sellerOrgId,
      order_id: order.id,
      session_id: stored.id,
    },
    { orgId: stored.sellerOrgId ?? null },
  );

  return { status: 200, body: wire(saved) };
}

// ─── cancel ──────────────────────────────────────────────────────────────────

export async function handleCancel(id: string, deps: AcpHandlerDeps): Promise<AcpOutcome> {
  const stored = await deps.store.get(id);
  if (!stored) return notFound();
  const saved = await deps.store.update(id, { status: "canceled" });
  if (!saved) return notFound();
  return { status: 200, body: wire(saved) };
}
