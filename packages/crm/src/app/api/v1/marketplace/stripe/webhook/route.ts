import { NextResponse } from "next/server";
import { verifyStripeWebhookWithSecret } from "@seldonframe/payments";
import {
  updatePurchaseByCheckoutId,
  updatePurchaseBySubscriptionId,
} from "@/lib/marketplace/billing/purchases-store";
import {
  handleMarketplaceWebhookRequest,
  type MarketplaceWebhookStore,
} from "@/lib/marketplace/billing/webhook-apply";

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

/** DB-backed store: the P2/P3 reconciliation patchers. */
const store: MarketplaceWebhookStore = {
  updateByCheckoutId: (checkoutId, patch) => updatePurchaseByCheckoutId(checkoutId, patch),
  updateBySubscriptionId: (subscriptionId, patch) => updatePurchaseBySubscriptionId(subscriptionId, patch),
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
    },
  );

  if (result.status !== 200) {
    console.warn("[marketplace-webhook] rejected", { status: result.status, ...result.body });
  } else if (result.body.handled) {
    console.info("[marketplace-webhook] applied", result.body);
  }

  return NextResponse.json(result.body, { status: result.status });
}
