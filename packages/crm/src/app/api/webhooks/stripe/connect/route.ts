import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { db } from "@/db";
import {
  invoices,
  paymentEvents,
  paymentRecords,
  stripeConnections,
  subscriptions,
} from "@/db/schema";
import { emitSeldonEvent } from "@/lib/events/bus";
import { logEvent } from "@/lib/observability/log";

export const runtime = "nodejs";

// Connect webhook endpoint — distinct from /api/stripe/webhook which
// handles platform events (SeldonFrame's own $9/mo billing). This
// endpoint is registered in the Stripe dashboard as a Connect webhook
// and signed with STRIPE_CONNECT_WEBHOOK_SECRET. Every event carries
// an `account` field identifying which SMB's connected Stripe account
// fired the event; we route state-machine updates to the corresponding
// workspace.

function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return new Stripe(secretKey, { apiVersion: "2025-08-27.basil" });
}

async function resolveOrgByAccount(stripeAccountId: string) {
  const [row] = await db
    .select({ orgId: stripeConnections.orgId })
    .from(stripeConnections)
    .where(
      and(
        eq(stripeConnections.stripeAccountId, stripeAccountId),
        eq(stripeConnections.isActive, true)
      )
    )
    .limit(1);
  return row?.orgId ?? null;
}

async function recordPaymentEvent(params: {
  orgId: string;
  stripeAccountId: string;
  eventId: string;
  eventType: string;
  targetType: "payment" | "invoice" | "subscription" | "other";
  targetId: string | null;
  payload: Stripe.Event;
}) {
  await db
    .insert(paymentEvents)
    .values({
      orgId: params.orgId,
      provider: "stripe",
      providerAccountId: params.stripeAccountId,
      providerEventId: params.eventId,
      eventType: params.eventType,
      targetType: params.targetType,
      targetId: params.targetId,
      payload: params.payload as unknown as Record<string, unknown>,
    })
    .onConflictDoNothing({ target: [paymentEvents.provider, paymentEvents.providerEventId] });
}

async function findPaymentRecordByIntent(orgId: string, paymentIntentId: string) {
  const [row] = await db
    .select()
    .from(paymentRecords)
    .where(and(eq(paymentRecords.orgId, orgId), eq(paymentRecords.stripePaymentIntentId, paymentIntentId)))
    .limit(1);
  return row ?? null;
}

async function findInvoiceByStripeId(stripeInvoiceId: string) {
  const [row] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.stripeInvoiceId, stripeInvoiceId))
    .limit(1);
  return row ?? null;
}

async function findSubscriptionByStripeId(stripeSubscriptionId: string) {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  return row ?? null;
}

function stripeUnixToDate(value: number | null | undefined): Date | null {
  if (!value) return null;
  return new Date(value * 1000);
}

async function upsertInvoiceFromEvent(orgId: string, stripeAccount: string, invoice: Stripe.Invoice) {
  const stripeInvoiceId = invoice.id;
  if (!stripeInvoiceId) return null;

  const existing = await findInvoiceByStripeId(stripeInvoiceId);
  const paidAt = stripeUnixToDate(
    (invoice as Stripe.Invoice & { status_transitions?: { paid_at?: number | null } }).status_transitions?.paid_at
  );
  const voidedAt = stripeUnixToDate(
    (invoice as Stripe.Invoice & { status_transitions?: { voided_at?: number | null } }).status_transitions?.voided_at
  );

  // `tax` moved across Stripe API versions — read defensively.
  const taxCents = (invoice as Stripe.Invoice & { tax?: number | null }).tax ?? 0;

  const values = {
    status: invoice.status ?? "open",
    number: invoice.number ?? null,
    subtotal: ((invoice.subtotal ?? 0) / 100).toFixed(2),
    tax: (taxCents / 100).toFixed(2),
    total: ((invoice.total ?? 0) / 100).toFixed(2),
    amountPaid: ((invoice.amount_paid ?? 0) / 100).toFixed(2),
    amountDue: ((invoice.amount_due ?? 0) / 100).toFixed(2),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    paidAt,
    voidedAt,
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(invoices).set(values).where(eq(invoices.id, existing.id));
    return existing.id;
  }

  const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id ?? null;
  const [created] = await db
    .insert(invoices)
    .values({
      orgId,
      provider: "stripe",
      stripeInvoiceId,
      stripeAccountId: stripeAccount,
      stripeCustomerId: customerId,
      currency: (invoice.currency ?? "usd").toUpperCase(),
      dueAt: stripeUnixToDate(invoice.due_date),
      contactId: null,
      ...values,
    })
    .returning({ id: invoices.id });
  return created?.id ?? null;
}

async function upsertSubscriptionFromEvent(orgId: string, stripeAccount: string, subscription: Stripe.Subscription) {
  const stripeSubscriptionId = subscription.id;
  const existing = await findSubscriptionByStripeId(stripeSubscriptionId);
  const item = subscription.items.data[0];
  const price = item?.price as unknown as Stripe.Price | undefined;
  const product = price?.product;
  const productName =
    typeof product === "string" ? null : (product as Stripe.Product | null)?.name ?? null;

  const subscriptionWithPeriods = subscription as Stripe.Subscription & {
    current_period_start?: number | null;
    current_period_end?: number | null;
  };

  const values = {
    status: subscription.status,
    productName,
    amount: ((price?.unit_amount ?? 0) / 100).toFixed(2),
    currency: (price?.currency ?? "usd").toUpperCase(),
    interval: price?.recurring?.interval ?? "month",
    intervalCount: String(price?.recurring?.interval_count ?? 1),
    stripePriceId: price?.id ?? null,
    currentPeriodStart: stripeUnixToDate(subscriptionWithPeriods.current_period_start ?? null),
    currentPeriodEnd: stripeUnixToDate(subscriptionWithPeriods.current_period_end ?? null),
    cancelAt: stripeUnixToDate(subscription.cancel_at),
    canceledAt: stripeUnixToDate(subscription.canceled_at),
    trialEnd: stripeUnixToDate(subscription.trial_end),
    updatedAt: new Date(),
  };

  if (existing) {
    await db.update(subscriptions).set(values).where(eq(subscriptions.id, existing.id));
    return existing.id;
  }

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const [created] = await db
    .insert(subscriptions)
    .values({
      orgId,
      provider: "stripe",
      stripeSubscriptionId,
      stripeAccountId: stripeAccount,
      stripeCustomerId: customerId,
      contactId: null,
      ...values,
    })
    .returning({ id: subscriptions.id });
  return created?.id ?? null;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  const stripe = getStripeClient();

  if (!secret || !stripe) {
    return NextResponse.json({ error: "Connect webhook not configured" }, { status: 400 });
  }

  const rawBody = await request.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    logEvent("stripe_connect_webhook_signature_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const stripeAccount = event.account ?? null;
  if (!stripeAccount) {
    // Platform-scoped event arriving on the Connect endpoint. Acknowledge
    // but don't process — the platform endpoint owns these.
    logEvent("stripe_connect_webhook_platform_event", { event_id: event.id, event_type: event.type });
    return NextResponse.json({ ok: true, skipped: "platform_event" });
  }

  const orgId = await resolveOrgByAccount(stripeAccount);
  if (!orgId) {
    logEvent("stripe_connect_webhook_no_org_match", { account: stripeAccount, event_type: event.type });
    return NextResponse.json({ ok: true, matched: false });
  }

  // Dispatch state-machine updates. The `payment_events` insert below
  // is idempotent via unique(provider, provider_event_id) — a replayed
  // webhook writes nothing twice, the downstream updates are safe to
  // re-run.

  switch (event.type) {
    case "payment_intent.succeeded":
    case "payment_intent.payment_failed": {
      const pi = event.data.object as Stripe.PaymentIntent;
      const existing = await findPaymentRecordByIntent(orgId, pi.id);
      await recordPaymentEvent({
        orgId,
        stripeAccountId: stripeAccount,
        eventId: event.id,
        eventType: event.type,
        targetType: "payment",
        targetId: existing?.id ?? null,
        payload: event,
      });
      if (existing && event.type === "payment_intent.payment_failed") {
        await db
          .update(paymentRecords)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(paymentRecords.id, existing.id));
        if (existing.contactId) {
          await emitSeldonEvent("payment.failed", {
            contactId: existing.contactId,
            amount: Number(existing.amount),
            reason: pi.last_payment_error?.message ?? "payment_intent.payment_failed",
          }, { orgId: orgId });
        }
      }
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id ?? null;
      if (!paymentIntentId) break;
      const existing = await findPaymentRecordByIntent(orgId, paymentIntentId);
      await recordPaymentEvent({
        orgId,
        stripeAccountId: stripeAccount,
        eventId: event.id,
        eventType: event.type,
        targetType: "payment",
        targetId: existing?.id ?? null,
        payload: event,
      });
      if (existing) {
        const refundedAmount = ((charge.amount_refunded ?? 0) / 100).toFixed(2);
        const fullyRefunded = charge.refunded === true;
        await db
          .update(paymentRecords)
          .set({
            status: fullyRefunded ? "refunded" : "partially_refunded",
            refundedAmount,
            refundedAt: new Date(),
            stripeChargeId: charge.id,
            updatedAt: new Date(),
          })
          .where(eq(paymentRecords.id, existing.id));
        await emitSeldonEvent("payment.refunded", {
          contactId: existing.contactId,
          paymentId: existing.id,
          amount: Number(refundedAmount),
          currency: existing.currency,
        }, { orgId: orgId });
      }
      break;
    }

    case "charge.dispute.created":
    case "charge.dispute.closed": {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id;

      // Disputes are attached to charges — look up via charge metadata
      // or by stripeChargeId (populated on charge.succeeded earlier).
      const [existing] = await db
        .select()
        .from(paymentRecords)
        .where(and(eq(paymentRecords.orgId, orgId), eq(paymentRecords.stripeChargeId, chargeId)))
        .limit(1);

      await recordPaymentEvent({
        orgId,
        stripeAccountId: stripeAccount,
        eventId: event.id,
        eventType: event.type,
        targetType: "payment",
        targetId: existing?.id ?? null,
        payload: event,
      });

      if (existing && event.type === "charge.dispute.created") {
        await db
          .update(paymentRecords)
          .set({
            status: "disputed",
            disputedAt: new Date(),
            stripeDisputeId: dispute.id,
            updatedAt: new Date(),
          })
          .where(eq(paymentRecords.id, existing.id));
        await emitSeldonEvent("payment.disputed", {
          contactId: existing.contactId,
          paymentId: existing.id,
          amount: Number(existing.amount),
          reason: dispute.reason ?? "dispute",
        }, { orgId: orgId });
      }
      break;
    }

    case "invoice.created":
    case "invoice.finalized":
    case "invoice.sent":
    case "invoice.paid":
    case "invoice.payment_failed":
    case "invoice.voided":
    case "invoice.marked_uncollectible": {
      const invoice = event.data.object as Stripe.Invoice;
      const localId = await upsertInvoiceFromEvent(orgId, stripeAccount, invoice);
      await recordPaymentEvent({
        orgId,
        stripeAccountId: stripeAccount,
        eventId: event.id,
        eventType: event.type,
        targetType: "invoice",
        targetId: localId,
        payload: event,
      });

      if (event.type === "invoice.sent") {
        await db.update(invoices).set({ sentAt: new Date() }).where(eq(invoices.stripeInvoiceId, invoice.id!));
        await emitSeldonEvent("invoice.sent", { contactId: null, invoiceId: localId ?? invoice.id! }, { orgId: orgId });
      } else if (event.type === "invoice.paid") {
        await emitSeldonEvent("invoice.paid", {
          contactId: null,
          invoiceId: localId ?? invoice.id!,
          amount: (invoice.amount_paid ?? 0) / 100,
          currency: (invoice.currency ?? "usd").toUpperCase(),
        }, { orgId: orgId });
      } else if (event.type === "invoice.payment_failed") {
        await emitSeldonEvent("invoice.past_due", {
          contactId: null,
          invoiceId: localId ?? invoice.id!,
          amountDue: (invoice.amount_due ?? 0) / 100,
        }, { orgId: orgId });
      } else if (event.type === "invoice.voided") {
        await emitSeldonEvent("invoice.voided", {
          contactId: null,
          invoiceId: localId ?? invoice.id!,
        }, { orgId: orgId });
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.trial_will_end": {
      const subscription = event.data.object as Stripe.Subscription;
      const localId = await upsertSubscriptionFromEvent(orgId, stripeAccount, subscription);
      await recordPaymentEvent({
        orgId,
        stripeAccountId: stripeAccount,
        eventId: event.id,
        eventType: event.type,
        targetType: "subscription",
        targetId: localId,
        payload: event,
      });

      if (event.type === "customer.subscription.updated") {
        await emitSeldonEvent("subscription.updated", {
          contactId: null,
          subscriptionId: localId ?? subscription.id,
          status: subscription.status,
        }, { orgId: orgId });
      } else if (event.type === "customer.subscription.trial_will_end") {
        await emitSeldonEvent("subscription.trial_will_end", {
          contactId: null,
          subscriptionId: localId ?? subscription.id,
          trialEnd: stripeUnixToDate(subscription.trial_end)?.toISOString() ?? "",
        }, { orgId: orgId });
      }
      break;
    }

    default:
      // Acknowledge unhandled events so Stripe doesn't keep retrying.
      await recordPaymentEvent({
        orgId,
        stripeAccountId: stripeAccount,
        eventId: event.id,
        eventType: event.type,
        targetType: "other",
        targetId: null,
        payload: event,
      });
      break;
  }

  return NextResponse.json({ ok: true, matched: true });
}
