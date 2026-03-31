import Stripe from "stripe";
import { getStripeClient } from "./stripe-client";

export function verifyStripeWebhook({ payload, signature }: { payload: string | Buffer; signature: string }) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  return verifyStripeWebhookWithSecret({ payload, signature, webhookSecret });
}

export function verifyStripeWebhookWithSecret({
  payload,
  signature,
  webhookSecret,
}: {
  payload: string | Buffer;
  signature: string;
  webhookSecret: string | undefined;
}) {
  const stripe = getStripeClient();

  if (!stripe || !webhookSecret) {
    throw new Error("Stripe webhook verification is not configured.");
  }

  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export function mapStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
      return { type: "checkout.completed", event } as const;
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
