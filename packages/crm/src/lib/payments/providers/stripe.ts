import { and, desc, eq } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import {
  PaymentProviderError,
  type CancelSubscriptionInput,
  type CancelSubscriptionResult,
  type CreateInvoiceInput,
  type CreateInvoiceResult,
  type CreateSubscriptionInput,
  type CreateSubscriptionResult,
  type PaymentProvider,
  type RefundPaymentInput,
  type RefundPaymentResult,
  type SendInvoiceResult,
  type VoidInvoiceResult,
} from "./interface";

// Stripe Connect Standard: every API call must be scoped to the SMB's
// connected account via the Stripe-Account header so funds + customers
// + invoices all live on the SMB's account, not the platform's.

let client: Stripe | null = null;

function getStripeClient() {
  if (!client) {
    const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
    if (!secretKey) return null;
    client = new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
  }
  return client;
}

async function requireConnectedAccount(orgId: string) {
  const [row] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, orgId), eq(stripeConnections.isActive, true)))
    .orderBy(desc(stripeConnections.connectedAt))
    .limit(1);

  if (!row?.stripeAccountId) {
    throw new PaymentProviderError("stripe", "Stripe Connect account not configured", {
      code: "no_connect_account",
      retriable: false,
    });
  }
  return row.stripeAccountId;
}

async function findOrCreateStripeCustomer(params: {
  stripe: Stripe;
  stripeAccount: string;
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}) {
  // Search by email on the connected account first so we don't create
  // duplicate customers across invocations.
  const existing = await params.stripe.customers.list(
    { email: params.email, limit: 1 },
    { stripeAccount: params.stripeAccount }
  );
  if (existing.data.length > 0) {
    return existing.data[0];
  }

  return params.stripe.customers.create(
    {
      email: params.email,
      name: params.name,
      metadata: params.metadata,
    },
    { stripeAccount: params.stripeAccount }
  );
}

function stripeUnixToDate(value: number | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value * 1000);
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",

  async isConfigured(orgId: string) {
    if (!getStripeClient()) return false;
    const [row] = await db
      .select({ stripeAccountId: stripeConnections.stripeAccountId })
      .from(stripeConnections)
      .where(and(eq(stripeConnections.orgId, orgId), eq(stripeConnections.isActive, true)))
      .limit(1);
    return Boolean(row?.stripeAccountId);
  },

  async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const stripe = getStripeClient();
    if (!stripe) {
      throw new PaymentProviderError("stripe", "Stripe client not configured", { retriable: false });
    }
    const stripeAccount = await requireConnectedAccount(input.orgId);

    const customer = await findOrCreateStripeCustomer({
      stripe,
      stripeAccount,
      email: input.customerEmail,
      name: input.customerName,
      metadata: { seldonframe_contact_id: input.contactId ?? "" },
    });

    const currency = (input.currency ?? "USD").toLowerCase();

    // Create pending invoice items first, then draft the invoice.
    // Stripe requires items to exist before invoice creation.
    for (const item of input.items) {
      await stripe.invoiceItems.create(
        {
          customer: customer.id,
          amount: Math.round(item.unitAmount * (item.quantity ?? 1) * 100),
          currency: (item.currency ?? currency).toLowerCase(),
          description: item.description,
          quantity: item.quantity ?? 1,
          metadata: item.metadata,
        },
        { stripeAccount }
      );
    }

    const invoice = await stripe.invoices.create(
      {
        customer: customer.id,
        collection_method: "send_invoice",
        days_until_due: input.dueAt
          ? Math.max(1, Math.ceil((input.dueAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
          : 30,
        auto_advance: input.autoAdvance ?? false,
        metadata: {
          seldonframe_org_id: input.orgId,
          seldonframe_contact_id: input.contactId ?? "",
          ...(input.metadata ?? {}),
        },
      },
      { stripeAccount }
    );

    if (!invoice.id) {
      throw new PaymentProviderError("stripe", "Stripe returned no invoice id", { retriable: false });
    }

    return {
      externalInvoiceId: invoice.id,
      externalCustomerId: customer.id,
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      status: invoice.status ?? "draft",
      subtotal: (invoice.subtotal ?? 0) / 100,
      total: (invoice.total ?? 0) / 100,
      amountDue: (invoice.amount_due ?? 0) / 100,
    };
  },

  async sendInvoice(orgId: string, externalInvoiceId: string): Promise<SendInvoiceResult> {
    const stripe = getStripeClient();
    if (!stripe) {
      throw new PaymentProviderError("stripe", "Stripe client not configured", { retriable: false });
    }
    const stripeAccount = await requireConnectedAccount(orgId);

    const invoice = await stripe.invoices.sendInvoice(externalInvoiceId, undefined, { stripeAccount });
    return {
      status: invoice.status ?? "open",
      sentAt: new Date(),
    };
  },

  async voidInvoice(orgId: string, externalInvoiceId: string): Promise<VoidInvoiceResult> {
    const stripe = getStripeClient();
    if (!stripe) {
      throw new PaymentProviderError("stripe", "Stripe client not configured", { retriable: false });
    }
    const stripeAccount = await requireConnectedAccount(orgId);

    const invoice = await stripe.invoices.voidInvoice(externalInvoiceId, undefined, { stripeAccount });
    return {
      status: invoice.status ?? "void",
      voidedAt: new Date(),
    };
  },

  async createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult> {
    const stripe = getStripeClient();
    if (!stripe) {
      throw new PaymentProviderError("stripe", "Stripe client not configured", { retriable: false });
    }
    const stripeAccount = await requireConnectedAccount(input.orgId);

    const customer = await findOrCreateStripeCustomer({
      stripe,
      stripeAccount,
      email: input.customerEmail,
      name: input.customerName,
      metadata: { seldonframe_contact_id: input.contactId ?? "" },
    });

    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [{ price: input.priceId }],
        trial_period_days: input.trialDays,
        metadata: {
          seldonframe_org_id: input.orgId,
          seldonframe_contact_id: input.contactId ?? "",
          ...(input.metadata ?? {}),
        },
      },
      { stripeAccount }
    );

    const item = subscription.items.data[0];
    const price = item?.price as unknown as Stripe.Price | undefined;
    const product = price?.product;
    const productName =
      typeof product === "string"
        ? null
        : (product as Stripe.Product | null)?.name ?? null;

    const subscriptionWithPeriods = subscription as Stripe.Subscription & {
      current_period_start?: number | null;
      current_period_end?: number | null;
    };

    return {
      externalSubscriptionId: subscription.id,
      externalCustomerId: customer.id,
      externalPriceId: input.priceId,
      productName,
      status: subscription.status,
      amount: (price?.unit_amount ?? 0) / 100,
      currency: (price?.currency ?? "usd").toUpperCase(),
      interval: price?.recurring?.interval ?? "month",
      intervalCount: price?.recurring?.interval_count ?? 1,
      currentPeriodStart: stripeUnixToDate(subscriptionWithPeriods.current_period_start ?? null),
      currentPeriodEnd: stripeUnixToDate(subscriptionWithPeriods.current_period_end ?? null),
      trialEnd: stripeUnixToDate(subscription.trial_end),
    };
  },

  async cancelSubscription(input: CancelSubscriptionInput): Promise<CancelSubscriptionResult> {
    const stripe = getStripeClient();
    if (!stripe) {
      throw new PaymentProviderError("stripe", "Stripe client not configured", { retriable: false });
    }
    const stripeAccount = await requireConnectedAccount(input.orgId);

    // immediate=false schedules cancellation at period end (the common
    // case for "cancel at renewal"). immediate=true terminates now.
    if (input.immediate) {
      const subscription = await stripe.subscriptions.cancel(input.externalSubscriptionId, {
        stripeAccount,
      });
      return {
        status: subscription.status,
        canceledAt: stripeUnixToDate(subscription.canceled_at),
        cancelAt: null,
      };
    }

    const subscription = await stripe.subscriptions.update(
      input.externalSubscriptionId,
      { cancel_at_period_end: true },
      { stripeAccount }
    );
    return {
      status: subscription.status,
      canceledAt: null,
      cancelAt: stripeUnixToDate(subscription.cancel_at),
    };
  },

  async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    const stripe = getStripeClient();
    if (!stripe) {
      throw new PaymentProviderError("stripe", "Stripe client not configured", { retriable: false });
    }
    const stripeAccount = await requireConnectedAccount(input.orgId);

    const refund = await stripe.refunds.create(
      {
        payment_intent: input.externalPaymentIntentId,
        amount: input.amount ? Math.round(input.amount * 100) : undefined,
        reason: input.reason,
      },
      { stripeAccount }
    );

    return {
      externalRefundId: refund.id,
      status: refund.status ?? "pending",
      amount: (refund.amount ?? 0) / 100,
      currency: (refund.currency ?? "usd").toUpperCase(),
    };
  },
};
