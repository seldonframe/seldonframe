// ACP checkout-session STORE — the thin db layer over acp_checkout_sessions.
//
// Just CRUD: create / get / update / find-by-idempotency-key. All persistence
// of the session (resolved line items, totals, buyer, order, recorded feeCents)
// flows through here so the route handler (Task 5) stays focused on wiring the
// pure math + the no-charge processor. No money logic lives here — the feeCents
// it stores is computed upstream (computeMarketplaceFeeCents) and never charged.
//
// Tenant note: ACP sessions are buyer-facing (OpenAI-driven), so they are NOT
// org-scoped on create. `sellerOrgId` (the agent creator's org) is the only org
// link, used for fee attribution + the future charge destination.

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  acpCheckoutSessions,
  type AcpCheckoutSessionRow,
  type NewAcpCheckoutSession,
} from "@/db/schema/acp";

/** Insert a new checkout session row. Returns the persisted row. */
export async function createSession(values: NewAcpCheckoutSession): Promise<AcpCheckoutSessionRow> {
  const [row] = await db.insert(acpCheckoutSessions).values(values).returning();
  return row;
}

/** Load a session by id. Returns null when it doesn't exist. */
export async function getSession(id: string): Promise<AcpCheckoutSessionRow | null> {
  const [row] = await db
    .select()
    .from(acpCheckoutSessions)
    .where(eq(acpCheckoutSessions.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Patch a session by id. Always bumps updatedAt. Returns the updated row, or
 * null if the id didn't exist. `id`/`createdAt` are not patchable.
 */
export async function updateSession(
  id: string,
  patch: Partial<Omit<NewAcpCheckoutSession, "id" | "createdAt">>,
): Promise<AcpCheckoutSessionRow | null> {
  const [row] = await db
    .update(acpCheckoutSessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(acpCheckoutSessions.id, id))
    .returning();
  return row ?? null;
}

/**
 * Find the most-recent session created under a given Idempotency-Key (dedupe on
 * create/complete). Returns null when none. Empty/absent keys never match (a
 * caller without a key always gets a fresh session).
 */
export async function findByIdempotencyKey(key: string | null | undefined): Promise<AcpCheckoutSessionRow | null> {
  const k = (key ?? "").trim();
  if (!k) return null;
  const [row] = await db
    .select()
    .from(acpCheckoutSessions)
    .where(eq(acpCheckoutSessions.idempotencyKey, k))
    .orderBy(desc(acpCheckoutSessions.createdAt))
    .limit(1);
  return row ?? null;
}
