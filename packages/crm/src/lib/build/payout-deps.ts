// payout — the REAL (production) deps for requestPayout. Kept out of the pure
// module (and out of the "use server" action) so the unit tests never import a
// Stripe client. Mirrors wallet-topup-deps.ts.
//
// INERT WITHOUT A KEY: getStripeClient() returns null → getConnectedAccount
// returns null → requestPayout answers connect_required and NO transfer is ever
// created. The Connect account is read from the SAME stripe_connections table the
// proposal onboarding writes (reuse, no new onboarding).

import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { getStripeClient } from "@/lib/proposals/stripe-connect";
import { isBillingEnabled } from "@/lib/marketplace/billing/billing-mode";
import {
  getWithdrawableEarningsMicros,
  getBuilderEarningsMicros,
  recordBuilderPayout,
} from "@/lib/build/wallet-store";
import { MIN_WITHDRAW_USD, type RequestPayoutDeps } from "@/lib/build/payout";

/** The narrow Stripe seam this feature needs — accounts.retrieve (payouts_enabled)
 *  + transfers.create. Typed against the SDK so the call sites can't drift. */
type PayoutStripeSeam = {
  accounts: { retrieve(id: string): Promise<Stripe.Account> };
  transfers: {
    create(
      params: Stripe.TransferCreateParams,
      options?: Stripe.RequestOptions,
    ): Promise<Pick<Stripe.Transfer, "id">>;
  };
};

/** Read the org's active Connect account + its payouts_enabled from Stripe. Null
 *  when there's no active row or no Stripe key (→ connect_required, no transfer). */
async function readConnectedAccount(
  orgId: string,
  stripe: PayoutStripeSeam | null,
): Promise<{ stripeAccountId: string; payoutsEnabled: boolean } | null> {
  if (!stripe) return null;
  const [row] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, orgId), eq(stripeConnections.isActive, true)))
    .limit(1);
  if (!row?.stripeAccountId) return null;
  try {
    const account = await stripe.accounts.retrieve(row.stripeAccountId);
    return { stripeAccountId: row.stripeAccountId, payoutsEnabled: account.payouts_enabled === true };
  } catch {
    // Account deleted/unreadable → treat as not connected (no transfer).
    return null;
  }
}

/** Build the production deps. Inert without a Stripe key (seam → null). */
export function buildPayoutDeps(): RequestPayoutDeps {
  const stripe = getStripeClient() as unknown as PayoutStripeSeam | null;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com";
  return {
    billingEnabled: isBillingEnabled(process.env as Record<string, string | undefined>),
    minWithdrawUsd: MIN_WITHDRAW_USD,
    getConnectedAccount: (orgId) => readConnectedAccount(orgId, stripe),
    getWithdrawableMicros: (orgId) => getWithdrawableEarningsMicros(orgId),
    getGrossEarnedMicros: (orgId) => getBuilderEarningsMicros(orgId),
    createTransfer: async (i) => {
      if (!stripe) throw new Error("stripe_unconfigured"); // unreachable: connect_required gates first
      const transfer = await stripe.transfers.create(
        { amount: i.amountCents, currency: "usd", destination: i.destinationAccountId },
        { idempotencyKey: i.idempotencyKey },
      );
      return { transferId: transfer.id };
    },
    recordPayout: async (i) => {
      await recordBuilderPayout(i);
    },
    onboardingUrl: async () => `${baseUrl}/build/wallet`,
  };
}
