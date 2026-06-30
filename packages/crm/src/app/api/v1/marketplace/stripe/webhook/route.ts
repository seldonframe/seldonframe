import { NextResponse } from "next/server";
import { verifyStripeWebhookWithSecret } from "@seldonframe/payments";
import {
  updatePurchaseByCheckoutId,
  updatePurchaseBySubscriptionId,
  updatePurchaseByCustomerId,
} from "@/lib/marketplace/billing/purchases-store";
import {
  handleMarketplaceWebhookRequest,
  type MarketplaceWebhookStore,
} from "@/lib/marketplace/billing/webhook-apply";
import { provisionBuyerAgentFromPurchaseRow } from "@/lib/marketplace/actions";
import { applyWalletTopupWebhook } from "@/lib/build/wallet-webhook-apply";
import { creditTopupToWallet } from "@/lib/build/wallet-store";

export const runtime = "nodejs";

// #139 P4 — the signature-verified MARKETPLACE billing webhook.
//
// Distinct from the platform billing webhook (/api/webhooks/stripe-billing,
// SeldonFrame's own subscription) and the proposals Connect webhook
// (/api/webhooks/stripe/connect). This endpoint receives the lifecycle events
// for the #139 marketplace_purchases settlement ledger (agent buys on a seller's
// connected account) and flips status: active / past_due / canceled.
//
// MIRRORS the proposals Connect webhook signature pattern EXACTLY:
//   • read the RAW body via request.text() (signature is over these bytes)
//   • verify the Stripe signature against a dedicated secret
//   • bad / missing signature → 400, do NOT act (fail-closed)
//   • inert without the secret (→ 400 "webhook_not_configured")
//
// MONEY-SAFE: a webhook moves NO money — verify + flip a status only. No charge,
// no Stripe write. Idempotent on the natural key (Stripe re-delivery re-writes
// the same status). The pure decision (webhook-handler.ts) + the verify/apply
// gate (webhook-apply.ts) are unit-tested with a fake Stripe.

/** The dedicated marketplace webhook secret. A marketplace-specific endpoint
 *  secret keeps these events isolated from the platform/Connect endpoints. */
function getMarketplaceWebhookSecret(): string | null {
  return (
    process.env.STRIPE_MARKETPLACE_WEBHOOK_SECRET?.trim() ||
    null
  );
}

/** DB-backed store: the reconciliation patchers (checkout / subscription /
 *  customer — the customer patcher backs the P3 ordering-race fallback). */
const store: MarketplaceWebhookStore = {
  updateByCheckoutId: (checkoutId, patch) => updatePurchaseByCheckoutId(checkoutId, patch),
  updateBySubscriptionId: (subscriptionId, patch) => updatePurchaseBySubscriptionId(subscriptionId, patch),
  updateByCustomerId: (customerId, patch) => updatePurchaseByCustomerId(customerId, patch),
};

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const secret = getMarketplaceWebhookSecret();

  const result = await handleMarketplaceWebhookRequest(
    { rawBody, signature, secret },
    {
      // The real verify: HMAC over the raw body with the marketplace secret.
      // Throws on a bad/missing signature → the applier returns 400, fail-closed.
      verify: ({ rawBody: payload, signature: sig, secret: whsec }) =>
        verifyStripeWebhookWithSecret({ payload, signature: sig, webhookSecret: whsec }),
      store,
      // On activation, provision the buyer-owned deployment of the bought agent
      // so the setup wizard has a target. Best-effort (errors swallowed inside
      // the applier) + money-safe (settlement already happened; this writes only
      // a template + a draft deployment) + idempotent (one deployment per
      // buyer+listing). A soul purchase is a no-op here.
      onActivated: async (row) => {
        await provisionBuyerAgentFromPurchaseRow({
          buyerOrgId: row.buyerOrgId,
          listingId: row.listingId,
        });
      },
    },
  );

  if (result.status !== 200) {
    console.warn("[marketplace-webhook] rejected", { status: result.status, ...result.body });
  } else if (result.body.handled) {
    console.info("[marketplace-webhook] applied", result.body);
  }

  // P2 — SECOND, isolated pass: credit a prepaid-wallet TOP-UP off the same
  // endpoint. Re-verifies the same raw body against the same marketplace secret
  // (so the pure marketplace settlement path above stays 100% untouched) and
  // credits the wallet ONCE (idempotent on the Stripe session id). A non-wallet
  // event is a no-op here. Money-safe: this moves only the ledger — the top-up's
  // money already settled in Stripe. Its errors are swallowed so a wallet hiccup
  // can never change the marketplace response.
  let walletStatus = 200;
  let walletBody: Record<string, unknown> = { credited: false };
  try {
    const walletResult = await applyWalletTopupWebhook(
      { rawBody, signature, secret },
      {
        verify: ({ rawBody: payload, signature: sig, secret: whsec }) =>
          verifyStripeWebhookWithSecret({ payload, signature: sig, webhookSecret: whsec }),
        credit: (input) =>
          creditTopupToWallet({
            orgId: input.orgId,
            amountMicros: input.amountMicros,
            idempotencyKey: input.idempotencyKey,
            stripeMode: input.stripeMode,
            stripeRef: input.stripeRef,
          }),
      },
    );
    walletStatus = walletResult.status;
    walletBody = walletResult.body;
    if (walletBody.credited) console.info("[marketplace-webhook] wallet topup credited", walletBody);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[marketplace-webhook] wallet topup error", detail);
  }

  // Prefer the marketplace result's status; if the marketplace pass was a no-op
  // 200 but the wallet pass credited, surface the wallet outcome in the body.
  if (result.status === 200 && !result.body.handled && walletBody.credited) {
    return NextResponse.json({ ...result.body, wallet: walletBody }, { status: 200 });
  }
  // If the marketplace pass rejected on signature (400) the wallet pass will have
  // rejected identically — keep the marketplace status as the canonical response.
  void walletStatus;
  return NextResponse.json(result.body, { status: result.status });
}
