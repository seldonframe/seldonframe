// packages/crm/src/lib/proposals/checkout.ts
// 2026-05-19 — Proposal Builder. Pure builder for Stripe Checkout session
// params. Direct charges on the agency's connected account (the route
// handler passes the `stripeAccount` option to stripe.checkout.sessions.create).
// Spec: §"Acceptance + Stripe Checkout".
// 2026-05-20 — Extended: optional one-time setup fee (Phase A).

import type Stripe from "stripe";
import { GMV_FEE_PERCENT } from "@/lib/billing/gmv";

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
    // 2026-05-21 — Session-level metadata. Stripe echoes this back on the
    // checkout.session.completed webhook event as `session.metadata`. The
    // subscription_data.metadata below ALSO gets set on the resulting
    // Subscription object, but reading it from there requires either
    // hydrating session.subscription (which is just a string on the event
    // payload) or fetching the subscription via Stripe API. Setting it
    // here gives the webhook a direct path to find the proposal_id.
    metadata: {
      proposal_id: input.proposalId,
      preview_workspace_id: input.previewWorkspaceId ?? "",
      signed_token: input.signedToken,
    },
    subscription_data: {
      // 2026-06-22 — 2% GMV application fee on the SMB's OWN sale. This
      // checkout is a DIRECT charge on the agency's connected account
      // (the accept route passes { stripeAccount }), so the fee is the
      // platform's cut of the SMB's revenue — NOT the platform $29.
      application_fee_percent: GMV_FEE_PERCENT,
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
