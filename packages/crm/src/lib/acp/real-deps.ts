// ACP handler REAL deps — assembles the production AcpHandlerDeps the routes
// bind. Each piece is the thin real-world adapter behind the DI seam the handler
// (handler.ts) is unit-tested against with fakes:
//   • resolveListing  → getPublishedAgentListingBySlug → AcpResolvedListing
//                        (enableCheckout = priced; free agents install via App).
//   • store           → maps AcpStoredSession ↔ the acp_checkout_sessions row.
//   • processor       → resolveProcessor() (the NO-CHARGE dev stub in v1; the
//                        live branch throws until Max wires a real processor).
//   • logEvent        → trackEvent (fire-and-forget → seldonframe_events).
//   • newId / now     → opaque session id + clock.
//
// MONEY-SAFETY: the only payment effect is resolveProcessor()'s stub. Nothing
// here imports a Stripe client.

import { randomUUID } from "node:crypto";
import { getPublishedAgentListingBySlug } from "@/lib/marketplace/agent-listings";
import { trackEvent } from "@/lib/analytics/track";
import { resolveProcessor } from "./processor";
import { createSession, getSession, updateSession, findByIdempotencyKey } from "./store";
import type { AcpCheckoutSessionRow, NewAcpCheckoutSession } from "@/db/schema/acp";
import type { AcpHandlerDeps, AcpResolvedListing, AcpStoredSession } from "./handler";

/** Map a persisted drizzle row → the handler's AcpStoredSession. */
function rowToStored(row: AcpCheckoutSessionRow): AcpStoredSession {
  return {
    id: row.id,
    status: row.status as AcpStoredSession["status"],
    currency: row.currency,
    requested: row.items?.requested ?? [],
    lineItems: row.items?.lineItems ?? [],
    totals: row.totals,
    buyer: row.buyer ?? null,
    order: row.order ?? null,
    sellerOrgId: row.sellerOrgId,
    listingSlug: row.listingSlug,
    feeCents: row.feeCents ?? 0,
    idempotencyKey: row.idempotencyKey,
  };
}

/** Map an AcpStoredSession → the acp_checkout_sessions INSERT/UPDATE values. */
function storedToValues(s: AcpStoredSession): NewAcpCheckoutSession {
  return {
    id: s.id,
    status: s.status,
    currency: s.currency,
    items: { requested: s.requested, lineItems: s.lineItems },
    buyer: s.buyer ?? null,
    totals: s.totals,
    order: s.order ?? null,
    sellerOrgId: s.sellerOrgId ?? null,
    listingSlug: s.listingSlug ?? null,
    feeCents: s.feeCents,
    idempotencyKey: s.idempotencyKey ?? null,
  };
}

/** Translate a partial AcpStoredSession patch → a column patch (only the keys
 *  the handler ever updates). `items` is re-derived when line items change. */
function patchToValues(patch: Partial<AcpStoredSession>): Partial<NewAcpCheckoutSession> {
  const out: Partial<NewAcpCheckoutSession> = {};
  if (patch.status !== undefined) out.status = patch.status;
  if (patch.currency !== undefined) out.currency = patch.currency;
  if (patch.requested !== undefined || patch.lineItems !== undefined) {
    out.items = { requested: patch.requested ?? [], lineItems: patch.lineItems ?? [] };
  }
  if (patch.buyer !== undefined) out.buyer = patch.buyer ?? null;
  if (patch.totals !== undefined) out.totals = patch.totals;
  if (patch.order !== undefined) out.order = patch.order ?? null;
  if (patch.sellerOrgId !== undefined) out.sellerOrgId = patch.sellerOrgId ?? null;
  if (patch.listingSlug !== undefined) out.listingSlug = patch.listingSlug ?? null;
  if (patch.feeCents !== undefined) out.feeCents = patch.feeCents;
  if (patch.idempotencyKey !== undefined) out.idempotencyKey = patch.idempotencyKey ?? null;
  return out;
}

/** Resolve a slug → AcpResolvedListing (or null). enableCheckout is true only
 *  for PAID agents (price > 0) — free agents are install-via-App, not ACP. */
async function resolveListing(slug: string): Promise<AcpResolvedListing | null> {
  const listing = await getPublishedAgentListingBySlug(slug);
  if (!listing) return null;
  const priceCents = Number.isFinite(listing.priceCents) && listing.priceCents > 0 ? Math.round(listing.priceCents) : 0;
  return {
    slug: listing.slug,
    name: listing.name,
    priceCents,
    niche: listing.niche,
    sellerOrgId: listing.creatorOrgId,
    isPublished: true, // getPublishedAgentListingBySlug only returns published rows
    enableCheckout: priceCents > 0,
  };
}

/**
 * Build the production AcpHandlerDeps the routes use. A FUNCTION (not a
 * module-level const) so `resolveProcessor()` runs PER REQUEST: on the live path
 * (ACP_LIVE=true, no real processor) it throws at request time → a clean 500
 * with the money-safety message, never a module-load crash. In v1 it returns the
 * no-charge dev stub, so a default deploy charges nothing.
 */
export function buildRealAcpDeps(): AcpHandlerDeps {
  return {
    resolveListing,
    store: {
      create: async (s) => rowToStored(await createSession(storedToValues(s))),
      get: async (id) => {
        const row = await getSession(id);
        return row ? rowToStored(row) : null;
      },
      update: async (id, patch) => {
        const row = await updateSession(id, patchToValues(patch));
        return row ? rowToStored(row) : null;
      },
      findByIdempotencyKey: async (key) => {
        const row = await findByIdempotencyKey(key);
        return row ? rowToStored(row) : null;
      },
    },
    // The no-charge dev stub in v1. resolveProcessor() THROWS if ACP_LIVE=true
    // and no real processor is wired — so a deploy never silently charges.
    processor: resolveProcessor(),
    logEvent: (event, properties, ctx) => trackEvent(event, properties, ctx ?? undefined),
    newId: () => `acp_sess_${randomUUID().replace(/-/g, "")}`,
    now: () => new Date(),
  };
}
