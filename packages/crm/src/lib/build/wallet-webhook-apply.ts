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
//
// TOP-UP AUTO-REACTIVATE HOOK (Task 6, voice-deploy metered billing): after a
// SUCCESSFUL credit, best-effort check whether this org has any sf_managed
// deployment marked delinquent (Task 7's rent cron stamps `delinquentSince`
// when rent goes unpaid past the grace window) and, if so, reactivate their
// suspended Twilio subaccount + clear the marker(s). This is ADDITIVE and
// FAIL-SOFT — its own try/catch, wired through a DI seam
// (onTopupCredited) that defaults to the real implementation but is entirely
// absent from every existing test's WalletTopupWebhookDeps (optional field),
// so the pre-existing credit tests are byte-for-byte unaffected. A failure
// here must NEVER break the credit that already succeeded above it.

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

/** The top-up auto-reactivate hook seam (Task 6). Called ONLY after a
 *  successful credit; MUST NOT throw (the real impl is self-contained
 *  try/catch — see defaultOnTopupCredited below). Optional so every existing
 *  caller's WalletTopupWebhookDeps (built with just {verify, credit}) keeps
 *  compiling — applyWalletTopupWebhook defaults it when absent. */
export type WalletTopupCreditedHook = (orgId: string) => Promise<void>;

export type WalletTopupWebhookDeps = {
  verify: WalletTopupVerify;
  credit: WalletTopupCreditFn;
  /** Optional — defaults to defaultOnTopupCredited (the real sf-managed
   *  reactivate wiring) when omitted. Unit tests that want to assert on the
   *  hook pass their own fake; every other caller gets the real behavior. */
  onTopupCredited?: WalletTopupCreditedHook;
};

/**
 * The real top-up auto-reactivate hook: if `orgId` has any sf_managed
 * deployment currently marked delinquent, reactivate its Twilio subaccount
 * and clear every such marker. Fail-soft — wrapped in its own try/catch so a
 * DB hiccup or a Twilio error here can NEVER surface past a successful
 * credit. Lazy imports (mirrors every other store/deps helper in this
 * codebase) so this module's cold import path stays light and test doubles
 * never accidentally pull in DB/Twilio code.
 */
async function defaultOnTopupCredited(orgId: string): Promise<void> {
  try {
    const { listDelinquentSfManagedDeploymentIds, clearDelinquentSince } = await import(
      "@/lib/telephony/delinquency"
    );
    const delinquentIds = await listDelinquentSfManagedDeploymentIds(orgId);
    if (delinquentIds.length === 0) return; // nothing to reactivate

    const { reactivateBuilderSubaccount, buildSfManagedDeps } = await import(
      "@/lib/telephony/sf-managed"
    );
    await reactivateBuilderSubaccount(orgId, buildSfManagedDeps());

    for (const deploymentId of delinquentIds) {
      await clearDelinquentSince(deploymentId);
    }
  } catch {
    // Fail-soft — a reactivation failure must never break the credit that
    // already succeeded above it.
  }
}

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

  const r = (result ?? {}) as { ok?: boolean; applied?: boolean; duplicate?: boolean; balanceMicros?: number };

  // Top-up auto-reactivate hook (Task 6) — fail-soft, own try/catch (either the
  // caller's fake or defaultOnTopupCredited; both never throw). Fires on any
  // credit result that isn't an explicit ok:false (the credit path above only
  // ever reaches here on success/duplicate — `ok` may simply be absent on some
  // callers' loosely-typed results, which is treated as success, matching how
  // `r.applied`/`r.duplicate` are already read optimistically above).
  if (r.ok !== false) {
    const hook = deps.onTopupCredited ?? defaultOnTopupCredited;
    try {
      await hook(decision.orgId);
    } catch {
      // Belt-and-suspenders — the hook contract already promises never to
      // throw, but a credit that already succeeded must NEVER be put at risk.
    }
  }

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
