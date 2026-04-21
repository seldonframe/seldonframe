import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  contacts,
  invoiceItems,
  invoices,
  paymentRecords,
  subscriptions,
} from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { getPaymentProvider } from "./providers";
import type {
  CreateInvoiceInput,
  CreateSubscriptionInput,
  RefundPaymentInput,
} from "./providers";

async function loadContactEmail(orgId: string, contactId: string) {
  const [row] = await db
    .select({
      email: contacts.email,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
    })
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, contactId)))
    .limit(1);
  return row ?? null;
}

export type CreateInvoiceApiInput = {
  orgId: string;
  contactId: string;
  items: CreateInvoiceInput["items"];
  currency?: string;
  dueAt?: Date | null;
  metadata?: Record<string, string>;
};

export async function createInvoiceFromApi(input: CreateInvoiceApiInput) {
  const contact = await loadContactEmail(input.orgId, input.contactId);
  if (!contact?.email) {
    throw new Error("Contact must have an email to receive an invoice");
  }

  const provider = getPaymentProvider("stripe");
  const result = await provider.createInvoice({
    orgId: input.orgId,
    contactId: input.contactId,
    customerEmail: contact.email,
    customerName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined,
    items: input.items,
    currency: input.currency,
    dueAt: input.dueAt ?? undefined,
    metadata: input.metadata,
  });

  const [row] = await db
    .insert(invoices)
    .values({
      orgId: input.orgId,
      contactId: input.contactId,
      provider: "stripe",
      stripeInvoiceId: result.externalInvoiceId,
      stripeCustomerId: result.externalCustomerId,
      status: result.status,
      currency: (input.currency ?? "USD").toUpperCase(),
      subtotal: result.subtotal.toFixed(2),
      total: result.total.toFixed(2),
      amountDue: result.amountDue.toFixed(2),
      hostedInvoiceUrl: result.hostedInvoiceUrl,
      dueAt: input.dueAt ?? null,
      metadata: input.metadata ?? {},
    })
    .returning();

  if (!row) throw new Error("Could not persist invoice");

  for (const item of input.items) {
    await db.insert(invoiceItems).values({
      orgId: input.orgId,
      invoiceId: row.id,
      description: item.description,
      quantity: item.quantity,
      unitAmount: item.unitAmount.toFixed(2),
      amount: (item.unitAmount * item.quantity).toFixed(2),
      currency: (item.currency ?? input.currency ?? "USD").toUpperCase(),
    });
  }

  await emitSeldonEvent("invoice.created", {
    contactId: input.contactId,
    invoiceId: row.id,
    amount: result.total,
  });

  return row;
}

export async function sendInvoiceFromApi(orgId: string, invoiceId: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
    .limit(1);
  if (!row?.stripeInvoiceId) {
    throw new Error("Invoice not found");
  }

  const provider = getPaymentProvider("stripe");
  const result = await provider.sendInvoice(orgId, row.stripeInvoiceId);

  await db
    .update(invoices)
    .set({ status: result.status, sentAt: result.sentAt, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));

  await emitSeldonEvent("invoice.sent", { contactId: row.contactId, invoiceId: row.id });
  return { status: result.status, sentAt: result.sentAt.toISOString() };
}

export async function voidInvoiceFromApi(orgId: string, invoiceId: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
    .limit(1);
  if (!row?.stripeInvoiceId) {
    throw new Error("Invoice not found");
  }

  const provider = getPaymentProvider("stripe");
  const result = await provider.voidInvoice(orgId, row.stripeInvoiceId);

  await db
    .update(invoices)
    .set({ status: result.status, voidedAt: result.voidedAt, updatedAt: new Date() })
    .where(eq(invoices.id, invoiceId));

  await emitSeldonEvent("invoice.voided", { contactId: row.contactId, invoiceId: row.id });
  return { status: result.status, voidedAt: result.voidedAt.toISOString() };
}

export async function listInvoicesForOrg(orgId: string, limit = 50) {
  return db
    .select()
    .from(invoices)
    .where(eq(invoices.orgId, orgId))
    .orderBy(desc(invoices.createdAt))
    .limit(limit);
}

export async function getInvoiceWithItems(orgId: string, invoiceId: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.orgId, orgId), eq(invoices.id, invoiceId)))
    .limit(1);
  if (!row) return null;

  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
  return { invoice: row, items };
}

export type CreateSubscriptionApiInput = {
  orgId: string;
  contactId: string;
  priceId: string;
  trialDays?: number;
  metadata?: Record<string, string>;
};

export async function createSubscriptionFromApi(input: CreateSubscriptionApiInput) {
  const contact = await loadContactEmail(input.orgId, input.contactId);
  if (!contact?.email) {
    throw new Error("Contact must have an email to be subscribed");
  }

  const provider = getPaymentProvider("stripe");
  const result = await provider.createSubscription({
    orgId: input.orgId,
    contactId: input.contactId,
    customerEmail: contact.email,
    customerName: [contact.firstName, contact.lastName].filter(Boolean).join(" ") || undefined,
    priceId: input.priceId,
    trialDays: input.trialDays,
    metadata: input.metadata,
  });

  const [row] = await db
    .insert(subscriptions)
    .values({
      orgId: input.orgId,
      contactId: input.contactId,
      provider: "stripe",
      stripeSubscriptionId: result.externalSubscriptionId,
      stripeCustomerId: result.externalCustomerId,
      stripePriceId: result.externalPriceId,
      productName: result.productName,
      status: result.status,
      amount: result.amount.toFixed(2),
      currency: result.currency,
      interval: result.interval,
      intervalCount: String(result.intervalCount),
      currentPeriodStart: result.currentPeriodStart,
      currentPeriodEnd: result.currentPeriodEnd,
      trialEnd: result.trialEnd,
      metadata: input.metadata ?? {},
    })
    .returning();

  if (!row) throw new Error("Could not persist subscription");

  await emitSeldonEvent("subscription.created", {
    contactId: input.contactId,
    planId: input.priceId,
  });

  return row;
}

export async function cancelSubscriptionFromApi(params: {
  orgId: string;
  subscriptionId: string;
  immediate?: boolean;
}) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.orgId, params.orgId), eq(subscriptions.id, params.subscriptionId)))
    .limit(1);
  if (!row?.stripeSubscriptionId) {
    throw new Error("Subscription not found");
  }

  const provider = getPaymentProvider("stripe");
  const result = await provider.cancelSubscription({
    orgId: params.orgId,
    externalSubscriptionId: row.stripeSubscriptionId,
    immediate: params.immediate,
  });

  await db
    .update(subscriptions)
    .set({
      status: result.status,
      canceledAt: result.canceledAt,
      cancelAt: result.cancelAt,
      updatedAt: new Date(),
    })
    .where(eq(subscriptions.id, row.id));

  await emitSeldonEvent("subscription.cancelled", {
    contactId: row.contactId ?? "",
    planId: row.stripePriceId ?? "",
  });

  return result;
}

export async function listSubscriptionsForOrg(orgId: string, limit = 50) {
  return db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .orderBy(desc(subscriptions.createdAt))
    .limit(limit);
}

export async function refundPaymentFromApi(params: RefundPaymentInput & { paymentId?: string }) {
  const provider = getPaymentProvider("stripe");
  const result = await provider.refundPayment(params);

  if (params.paymentId) {
    await db
      .update(paymentRecords)
      .set({
        status: result.amount >= 0 ? "refunded" : "partially_refunded",
        refundedAmount: result.amount.toFixed(2),
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(paymentRecords.orgId, params.orgId), eq(paymentRecords.id, params.paymentId)));
  }

  return result;
}

export async function listPaymentsForOrg(orgId: string, limit = 50) {
  return db
    .select()
    .from(paymentRecords)
    .where(eq(paymentRecords.orgId, orgId))
    .orderBy(desc(paymentRecords.createdAt))
    .limit(limit);
}

export async function getPaymentRecord(orgId: string, paymentId: string) {
  const [row] = await db
    .select()
    .from(paymentRecords)
    .where(and(eq(paymentRecords.orgId, orgId), eq(paymentRecords.id, paymentId)))
    .limit(1);
  return row ?? null;
}
