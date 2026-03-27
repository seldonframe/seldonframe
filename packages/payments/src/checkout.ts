import { createCheckoutSessionInputSchema, type CreateCheckoutSessionInput } from "./types";
import { getStripeClient } from "./stripe-client";

export async function createCheckoutSession(input: CreateCheckoutSessionInput) {
  const payload = createCheckoutSessionInputSchema.parse(input);
  const stripe = getStripeClient();

  if (!stripe) {
    throw new Error("Stripe is not configured.");
  }

  return stripe.checkout.sessions.create({
    mode: "payment",
    success_url: payload.successUrl,
    cancel_url: payload.cancelUrl,
    customer_email: payload.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: payload.currency.toLowerCase(),
          unit_amount: Math.round(payload.amount * 100),
          product_data: {
            name: `${payload.sourceBlock} payment`,
          },
        },
      },
    ],
    metadata: {
      orgId: payload.orgId,
      contactId: payload.contactId,
      sourceBlock: payload.sourceBlock,
      sourceId: payload.sourceId ?? "",
      ...(payload.metadata ?? {}),
    },
  });
}
