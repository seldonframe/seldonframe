// packages/crm/src/lib/proposals/checkout.ts
// 2026-05-19 — Proposal Builder. Pure builder for Stripe Checkout session
// params. Direct charges on the agency's connected account (the route
// handler passes the `stripeAccount` option to stripe.checkout.sessions.create).
// Spec: §"Acceptance + Stripe Checkout".
// 2026-05-20 — Extended: optional one-time setup fee (Phase A).

import type Stripe from "stripe";
import { gmvFeePercentForTier } from "@/lib/billing/gmv";
import type { BillingTier } from "@/lib/billing/features";

export type BuildCheckoutSessionParamsInput = {
  proposalId: string;
  previewWorkspaceId: string | null;
  prospectEmail: string;
  prospectName: string;
  monthlyPriceCents: number;
  setupFeeCents?: number;
  signedToken: string;
  baseUrl: string;
  /**
   * 2026-07-10 — the SELLING (agency) org's resolved subscription tier.
   * Pure input so this function stays DB-free; callers resolve the tier
   * via the existing billing subscription helper before calling. Omitted
   * (undefined) callers get the pre-solo default (2%) from
   * `gmvFeePercentForTier` — see lib/billing/gmv.ts for the tier→fee table.
   */
  sellerTier?: BillingTier | null;
};

export function buildCheckoutSessionParams(
  input: BuildCheckoutSessionParamsInput,
): Stripe.Checkout.SessionCreateParams {
  const feePercent = gmvFeePercentForTier(input.sellerTier);
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
      // 2026-06-22 — GMV application fee on the SMB's OWN sale. This
      // checkout is a DIRECT charge on the agency's connected account
      // (the accept route passes { stripeAccount }), so the fee is the
      // platform's cut of the SMB's revenue — NOT the platform $29.
      // 2026-07-10 — tier-scoped: 0% on agency tiers ($99+), 2% on solo
      // tiers (builder/managed) — see gmvFeePercentForTier. Stripe
      // rejects application_fee_percent: 0 on some account types, so the
      // field is OMITTED entirely (not set to 0) when the fee is waived.
      ...(feePercent > 0 ? { application_fee_percent: feePercent } : {}),
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
