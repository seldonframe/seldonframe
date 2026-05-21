// packages/crm/src/lib/proposals/checkout.ts
// 2026-05-19 — Proposal Builder. Pure builder for Stripe Checkout session
// params. Direct charges on the agency's connected account (the route
// handler passes the `stripeAccount` option to stripe.checkout.sessions.create).
// Spec: §"Acceptance + Stripe Checkout".
// 2026-05-20 — Extended: optional one-time setup fee (Phase A).

import type Stripe from "stripe";

export type BuildCheckoutSessionParamsInput = {
  proposalId: string;
  previewWorkspaceId: string | null;
  prospectEmail: string;
  prospectName: string;
  monthlyPriceCents: number;
  setupFeeCents?: number;
  signedToken: string;
  baseUrl: string;
};

export function buildCheckoutSessionParams(
  input: BuildCheckoutSessionParamsInput,
): Stripe.Checkout.SessionCreateParams {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

  if (input.setupFeeCents && input.setupFeeCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: input.setupFeeCents,
        product_data: { name: `${input.prospectName} — setup fee` },
      },
    });
  }

  lineItems.push({
    quantity: 1,
    price_data: {
      currency: "usd",
      unit_amount: input.monthlyPriceCents,
      recurring: { interval: "month" },
      product_data: {
        name: `${input.prospectName} — monthly`,
      },
    },
  });

  return {
    mode: "subscription",
    line_items: lineItems,
    customer_email: input.prospectEmail,
    subscription_data: {
      metadata: {
        proposal_id: input.proposalId,
        preview_workspace_id: input.previewWorkspaceId ?? "",
        signed_token: input.signedToken,
      },
    },
    success_url: `${input.baseUrl}/p/${input.signedToken}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.baseUrl}/p/${input.signedToken}/cancel`,
  };
}
