"use server";

// topUpWalletAction — the builder-facing "Add funds" server action (spec
// 1ff09dcb, P2 Task 2).
//
// Org-scoped: resolves the caller's org, then delegates to the pure
// createWalletTopupCheckout with the real deps. Behind the SF_MARKETPLACE_BILLING
// flag + inert without a Stripe key (the pure helper enforces both). Returns the
// Checkout URL (the client redirects the browser to it) or a skipped reason — it
// is the ONLY money-IN call; the per-run drawdown never touches Stripe.

import { getOrgId } from "@/lib/auth/helpers";
import { createWalletTopupCheckout } from "@/lib/build/wallet-topup";
import { buildWalletTopupCheckoutDeps } from "@/lib/build/wallet-topup-deps";

export type TopUpWalletResult =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Start a Stripe Checkout that funds the caller's prepaid build wallet by
 * `amountCents`. Org-scoped + flag-gated + inert without a Stripe key. Returns the
 * Checkout URL or a reason. Never charges the per-run path (that's a ledger debit).
 */
export async function topUpWalletAction(input: {
  amountCents: number;
}): Promise<TopUpWalletResult> {
  const orgId = await getOrgId();
  if (!orgId) return { ok: false, reason: "unauthorized" };

  const amountCents = Math.floor(Number(input?.amountCents));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { ok: false, reason: "invalid_amount" };
  }

  const result = await createWalletTopupCheckout(
    { orgId, amountCents },
    buildWalletTopupCheckoutDeps(),
  );

  if (result.ok && result.url) return { ok: true, url: result.url };
  if (result.ok) return { ok: false, reason: "no_checkout_url" };
  return { ok: false, reason: result.reason };
}
