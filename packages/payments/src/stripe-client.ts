import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function resolveStripeSecretKey() {
  const direct = process.env.STRIPE_SECRET_KEY?.trim();
  if (direct) {
    return direct;
  }

  if (process.env.NODE_ENV === "production") {
    return process.env.STRIPE_LIVE_SECRET_KEY?.trim() || process.env.STRIPE_TEST_SECRET_KEY?.trim() || null;
  }

  return process.env.STRIPE_TEST_SECRET_KEY?.trim() || process.env.STRIPE_LIVE_SECRET_KEY?.trim() || null;
}

export function getStripeClient() {
  const secretKey = resolveStripeSecretKey();
  if (!secretKey) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: "2025-08-27.basil",
    });
  }

  return stripeClient;
}
