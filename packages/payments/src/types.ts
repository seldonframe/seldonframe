import { z } from "zod";

export const paymentRecordStatusSchema = z.enum(["pending", "completed", "failed", "refunded"]);
export const subscriptionStatusSchema = z.enum(["active", "past_due", "cancelled"]);

export type PaymentRecordStatus = z.infer<typeof paymentRecordStatusSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const createCheckoutSessionInputSchema = z.object({
  orgId: z.string().uuid(),
  contactId: z.string().uuid().optional().nullable(),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3).default("USD"),
  sourceBlock: z.enum(["booking", "landing", "manual"]),
  sourceId: z.string().optional(),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  customerEmail: z.string().email().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type CreateCheckoutSessionInput = z.infer<typeof createCheckoutSessionInputSchema>;

export const stripeWebhookEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  livemode: z.boolean(),
});

export type StripeWebhookEvent = z.infer<typeof stripeWebhookEventSchema>;

export const stripeConnectTokenResponseSchema = z.object({
  stripe_user_id: z.string(),
  access_token: z.string().optional(),
  stripe_publishable_key: z.string().optional(),
});

export type StripeConnectTokenResponse = z.infer<typeof stripeConnectTokenResponseSchema>;
