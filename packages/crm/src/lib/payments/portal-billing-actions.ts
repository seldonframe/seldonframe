"use server";

// Autopay console (2026-07-08) — Task 3: the portal's "Update card" server
// action. Resolves the connected-account billing-portal session
// (lib/payments/billing-portal.ts) for the AUTHENTICATED portal session's
// org — the session is re-derived here via requirePortalSessionForOrg,
// never trusted from the caller's input, so a client can never open a
// portal session for another org.
//
// Money-severity review fix (BLOCKING #1, 2026-07-08): this action already
// resolved the client->agency join correctly, but INDEPENDENTLY of
// lib/payments/portal-billing.ts, which was resolving it WRONG (scoping by
// session.orgId directly instead of joining to the agency org). The two
// halves of Task 3 assumed contradictory session orgs. Now both go through
// the SAME shared resolver — lib/payments/retainer.ts::
// resolveRetainerLinkForClientOrg — so they can never drift again.

import { and, eq } from "drizzle-orm";
import StripeClient from "stripe";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { requirePortalSessionForOrg } from "@/lib/portal/auth";
import { resolveRetainerBillingPortalSession, type RetainerBillingPortalSeam } from "@/lib/payments/billing-portal";
import { resolveRetainerLinkForClientOrg, defaultRetainerLinkDeps } from "@/lib/payments/retainer";

function getStripeClient(): RetainerBillingPortalSeam | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return new StripeClient(secretKey, { apiVersion: "2025-08-27.basil" });
}

export type UpdateCardActionResult = { ok: true; url: string } | { ok: false; reason: string };

export async function updateRetainerCardAction(orgSlug: string): Promise<UpdateCardActionResult> {
  const session = await requirePortalSessionForOrg(orgSlug);

  // The SAME join lib/payments/portal-billing.ts uses for history/card —
  // resolves session.orgId (the CLIENT org) to the agency org + stripeCustomerId.
  const link = await resolveRetainerLinkForClientOrg(session.orgId, defaultRetainerLinkDeps());
  if (!link) return { ok: false, reason: "no_customer" };

  const [connection] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, link.agencyOrgId), eq(stripeConnections.isActive, true)))
    .limit(1);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  const result = await resolveRetainerBillingPortalSession(
    { stripeCustomerId: link.stripeCustomerId, connectAccountId: connection?.stripeAccountId ?? null },
    { getStripe: getStripeClient, returnUrl: `${baseUrl}/customer/${orgSlug}/billing` },
  );

  if (!result.ok) return { ok: false, reason: result.reason };
  return { ok: true, url: result.url };
}
