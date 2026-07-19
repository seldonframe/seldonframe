// packages/crm/src/app/p/[token]/accept/route.ts
// 2026-05-19 — Proposal Builder. Public accept endpoint. Creates a
// Stripe Checkout session on the agency's connected account (direct
// charge, 0% platform fee). Spec: §"Acceptance + Stripe Checkout".

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { proposalEvents, proposals, stripeConnections } from "@/db/schema";
import { loadProposalByToken } from "@/lib/proposals/load-by-token";
import { buildCheckoutSessionParams } from "@/lib/proposals/checkout";
import { getStripeClient } from "@/lib/proposals/stripe-connect";
import { getOrgSubscription } from "@/lib/billing/subscription";
import { normalizeTierId } from "@/lib/billing/features";

export const runtime = "nodejs";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const proposal = await loadProposalByToken(token);
  if (!proposal) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (proposal.status !== "sent" && proposal.status !== "viewed") {
    return NextResponse.json({ error: "not_acceptable" }, { status: 409 });
  }
  if (new Date(proposal.expiresAt).getTime() < Date.now()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // Find the agency's connected Stripe account.
  const [conn] = await db
    .select({ accountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(
      and(
        eq(stripeConnections.orgId, proposal.agencyOrgId),
        eq(stripeConnections.isActive, true),
      ),
    )
    .limit(1);

  if (!conn) {
    return NextResponse.json({ error: "stripe_not_connected" }, { status: 500 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";

  // 2026-07-10 — GMV fee is tier-scoped: 0% on agency tiers, 2% on solo.
  // Resolve the SELLING (agency) org's subscription tier via the existing
  // billing subscription helper (same one hasFeature/getOrgFeatures use).
  const sellerSubscription = await getOrgSubscription(proposal.agencyOrgId);
  const sellerTier = normalizeTierId(sellerSubscription.tier ?? null);

  const checkoutParams = buildCheckoutSessionParams({
    proposalId: proposal.id,
    previewWorkspaceId: proposal.previewWorkspaceId,
    prospectEmail: proposal.prospectEmail,
    prospectName: proposal.prospectName,
    monthlyPriceCents: proposal.monthlyPriceCents,
    setupFeeCents: proposal.setupFeeCents,
    signedToken: proposal.signedToken,
    baseUrl,
    sellerTier,
  });

  // Direct charge on the agency's connected account.
  const session = await stripe.checkout.sessions.create(checkoutParams, {
    stripeAccount: conn.accountId,
    idempotencyKey: `proposal-${proposal.id}`,
  });

  await db
    .update(proposals)
    .set({
      stripeCheckoutSessionId: session.id,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, proposal.id));

  await db.insert(proposalEvents).values({
    proposalId: proposal.id,
    eventType: "checkout_started",
    metadata: { sessionId: session.id },
  });

  return NextResponse.json({ url: session.url });
}
