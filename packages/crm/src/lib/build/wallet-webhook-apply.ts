// wallet webhook apply — verify a marketplace webhook + CREDIT a wallet top-up,
// with a DI'd verify + credit so the route is unit-testable WITHOUT a network or a
// real Stripe key (spec 1ff09dcb, P2 Task 2).
//
// The marketplace webhook route (app/api/v1/marketplace/stripe/webhook) already
// handles agent-purchase settlements. This is the SECOND, isolated pass that
// credits a prepaid-wallet top-up off the SAME endpoint: it re-verifies the raw
// body against the marketplace secret (cheap; keeps the existing pure marketplace
// path 100% untouched), maps the event with the pure decideWalletTopupCredit, and
// — only for a verified wallet_topup — applies ONE idempotent credit through the
// DI'd wallet store.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY: FAIL-CLOSED. No secret / no signature / verify throws → 400, the
// store is NEVER touched. A non-wallet or malformed event → 200 + no credit (the
// marketplace pass handles purchases). The credit is idempotent on the SESSION id
// (the store dedupes on it via UNIQUE(idempotency_key)), so a Stripe re-delivery
// credits ONCE. This module never charges — a top-up's money already settled in
// Stripe; here we only move the ledger.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";
import { decideWalletTopupCredit } from "@/lib/build/wallet-webhook";
import type { MarketplaceStripeMode } from "@/db/schema/marketplace-purchases";

/** The credit seam — the wallet store's creditTopupToWallet (idempotent on the
 *  session id passed as idempotencyKey). */
export type WalletTopupCreditFn = (input: {
  orgId: string;
  amountMicros: number;
  idempotencyKey: string;
  stripeMode: MarketplaceStripeMode;
  stripeRef?: string;
}) => Promise<{ ok: boolean; balanceMicros?: number; applied?: boolean; duplicate?: boolean } | unknown>;

/** Verify a raw webhook body → a typed Stripe.Event. MUST throw on bad/missing
 *  signature (the production impl wraps verifyStripeWebhookWithSecret). */
export type WalletTopupVerify = (input: {
  rawBody: string;
  signature: string;
  secret: string;
}) => Stripe.Event;

export type WalletTopupWebhookDeps = {
  verify: WalletTopupVerify;
  credit: WalletTopupCreditFn;
};

export type WalletTopupWebhookInput = {
  rawBody: string;
  signature: string | null;
  secret: string | null;
};

export type WalletTopupWebhookResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Verify + apply a wallet top-up credit off a marketplace webhook delivery.
 * Fail-closed on signature; credits ONCE (idempotent on the session id) for a
 * verified wallet_topup; a no-op 200 for anything else. Never throws; never charges.
 */
export async function applyWalletTopupWebhook(
  input: WalletTopupWebhookInput,
  deps: WalletTopupWebhookDeps,
): Promise<WalletTopupWebhookResult> {
  const secret = (input.secret ?? "").trim();
  const signature = (input.signature ?? "").trim();

  // FAIL-CLOSED.
  if (!secret) return { status: 400, body: { error: "webhook_not_configured" } };
  if (!signature) return { status: 400, body: { error: "missing_signature" } };

  let event: Stripe.Event;
  try {
    event = deps.verify({ rawBody: input.rawBody, signature, secret });
  } catch {
    return { status: 400, body: { error: "invalid_signature" } };
  }

  const decision = decideWalletTopupCredit(event);
  if (!decision.credit) {
    // Not a wallet top-up (or malformed) — acknowledge; the marketplace pass owns
    // purchase settlements.
    return { status: 200, body: { received: true, credited: false, reason: decision.reason } };
  }

  // The credit is idempotent on the session id (used as the idempotencyKey).
  const result = await deps.credit({
    orgId: decision.orgId,
    amountMicros: decision.amountMicros,
    idempotencyKey: decision.sessionId,
    stripeMode: decision.stripeMode,
    stripeRef: decision.sessionId,
  });

  const r = (result ?? {}) as { applied?: boolean; duplicate?: boolean; balanceMicros?: number };
  return {
    status: 200,
    body: {
      received: true,
      credited: true,
      sessionId: decision.sessionId,
      orgId: decision.orgId,
      amountMicros: decision.amountMicros,
      applied: r.applied ?? null,
      duplicate: r.duplicate ?? null,
    },
  };
}
