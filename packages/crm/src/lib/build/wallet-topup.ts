// wallet top-up — the Stripe Checkout that funds the prepaid balance (spec
// 1ff09dcb, P2 Task 2).
//
// THE ONLY STRIPE CALL IN THE PREPAID RAIL (money IN). The renter funds their OWN
// wallet, so this is a PLATFORM charge — mode:"payment" on SF's own account, NO
// { stripeAccount }, NO application_fee, NO Connect seller (unlike the agent
// checkout). The webhook (checkout.session.completed + metadata.type:"wallet_topup")
// reads the metadata (orgId + amountMicros) and credits the wallet idempotently on
// the session id. The per-run DRAWDOWN (Task 3) is a pure ledger decrement with NO
// Stripe call — that's the whole point of prepaid.
//
// ─────────────────────────────────────────────────────────────────────────────
// MONEY-SAFETY (mirrors one-time-checkout.ts):
//   • Everything is DI'd (the Stripe client, the env, the clock) so the unit
//     tests run with a FAKE Stripe — no network, no real key, no charge.
//   • INERT without a Stripe key: deps.getStripe() returns null → skip.
//   • Flag-gated: only when SF_MARKETPLACE_BILLING is ON (default OFF) → skip.
//   • resolveBillingMode (KEY-DERIVED) decides test vs live; dev/test can never
//     create a live charge.
//   • A non-positive / junk amount → skip (no zero-dollar Checkout).
//   • The Checkout uses an idempotency key (org + amount + UTC day) so a double
//     click reuses one session instead of opening two.
// ─────────────────────────────────────────────────────────────────────────────

import type Stripe from "stripe";
import { MICRO_PER_CENT } from "@/lib/build/run-cost";
import {
  isBillingEnabled,
  resolveBillingMode,
  type BillingEnv,
} from "@/lib/marketplace/billing/billing-mode";
import type { MarketplaceStripeMode } from "@/db/schema/marketplace-purchases";

/** The narrow Stripe seam — just checkout.sessions.create (typed against the SDK
 *  so the call site can't drift). The real dep passes the live client; the test a
 *  fake that records the params. */
export type WalletTopupStripeSeam = {
  checkout: {
    sessions: {
      create(
        params: Stripe.Checkout.SessionCreateParams,
        options?: Stripe.RequestOptions,
      ): Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
    };
  };
};

export type CreateWalletTopupCheckoutInput = {
  /** The org whose wallet is being funded. */
  orgId: string;
  /** The top-up amount in whole cents (> 0). */
  amountCents: number;
};

export type CreateWalletTopupCheckoutDeps = {
  /** The Stripe client, or null when no key is configured (→ inert/skip). */
  getStripe: () => WalletTopupStripeSeam | null;
  /** The environment (the billing flag + the live-key check). */
  env: BillingEnv;
  /** Base URL for the success/cancel redirects. */
  baseUrl: string;
  /** Clock — used for the per-day idempotency key. */
  now: () => Date;
};

export type CreateWalletTopupCheckoutResult =
  | { ok: true; url: string | null; sessionId: string; stripeMode: MarketplaceStripeMode }
  | { ok: false; skipped: true; reason: string };

function skip(reason: string): CreateWalletTopupCheckoutResult {
  return { ok: false, skipped: true, reason };
}

/** Clamp to a finite, positive integer of cents; junk/non-positive → 0. */
function positiveCents(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.floor(v);
}

/** The UTC calendar day (YYYY-MM-DD) for the idempotency key. */
function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Build a Stripe Checkout Session that funds the caller's prepaid wallet, and
 * return the Checkout URL. Returns { skipped } (and makes NO Stripe call) when the
 * billing flag is OFF, no Stripe key is configured, the amount is non-positive, or
 * the org id is missing. PLATFORM charge — no Connect, no application fee.
 */
export async function createWalletTopupCheckout(
  input: CreateWalletTopupCheckoutInput,
  deps: CreateWalletTopupCheckoutDeps,
): Promise<CreateWalletTopupCheckoutResult> {
  const orgId = (input.orgId ?? "").trim();
  if (!orgId) return skip("invalid_org");

  // 1) Feature-flag gate (default OFF).
  if (!isBillingEnabled(deps.env)) return skip("billing_disabled");

  // 2) Amount gate — no zero/negative top-up.
  const amountCents = positiveCents(input.amountCents);
  if (amountCents <= 0) return skip("invalid_amount");

  // 3) INERT without a Stripe key.
  const stripe = deps.getStripe();
  if (!stripe) return skip("stripe_unconfigured");

  // 4) Resolve test vs live (key-derived).
  const stripeMode = resolveBillingMode(deps.env);

  const amountMicros = amountCents * MICRO_PER_CENT;
  const idempotencyKey = `wallet-topup-${orgId}-${amountCents}-${utcDayKey(deps.now())}`;

  // 5) Create the Checkout Session as a PLATFORM charge (no { stripeAccount }, no
  //    application fee). The metadata carries everything the webhook needs to
  //    credit the right wallet idempotently on the session id.
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      success_url: `${deps.baseUrl}/build/wallet?topup=success`,
      cancel_url: `${deps.baseUrl}/build/wallet?topup=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "SeldonFrame build wallet top-up",
              description: `Adds $${(amountCents / 100).toFixed(2)} to your prepaid build balance.`,
            },
          },
        },
      ],
      metadata: {
        type: "wallet_topup",
        orgId,
        amountMicros: String(amountMicros),
        stripeMode,
      },
    },
    { idempotencyKey },
  );

  return { ok: true, url: session.url ?? null, sessionId: session.id, stripeMode };
}
