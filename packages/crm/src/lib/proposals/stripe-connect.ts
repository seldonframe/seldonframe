// packages/crm/src/lib/proposals/stripe-connect.ts
// 2026-05-19 — Proposal Builder. Pure functions that build Stripe API
// params so the route handlers can be tested without spinning up the
// SDK. The actual stripe.accounts.create / stripe.accountLinks.create
// calls live in the route handlers. Spec: §"Stripe Connect Express".

import type Stripe from "stripe";

export type BuildConnectAccountParamsInput = {
  agencyName: string;
  agencyEmail: string;
  country?: string;
};

export function buildConnectAccountParams(
  input: BuildConnectAccountParamsInput,
): Stripe.AccountCreateParams {
  return {
    type: "express",
    country: input.country ?? "US",
    email: input.agencyEmail,
    business_profile: { name: input.agencyName },
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
  };
}

export type BuildAccountLinkParamsInput = {
  stripeAccountId: string;
  baseUrl: string;
};

export function buildAccountLinkParams(
  input: BuildAccountLinkParamsInput,
): Stripe.AccountLinkCreateParams {
  return {
    account: input.stripeAccountId,
    type: "account_onboarding",
    return_url: `${input.baseUrl}/api/v1/proposals/connect/return?account_id=${input.stripeAccountId}`,
    refresh_url: `${input.baseUrl}/proposals/onboarding?retry=1`,
  };
}

export function getStripeClient(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const StripeCtor = require("stripe") as typeof Stripe;
  return new StripeCtor(secretKey, { apiVersion: "2025-08-27.basil" });
}
