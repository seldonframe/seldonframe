// GET /api/v1/build/wallet/balance — the prepaid wallet balance (spec 1ff09dcb,
// P2 Task 4). Monid-mirrored: returns `{ balance: { value, currency } }` where
// `value` is dollars (from the micro-dollar ledger) and `currency` is "USD".
// Also returns the builder's accrued `earnings` (cost − 5% fee summed over the
// `earning` ledger rows) in the same shape — what they're owed before the Connect
// payout (a follow-up).
//
// Read-only + ORG-SCOPED (the bearer's org). No money moves here. The balance is
// read for the wallet whose Stripe mode matches the configured key
// (resolveBillingMode) — the same wallet the top-up funded and runs draw down. In
// dev (no key) that's the 'test' wallet, which is simply 0 until funded.

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { logEvent } from "@/lib/observability/log";
import { resolveBillingMode } from "@/lib/marketplace/billing/billing-mode";
import {
  getWalletBalanceMicros,
  getBuilderEarningsMicros,
} from "@/lib/build/wallet-store";
import { microsToMoney } from "@/lib/build/wallet-format";

export async function GET(request: Request): Promise<Response> {
  const guard = await guardApiRequest(request);
  if (guard.error) return guard.error;
  if (!guard.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orgId = guard.orgId;

  const stripeMode = resolveBillingMode(process.env as Record<string, string | undefined>);

  const [balanceMicros, earningsMicros] = await Promise.all([
    getWalletBalanceMicros(orgId, stripeMode),
    getBuilderEarningsMicros(orgId),
  ]);

  logEvent(
    "build_wallet_balance",
    { balance_micros: balanceMicros, earnings_micros: earningsMicros },
    { request, orgId, status: 200 },
  );

  return NextResponse.json({
    // Monid-mirrored money shapes (dollars + currency).
    balance: microsToMoney(balanceMicros),
    earnings: microsToMoney(earningsMicros),
  });
}
