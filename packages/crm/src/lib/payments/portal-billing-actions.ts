"use server";

// Autopay console (2026-07-08) — Task 3: the portal's "Update card" server
// action. Resolves the connected-account billing-portal session
// (lib/payments/billing-portal.ts) for the AUTHENTICATED portal session's
// org — the session is re-derived here via requirePortalSessionForOrg,
// never trusted from the caller's input, so a client can never open a
// portal session for another org.

import { and, eq } from "drizzle-orm";
import StripeClient from "stripe";
import { db } from "@/db";
import { proposals, stripeConnections } from "@/db/schema";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";
import { resolveRetainerBillingPortalSession, type RetainerBillingPortalSeam } from "@/lib/payments/billing-portal";

function getStripeClient(): RetainerBillingPortalSeam | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return new StripeClient(secretKey, { apiVersion: "2025-08-27.basil" });
}

export type UpdateCardActionResult = { ok: true; url: string } | { ok: false; reason: string };

export async function updateRetainerCardAction(orgSlug: string): Promise<UpdateCardActionResult> {
  const session = await requirePortalSessionForOrg(orgSlug);

  // Resolve the client's stripeCustomerId via proposals.previewWorkspaceId
  // (the same join key resolveProposalBySubscriptionId/findActiveSubscription
  // use in lib/payments/retainer.ts) + the AGENCY's connect account id.
  const [proposal] = await db
    .select({ agencyOrgId: proposals.agencyOrgId, stripeCustomerId: proposals.stripeCustomerId })
    .from(proposals)
    .where(eq(proposals.previewWorkspaceId, session.orgId))
    .limit(1);

  if (!proposal) return { ok: false, reason: "no_customer" };

  const [connection] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, proposal.agencyOrgId), eq(stripeConnections.isActive, true)))
    .limit(1);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const result = await resolveRetainerBillingPortalSession(
    { stripeCustomerId: proposal.stripeCustomerId, connectAccountId: connection?.stripeAccountId ?? null },
    { getStripe: getStripeClient, returnUrl: `${baseUrl}/customer/${orgSlug}/billing` },
  );

  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, url: result.url };
}
