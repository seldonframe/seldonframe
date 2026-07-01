"use server";

// The dashboard (cookie-authed) entry to a payout — the session sibling of the
// bearer route. getOrgId() from the session, then the SAME pure requestPayout +
// real deps. Money-safe by construction (flag-gated, inert without a key,
// idempotent). Returns the PayoutResult for the Withdraw island to render.

import { getOrgId } from "@/lib/auth/helpers";
import { requestPayout, type PayoutResult } from "@/lib/build/payout";
import { buildPayoutDeps } from "@/lib/build/payout-deps";

export async function requestPayoutAction(): Promise<PayoutResult> {
  const orgId = await getOrgId();
  if (!orgId) return { status: "disabled" };
  return requestPayout({ orgId }, buildPayoutDeps());
}
