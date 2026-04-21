// Unlike EmailProvider / SmsProvider (one send call), PaymentProvider
// has several orthogonal operations (invoice vs subscription vs refund)
// driven by a state machine rather than a single send → reply turn.
// The interface is still small — just the primitives we need for v1 —
// but it doesn't pretend to look like Email/SMS.

export type PaymentProviderId = "stripe";

export type InvoiceLineItem = {
  description: string;
  quantity: number;
  unitAmount: number;
  currency?: string;
  metadata?: Record<string, string>;
};

export type CreateInvoiceInput = {
  orgId: string;
  contactId: string | null;
  customerEmail: string;
  customerName?: string;
  items: InvoiceLineItem[];
  currency?: string;
  dueAt?: Date | null;
  autoAdvance?: boolean;
  metadata?: Record<string, string>;
};

export type CreateInvoiceResult = {
  externalInvoiceId: string;
  externalCustomerId: string;
  hostedInvoiceUrl: string | null;
  status: string;
  subtotal: number;
  total: number;
  amountDue: number;
};

export type SendInvoiceResult = {
  status: string;
  sentAt: Date;
};

export type VoidInvoiceResult = {
  status: string;
  voidedAt: Date;
};

export type CreateSubscriptionInput = {
  orgId: string;
  contactId: string | null;
  customerEmail: string;
  customerName?: string;
  // Stripe requires a Price id (created by the SMB in their dashboard).
  // v1 surface assumes the Price exists; price-creation tooling is v1.1.
  priceId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
};

export type CreateSubscriptionResult = {
  externalSubscriptionId: string;
  externalCustomerId: string;
  externalPriceId: string;
  productName: string | null;
  status: string;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  trialEnd: Date | null;
};

export type CancelSubscriptionInput = {
  orgId: string;
  externalSubscriptionId: string;
  immediate?: boolean;
};

export type CancelSubscriptionResult = {
  status: string;
  canceledAt: Date | null;
  cancelAt: Date | null;
};

export type RefundPaymentInput = {
  orgId: string;
  externalPaymentIntentId: string;
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
};

export type RefundPaymentResult = {
  externalRefundId: string;
  status: string;
  amount: number;
  currency: string;
};

export interface PaymentProvider {
  readonly id: PaymentProviderId;

  isConfigured(orgId: string): Promise<boolean>;

  createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult>;
  sendInvoice(orgId: string, externalInvoiceId: string): Promise<SendInvoiceResult>;
  voidInvoice(orgId: string, externalInvoiceId: string): Promise<VoidInvoiceResult>;

  createSubscription(input: CreateSubscriptionInput): Promise<CreateSubscriptionResult>;
  cancelSubscription(input: CancelSubscriptionInput): Promise<CancelSubscriptionResult>;

  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
}

export class PaymentProviderError extends Error {
  readonly provider: PaymentProviderId;
  readonly code: string | null;
  readonly retriable: boolean;
  readonly details?: unknown;

  constructor(
    provider: PaymentProviderId,
    message: string,
    options: { code?: string | null; retriable?: boolean; details?: unknown } = {}
  ) {
    super(message);
    this.name = "PaymentProviderError";
    this.provider = provider;
    this.code = options.code ?? null;
    this.retriable = options.retriable ?? false;
    this.details = options.details;
  }
}
