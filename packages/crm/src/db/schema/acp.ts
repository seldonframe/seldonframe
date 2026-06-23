// 2026-06-23 — ACP (Agentic Commerce Protocol) checkout-session persistence.
//
// One row per ChatGPT Instant-Checkout session: create → update → complete.
// ADDITIVE only — a brand-new table, no edits to any existing table. The
// session is BUYER-FACING (OpenAI-driven), so it is NOT org-scoped on create
// the way most tables are: `sellerOrgId` is the AGENT CREATOR's org (the side
// the recorded 5% fee attributes to / the future charge destination), captured
// from the resolved listing. `feeCents` is the SF marketplace fee — RECORDED
// here, not charged in v1 (the wired processor is a no-charge dev stub).
//
// jsonb bags (items/buyer/totals/order) carry the ACP wire sub-objects verbatim
// so the shape can evolve without a migration per dimension — same rationale as
// seldonframe_events.properties + deployments.client_context.
//
// Migration: drizzle/0031_acp_checkout_sessions.sql (Max's gate to merge).

import { sql } from "drizzle-orm";
import { index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import type {
  AcpBuyer,
  AcpItemInput,
  AcpLineItem,
  AcpOrder,
  AcpTotal,
} from "@/lib/acp/types";

/** The persisted totals bag: the three scalar sums + the wire `totals[]`. */
export type AcpStoredTotals = {
  subtotal: number;
  tax: number;
  total: number;
  totals: AcpTotal[];
};

/** What the `items` jsonb stores: the resolved line items (so a get/update can
 *  recompute without re-resolving when nothing changed) alongside the raw input
 *  ids. We persist the resolved line items — the source of truth for the wire. */
export type AcpStoredItems = {
  /** The buyer's requested ids+quantities (the create/update input). */
  requested: AcpItemInput[];
  /** The resolved line items (priced). */
  lineItems: AcpLineItem[];
};

export const acpCheckoutSessions = pgTable(
  "acp_checkout_sessions",
  {
    /** The session id (e.g. "acp_sess_<rand>"). Application-generated, text PK
     *  — NOT a uuid default, because ACP ids are opaque strings ChatGPT echoes. */
    id: text("id").primaryKey(),
    /** "not_ready_for_payment" | "ready_for_payment" | "completed" | "canceled". */
    status: text("status").notNull(),
    currency: text("currency").notNull().default("usd"),
    /** Resolved + requested items (AcpStoredItems). */
    items: jsonb("items").$type<AcpStoredItems>().notNull(),
    /** Optional buyer block. */
    buyer: jsonb("buyer").$type<AcpBuyer>(),
    /** The computed totals bag (AcpStoredTotals). */
    totals: jsonb("totals").$type<AcpStoredTotals>().notNull(),
    /** The order, stamped on completion. Nullable until completed. */
    order: jsonb("order").$type<AcpOrder>(),
    /** The agent CREATOR's org — fee attribution / future charge destination.
     *  Buyer-facing sessions aren't org-scoped on create, so this is the only
     *  org link (resolved from the purchased listing). Nullable for safety. */
    sellerOrgId: text("seller_org_id"),
    /** The purchased agent's marketplace slug (denormalized for the order
     *  permalink + event attribution without re-querying the listing). */
    listingSlug: text("listing_slug"),
    /** SF's 5% marketplace fee in cents — RECORDED, not charged in v1. */
    feeCents: integer("fee_cents").default(0),
    /** Idempotency-Key honored on create/complete (dedupe). Nullable. */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** When this pending session should be considered stale (cleanup). */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    // Dedupe lookups by Idempotency-Key (partial — only non-null keys matter).
    index("acp_sessions_idempotency_idx").on(table.idempotencyKey),
    // Seller attribution scans (future seller-earnings rollup over ACP orders).
    index("acp_sessions_seller_idx").on(table.sellerOrgId),
  ],
);

export type AcpCheckoutSessionRow = typeof acpCheckoutSessions.$inferSelect;
export type NewAcpCheckoutSession = typeof acpCheckoutSessions.$inferInsert;
