// marketplace_purchases STORE — the thin db layer over the #139 settlement
// ledger. Just CRUD: create / update-by-checkout-id / get (org-scoped read).
// Mirrors lib/acp/store.ts. No money logic lives here — amountCents/feeCents are
// computed upstream (storefrontPriceFromRow / computeMarketplaceFeeCents) and
// the stripeMode is resolved upstream (resolveBillingMode); this module only
// persists.
//
// Tenant note: createPurchase/updatePurchaseByCheckoutId are written from the
// install path (the buyer's own action) and the webhook (reconciliation), so
// they are not org-scoped on write. getPurchase IS org-scoped (the buyer can
// only read its own purchases) — pass the buyer's orgId.

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  marketplacePurchases,
  type MarketplacePurchaseRow,
  type NewMarketplacePurchase,
} from "@/db/schema/marketplace-purchases";

/** Insert a new purchase row (status 'pending' on create). Returns the row. */
export async function createPurchase(
  values: NewMarketplacePurchase,
): Promise<MarketplacePurchaseRow> {
  const [row] = await db.insert(marketplacePurchases).values(values).returning();
  if (!row) throw new Error("marketplace_purchases insert returned no row");
  return row;
}

/**
 * Patch the purchase whose Stripe Checkout session id matches (the P4 webhook's
 * reconciliation key). Always bumps updatedAt. Returns the updated row, or null
 * if no row carried that checkout id. `id`/`createdAt` are not patchable.
 */
export async function updatePurchaseByCheckoutId(
  stripeCheckoutId: string,
  patch: Partial<Omit<NewMarketplacePurchase, "id" | "createdAt">>,
): Promise<MarketplacePurchaseRow | null> {
  const key = (stripeCheckoutId ?? "").trim();
  if (!key) return null;
  const [row] = await db
    .update(marketplacePurchases)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(marketplacePurchases.stripeCheckoutId, key))
    .returning();
  return row ?? null;
}

/**
 * Patch the purchase whose Stripe SUBSCRIPTION id matches (the recurring P2/P3
 * reconciliation key — the subscription id arrives on the P4
 * `checkout.session.completed` / `customer.subscription.*` webhooks). Always
 * bumps updatedAt. Returns the updated row, or null if no row carried that
 * subscription id. `id`/`createdAt` are not patchable.
 */
export async function updatePurchaseBySubscriptionId(
  stripeSubscriptionId: string,
  patch: Partial<Omit<NewMarketplacePurchase, "id" | "createdAt">>,
): Promise<MarketplacePurchaseRow | null> {
  const key = (stripeSubscriptionId ?? "").trim();
  if (!key) return null;
  const [row] = await db
    .update(marketplacePurchases)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(marketplacePurchases.stripeSubscriptionId, key))
    .returning();
  return row ?? null;
}

/**
 * Patch the most-recent purchase whose Stripe CUSTOMER id matches — the
 * ordering-race fallback (P3): an `invoice.paid` that arrives before
 * `checkout.session.completed` stamped the subscription id can still reconcile by
 * customer id. Orders by createdAt desc + patches ONE row (a customer could in
 * principle hold multiple marketplace subscriptions; the most recent pending one
 * is the one this invoice is activating). Always bumps updatedAt. Returns the
 * updated row, or null if no row carried that customer id. `id`/`createdAt` are
 * not patchable.
 */
export async function updatePurchaseByCustomerId(
  stripeCustomerId: string,
  patch: Partial<Omit<NewMarketplacePurchase, "id" | "createdAt">>,
): Promise<MarketplacePurchaseRow | null> {
  const key = (stripeCustomerId ?? "").trim();
  if (!key) return null;
  // Resolve the single most-recent matching row's id, then patch by primary key
  // (a plain UPDATE … ORDER BY LIMIT 1 isn't portable in Postgres).
  const [target] = await db
    .select({ id: marketplacePurchases.id })
    .from(marketplacePurchases)
    .where(eq(marketplacePurchases.stripeCustomerId, key))
    .orderBy(desc(marketplacePurchases.createdAt))
    .limit(1);
  if (!target) return null;
  const [row] = await db
    .update(marketplacePurchases)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(marketplacePurchases.id, target.id))
    .returning();
  return row ?? null;
}

/**
 * Load a single purchase by id, SCOPED to the buyer's org (a buyer can only read
 * its own purchases). Returns null when it doesn't exist for that org.
 */
export async function getPurchase(
  id: string,
  buyerOrgId: string,
): Promise<MarketplacePurchaseRow | null> {
  const [row] = await db
    .select()
    .from(marketplacePurchases)
    .where(
      and(
        eq(marketplacePurchases.id, id),
        eq(marketplacePurchases.buyerOrgId, buyerOrgId),
      ),
    )
    .limit(1);
  return row ?? null;
}
