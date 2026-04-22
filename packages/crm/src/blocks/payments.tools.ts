// Payments block — tool schemas (Scope 3 Step 2b.2 block 4 — Payments).
//
// Zod-authored schemas for the 12 Payments MCP tools. Source of truth
// for the tool surface; the emit step renders JSON Schema into
// payments.block.md on next `pnpm emit:blocks`.
//
// 12 tools total (matches skills/mcp-server/src/tools.js):
//   Coupons (1):       create_coupon (lines 866-900 — lives in the
//                      booking section of tools.js but is a payments
//                      primitive: Stripe coupon + per-contact unique
//                      promotion code on the connected account)
//   Invoices (5):      create_invoice, list_invoices, get_invoice,
//                      send_invoice, void_invoice
//   Subscriptions (3): create_subscription, list_subscriptions,
//                      cancel_subscription
//   Payments (3):      list_payments, get_payment, refund_payment
//
// Stripe-complexity containment (per Max's Payments-migration directive):
//
// Payments has the most complex tool surface of any block — Stripe
// Connect routing (per-workspace connected accounts via application
// `stripeAccount` header), dual-identifier objects (paymentIntent +
// charge, subscription + price, coupon + promotion code), and
// webhook-driven state transitions where the create-response is
// provisional and the authoritative state arrives later.
//
// ALL of that complexity lives HERE, not in `lib/agents/types.ts`.
// The shared types (ConversationExit / Predicate / ExtractField /
// Step) remain stable across 2b.2. If Payments' schema ever needs
// a shared primitive extension, that's a stop-and-flag signal —
// the abstraction is wrong, not the block.
//
// Webhook-driven events: the block's `produces` list in
// payments.block.md is a superset of the sum of tool `emits` because
// events like `payment.completed`, `invoice.paid`, `subscription.renewed`,
// `subscription.trial_will_end` are fired by Stripe webhooks, not by
// any specific synchronous tool call. The validator only enforces
// `tool.emits ⊆ block.produces`, not the reverse.
//
// CRITICAL — create_coupon return shape (the validator's showcase
// test case): must be `{ data: { couponId, promotionCodeId, code } }`
// with `code: z.string()` at the top level of `data`. Win-Back
// archetype threads `{{coupon.code}}` through multiple downstream
// steps (create_activity metadata → email body → sms body); the
// validator's namesake test is "catches `{{coupon.couponCode}}` when
// the tool returns `{data:{code,...}}`". Breaking this field name
// breaks both the validator's critical test AND Win-Back's archetype
// synthesis in one go.

import { z } from "zod";

import type { ToolDefinition } from "../lib/blocks/contract-v2";

// ---------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------

const workspaceIdArg = z
  .string()
  .uuid()
  .optional()
  .describe("Optional. Falls back to the active workspace.");

const paymentStatus = z.enum([
  "pending",
  "completed",
  "failed",
  "refunded",
  "partially_refunded",
  "disputed",
]);

const invoiceStatus = z.enum(["draft", "open", "paid", "past_due", "voided", "uncollectible"]);

const subscriptionStatus = z.enum([
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "incomplete_expired",
  "unpaid",
]);

const subscriptionInterval = z.enum(["day", "week", "month", "year"]);

const refundReason = z.enum(["duplicate", "fraudulent", "requested_by_customer"]);

const couponDuration = z.enum(["once", "forever", "repeating"]);

const sourceBlock = z.enum(["booking", "landing", "manual", "subscription", "invoice"]);

// ---------------------------------------------------------------------
// Return shapes — narrow to the fields downstream {{interpolation}}
// is most likely to reach for. Stripe's full response shape is huge;
// we expose only the SMB-facing fields.
// ---------------------------------------------------------------------

const InvoiceItemRecord = z.object({
  id: z.string().uuid(),
  description: z.string(),
  quantity: z.number().int().positive(),
  unitAmount: z.number().nonnegative(),
  amount: z.number().nonnegative(),
  currency: z.string(),
});

const InvoiceRecord = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  stripeInvoiceId: z.string(),
  stripeAccountId: z.string(),
  stripeCustomerId: z.string().nullable(),
  number: z.string().nullable(),
  status: invoiceStatus,
  currency: z.string(),
  subtotal: z.number().nonnegative(),
  tax: z.number().nonnegative(),
  total: z.number().nonnegative(),
  amountPaid: z.number().nonnegative(),
  amountDue: z.number().nonnegative(),
  dueAt: z.string().datetime().nullable(),
  sentAt: z.string().datetime().nullable(),
  paidAt: z.string().datetime().nullable(),
  voidedAt: z.string().datetime().nullable(),
  hostedInvoiceUrl: z.string().url().nullable(),
  createdAt: z.string().datetime(),
});

const SubscriptionRecord = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  stripeSubscriptionId: z.string(),
  stripeAccountId: z.string(),
  stripeCustomerId: z.string(),
  stripePriceId: z.string(),
  productName: z.string().nullable(),
  status: subscriptionStatus,
  amount: z.number().nonnegative(),
  currency: z.string(),
  interval: subscriptionInterval,
  intervalCount: z.number().int().positive(),
  currentPeriodStart: z.string().datetime(),
  currentPeriodEnd: z.string().datetime(),
  cancelAt: z.string().datetime().nullable(),
  canceledAt: z.string().datetime().nullable(),
  trialEnd: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});

const PaymentRecord = z.object({
  id: z.string().uuid(),
  contactId: z.string().uuid().nullable(),
  stripePaymentIntentId: z.string(),
  stripeChargeId: z.string().nullable(),
  stripeAccountId: z.string(),
  amount: z.number().nonnegative(),
  currency: z.string(),
  status: paymentStatus,
  sourceBlock: sourceBlock,
  refundedAmount: z.number().nonnegative(),
  refundedAt: z.string().datetime().nullable(),
  disputedAt: z.string().datetime().nullable(),
  stripeDisputeId: z.string().nullable(),
  createdAt: z.string().datetime(),
});

// ---------------------------------------------------------------------
// Coupons (1)
// ---------------------------------------------------------------------

export const createCoupon: ToolDefinition = {
  name: "create_coupon",
  description:
    "Create a Stripe coupon + matching per-contact redeemable promotion code on the workspace's connected Stripe account. Use for Win-Back / retention agents that need UNIQUE codes per recipient (shared codes are vulnerable to abuse + lose attribution signal). Default max_redemptions=1 + auto-generated code string. Requires the workspace to have completed Stripe Connect onboarding.",
  args: z.object({
    percent_off: z
      .number()
      .positive()
      .max(100)
      .optional()
      .describe("Discount percentage (0 < n ≤ 100). Either percent_off or amount_off is required."),
    amount_off: z
      .number()
      .positive()
      .optional()
      .describe("Flat discount in the currency's major unit (e.g., 25.00 for $25 off). Either percent_off or amount_off is required."),
    currency: z.string().length(3).optional().describe("Only used with amount_off. 3-letter ISO code. Defaults to usd."),
    duration: couponDuration.optional().describe("'once' (default) | 'forever' | 'repeating'. 'repeating' requires duration_in_months."),
    duration_in_months: z.number().int().positive().optional().describe("Required when duration='repeating'."),
    name: z.string().max(60).optional().describe("Optional display name for the coupon (≤60 chars)."),
    code: z.string().optional().describe("Optional fixed redeemable code string. If omitted, Stripe auto-generates one."),
    max_redemptions: z.number().int().positive().optional().describe("Max total redemptions. Default 1 — per-contact unique code."),
    expires_at: z.string().datetime().optional().describe("Optional ISO timestamp. Code becomes invalid after this moment. Prefer expires_in_days for agent archetypes."),
    expires_in_days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe("Relative expiry: code becomes invalid N days after this call fires (1–365). Preferred over expires_at for agent archetypes so the window stays meaningful no matter when the agent was last deployed."),
    workspace_id: workspaceIdArg,
  }),
  // CRITICAL: `code` at top level of `data`. Win-Back threads
  // {{coupon.code}} → {{coupon.couponId}} → {{coupon.promotionCodeId}}
  // through downstream steps. The validator's namesake test relies on
  // this exact shape.
  returns: z.object({
    data: z.object({
      couponId: z.string().describe("Stripe coupon id (cpn_...)."),
      promotionCodeId: z.string().describe("Stripe promotion code id (promo_...) — the redeemable wrapper around the coupon."),
      code: z.string().describe("The redeemable code string the customer types at checkout."),
    }),
  }),
  emits: [],
};

// ---------------------------------------------------------------------
// Invoices (5)
// ---------------------------------------------------------------------

export const createInvoice: ToolDefinition = {
  name: "create_invoice",
  description:
    "Draft a Stripe invoice on the workspace's connected Stripe account. Invoice is created but not sent — call send_invoice separately so agents can review before dispatch. Contact must have an email.",
  args: z.object({
    contact_id: z.string().uuid().describe("CRM contact to bill."),
    items: z
      .array(
        z.object({
          description: z.string().describe("Line item description."),
          quantity: z.number().int().positive().optional().describe("Quantity. Default 1."),
          unit_amount: z.number().nonnegative().describe("Unit amount in the workspace's currency's major unit (e.g., 200.00 for $200)."),
          currency: z.string().length(3).optional().describe("Optional per-line currency override."),
        }),
      )
      .min(1)
      .describe("Line items. At least one required."),
    currency: z.string().length(3).optional().describe("3-letter ISO currency code. Defaults to USD."),
    due_at: z.string().datetime().optional().describe("ISO timestamp for invoice due date. Defaults to 30 days out."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      invoice: InvoiceRecord,
      items: z.array(InvoiceItemRecord),
    }),
  }),
  emits: ["invoice.created"],
};

export const listInvoices: ToolDefinition = {
  name: "list_invoices",
  description: "List workspace invoices (draft + sent + paid + past_due + voided), newest first.",
  args: z.object({
    limit: z.number().int().positive().max(200).optional().describe("Max rows (default 50, max 200)."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: z.array(InvoiceRecord) }),
  emits: [],
};

export const getInvoice: ToolDefinition = {
  name: "get_invoice",
  description: "Fetch an invoice + its line items + hosted invoice URL (for payment).",
  args: z.object({
    invoice_id: z.string().uuid().describe("Invoice ID returned from create_invoice or list_invoices."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      invoice: InvoiceRecord,
      items: z.array(InvoiceItemRecord),
    }),
  }),
  emits: [],
};

export const sendInvoice: ToolDefinition = {
  name: "send_invoice",
  description:
    "Dispatch a draft invoice to the contact via Stripe (Stripe emails the invoice + provides a hosted pay page).",
  args: z.object({
    invoice_id: z.string().uuid().describe("Invoice to send."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      invoice: InvoiceRecord,
    }),
  }),
  emits: ["invoice.sent"],
};

export const voidInvoice: ToolDefinition = {
  name: "void_invoice",
  description:
    "Void an invoice (undo a billing error). Only valid for draft / open invoices; paid invoices must be refunded instead.",
  args: z.object({
    invoice_id: z.string().uuid().describe("Invoice to void."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      invoice: InvoiceRecord,
    }),
  }),
  emits: ["invoice.voided"],
};

// ---------------------------------------------------------------------
// Subscriptions (3)
// ---------------------------------------------------------------------

export const createSubscription: ToolDefinition = {
  name: "create_subscription",
  description:
    "Start a recurring subscription for a contact against a Stripe Price id. The Price must already exist in the workspace's Stripe dashboard — v1 does not create Prices through MCP.",
  args: z.object({
    contact_id: z.string().uuid().describe("CRM contact to subscribe."),
    price_id: z.string().describe("Stripe Price id (e.g., 'price_1ABC...') from the workspace's Stripe dashboard."),
    trial_days: z.number().int().nonnegative().optional().describe("Optional free trial days before first charge."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      subscription: SubscriptionRecord,
    }),
  }),
  emits: ["subscription.created"],
};

export const listSubscriptions: ToolDefinition = {
  name: "list_subscriptions",
  description: "List workspace subscriptions (active + trialing + past_due + canceled), newest first.",
  args: z.object({
    limit: z.number().int().positive().max(200).optional().describe("Max rows (default 50, max 200)."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: z.array(SubscriptionRecord) }),
  emits: [],
};

export const cancelSubscription: ToolDefinition = {
  name: "cancel_subscription",
  description:
    "Cancel a subscription. Default: cancel at period end (contact keeps access until renewal date). Pass immediate=true for an instant termination + prorated refund.",
  args: z.object({
    subscription_id: z.string().uuid().describe("Subscription to cancel."),
    immediate: z.boolean().optional().describe("If true, terminate now. Default: cancel at period end."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      subscription: SubscriptionRecord,
    }),
  }),
  emits: ["subscription.cancelled"],
};

// ---------------------------------------------------------------------
// Payments (3)
// ---------------------------------------------------------------------

export const listPayments: ToolDefinition = {
  name: "list_payments",
  description:
    "List recent payments (completed + failed + refunded + disputed) across the workspace, newest first.",
  args: z.object({
    limit: z.number().int().positive().max(200).optional().describe("Max rows (default 50, max 200)."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: z.array(PaymentRecord) }),
  emits: [],
};

export const getPayment: ToolDefinition = {
  name: "get_payment",
  description: "Fetch a single payment record with status + refund/dispute state.",
  args: z.object({
    payment_id: z.string().uuid().describe("Payment ID from list_payments."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({ data: PaymentRecord }),
  emits: [],
};

export const refundPayment: ToolDefinition = {
  name: "refund_payment",
  description:
    "Refund a payment. Omit amount to refund the full payment; pass amount for a partial refund. reason should be 'duplicate' | 'fraudulent' | 'requested_by_customer'.",
  args: z.object({
    payment_id: z.string().uuid().describe("Payment to refund."),
    amount: z.number().positive().optional().describe("Optional partial-refund amount in the payment's currency. Omit to refund in full."),
    reason: refundReason.optional().describe("Default: requested_by_customer."),
    workspace_id: workspaceIdArg,
  }),
  returns: z.object({
    data: z.object({
      payment: PaymentRecord,
      refundedAmount: z.number().nonnegative(),
    }),
  }),
  emits: ["payment.refunded"],
};

// ---------------------------------------------------------------------
// Exported tuple — order matches tools.js for byte-stable emission.
// ---------------------------------------------------------------------

export const PAYMENTS_TOOLS: readonly ToolDefinition[] = [
  createCoupon,
  createInvoice,
  listInvoices,
  getInvoice,
  sendInvoice,
  voidInvoice,
  createSubscription,
  listSubscriptions,
  cancelSubscription,
  listPayments,
  getPayment,
  refundPayment,
] as const;
