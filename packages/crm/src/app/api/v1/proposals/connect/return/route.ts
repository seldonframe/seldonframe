// packages/crm/src/app/api/v1/proposals/connect/return/route.ts
// 2026-05-19 — Proposal Builder. Stripe redirects the operator here
// after onboarding completes (success OR failure — we infer from the
// account's chargesEnabled/payoutsEnabled). Spec: §"Stripe Connect
// Express onboarding".

import { NextResponse } from "next/server";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { getStripeClient } from "@/lib/proposals/stripe-connect";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login?callbackUrl=/proposals/onboarding");
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "missing_account_id" }, { status: 400 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
  }

  const account = await stripe.accounts.retrieve(accountId);
  const chargesEnabled = account.charges_enabled === true;
  const payoutsEnabled = account.payouts_enabled === true;

  // Sync status on the existing stripe_connections row.
  await db
    .update(stripeConnections)
    .set({
      isActive: chargesEnabled,
      connectedAt: chargesEnabled ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stripeConnections.stripeAccountId, accountId),
        eq(stripeConnections.orgId, session.user.orgId!),
      ),
    );

  // Redirect back to the dashboard with status.
  const status = chargesEnabled ? "ready" : payoutsEnabled ? "pending" : "incomplete";
  redirect(`/proposals/onboarding?status=${status}`);
}
