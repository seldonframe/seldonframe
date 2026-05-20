// packages/crm/src/app/api/v1/proposals/connect/start/route.ts
// 2026-05-19 — Proposal Builder. Creates a Stripe Connect Express
// account for the operator's agency, persists the acct_xxx into
// stripe_connections, and returns the onboarding URL the client
// redirects to. Spec: §"Stripe Connect Express onboarding".

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import {
  buildAccountLinkParams,
  buildConnectAccountParams,
  getStripeClient,
} from "@/lib/proposals/stripe-connect";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const stripe = getStripeClient();
  if (!stripe) {
    return NextResponse.json({ error: "stripe_not_configured" }, { status: 500 });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";

  // Create the Connect Express account on Stripe.
  const account = await stripe.accounts.create(
    buildConnectAccountParams({
      agencyName: user.agencyProfile.name ?? user.name,
      agencyEmail: user.email,
    }),
  );

  // Persist the connection. Reuse the existing stripe_connections table —
  // the agency's PRIMARY org row gets the connection. Set isActive=false
  // until onboarding completes (we sync that on the return endpoint).
  // stripe_connections.org_id has no UNIQUE constraint (only an index),
  // so we SELECT then UPDATE-or-INSERT instead of onConflictDoUpdate.
  const existing = await db
    .select({ id: stripeConnections.id })
    .from(stripeConnections)
    .where(eq(stripeConnections.orgId, user.orgId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(stripeConnections)
      .set({ stripeAccountId: account.id, isActive: false, updatedAt: new Date() })
      .where(eq(stripeConnections.id, existing[0].id));
  } else {
    await db.insert(stripeConnections).values({
      orgId: user.orgId,
      stripeAccountId: account.id,
      isActive: false,
    });
  }

  // Build the onboarding link.
  const link = await stripe.accountLinks.create(
    buildAccountLinkParams({ stripeAccountId: account.id, baseUrl }),
  );

  return NextResponse.json({ url: link.url, accountId: account.id });
}
