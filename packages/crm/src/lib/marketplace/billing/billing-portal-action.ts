"use server";

// #139 P4 — the buyer-facing "Manage billing" server action.
//
// Org-scoped: resolves the caller's org, loads the purchase via the ORG-SCOPED
// getPurchase(id, buyerOrgId) (a buyer can only open a portal for a purchase it
// owns), then delegates to the pure resolveMarketplacePortalSession with the real
// deps. Behind the SF_MARKETPLACE_BILLING flag + inert without a Stripe key (the
// pure helper enforces both). Returns the portal URL or a skipped reason — it
// moves no money.

import { getOrgId } from "@/lib/auth/helpers";
import { getPurchase } from "./purchases-store";
import { resolveMarketplacePortalSession } from "./billing-portal";
import { buildMarketplacePortalDeps } from "./real-deps";

export type CreateMarketplaceBillingPortalResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Create a Stripe Billing Portal link for the buyer to manage a marketplace
 * agent subscription they own. Org-scoped + flag-gated + inert without a Stripe
 * key. Never charges.
 */
export async function createMarketplaceBillingPortalAction(input: {
  purchaseId: string;
}): Promise<CreateMarketplaceBillingPortalResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, reason: "unauthorized" };

  const purchaseId = String(input?.purchaseId ?? "").trim();
  if (!purchaseId) return { ok: false, reason: "missing_purchase_id" };

  // ORG-SCOPED read: only the buyer org that owns the purchase can resolve it.
  const purchase = await getPurchase(purchaseId, orgId);
  if (!purchase) return { ok: false, reason: "not_found" };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const returnUrl = `${baseUrl}/marketplace/${purchase.slug}`;

  const result = await resolveMarketplacePortalSession(
    { stripeCustomerId: purchase.stripeCustomerId, sellerOrgId: purchase.sellerOrgId },
    buildMarketplacePortalDeps(returnUrl),
  );

  if (result.ok) return { ok: true, url: result.url };
  return { ok: false, reason: result.reason };
}
