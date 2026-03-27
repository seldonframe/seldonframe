import Stripe from "stripe";
import { getStripeClient } from "./stripe-client";

export function verifyStripeWebhook({ payload, signature }: { payload: string | Buffer; signature: string }) {
  const stripe = getStripeClient();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe || !webhookSecret) {
    throw new Error("Stripe webhook verification is not configured.");
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export function mapStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "payment_intent.succeeded":
      return { type: "payment.completed", event } as const;
    case "payment_intent.payment_failed":
      return { type: "payment.failed", event } as const;
    case "customer.subscription.created":
      return { type: "subscription.created", event } as const;
    case "customer.subscription.deleted":
      return { type: "subscription.cancelled", event } as const;
    case "invoice.created":
      return { type: "invoice.created", event } as const;
    default:
      return { type: "ignored", event } as const;
  }
}
