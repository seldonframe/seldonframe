// #139 — the REAL (production) deps for createOneTimeAgentCheckout. Kept out of
// the pure module so the unit tests never import a Stripe client or the db. The
// install action (a "use server" file) imports buildOneTimeCheckoutDeps() and
// passes it in; everything money-touching is therefore concentrated here behind
// the same DI seam the tests fake.
//
// readConnectStatus mirrors lib/marketplace/seller-actions.ts's private
// readConnectStatus EXACTLY (the same stripe_connections row the proposals flow
// onboards): ready = isActive === true, accountId = stripeAccountId.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema/payments";
import { getStripeClient } from "@seldonframe/payments";
import { createPurchase } from "./purchases-store";
import type {
  ConnectStatus,
  CreateOneTimeAgentCheckoutDeps,
  StripeCheckoutSeam,
} from "./one-time-checkout";

/** Read the seller org's Connect status from stripe_connections — the same row
 *  the proposals onboarding + the seller publish gate use. ready when isActive. */
export async function readConnectStatus(sellerOrgId: string): Promise<ConnectStatus> {
  const [row] = await db
    .select({
      stripeAccountId: stripeConnections.stripeAccountId,
      isActive: stripeConnections.isActive,
    })
    .from(stripeConnections)
    .where(eq(stripeConnections.orgId, sellerOrgId))
    .limit(1);
  if (!row) return { ready: false, accountId: null };
  return { ready: row.isActive === true, accountId: row.stripeAccountId ?? null };
}

/** Build the production deps. getStripeClient() returns null without
 *  STRIPE_SECRET_KEY → the checkout stays inert (skips). */
export function buildOneTimeCheckoutDeps(): CreateOneTimeAgentCheckoutDeps {
  return {
    getStripe: () => getStripeClient() as StripeCheckoutSeam | null,
    readConnectStatus,
    createPurchase,
    env: process.env as Record<string, string | undefined>,
    baseUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    now: () => new Date(),
  };
}
