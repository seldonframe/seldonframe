// packages/crm/src/lib/payments/retainer.ts
//
// Autopay console (2026-07-08) — the console AROUND the existing recurring
// rail (design §0: buildCheckoutSessionParams already creates subscription-mode
// Stripe Checkout with GMV_FEE_PERCENT on the agency's connected account). This
// file adds:
//
//   Task 1 — cycle recording. The initial-close invoice is already recorded by
//   createDealOnAcceptance (keyed on the checkout SESSION id). Every invoice
//   AFTER that (the monthly auto-bill cycles) was previously invisible — this
//   is what makes the agency's revenue picture (and SF's 2%) show up in-product.
//
// MONEY-SAFETY:
//   - NO Stripe calls in this file for Task 1 — pure decision + DB-only apply.
//   - Idempotent on stripeInvoiceId (payment_records.sourceId): a duplicate
//     webhook delivery is a no-op (checked BEFORE insert).
//   - The initial-close invoice (billing_reason: subscription_create) is
//     skipped here — createDealOnAcceptance already wrote that row keyed by
//     the checkout session id; recording it again here would double-count.
//   - Unknown subscription (no proposal match) → a logged skip, NEVER a throw.
//     A throw here would break the shared Connect webhook route for every
//     other event type in the same request.

import { and, eq, ilike } from "drizzle-orm";
import type Stripe from "stripe";
import { db } from "@/db";
import { contacts, paymentRecords, proposals } from "@/db/schema";
import { logEvent } from "@/lib/observability/log";

// ── the subscription id off an Invoice — mirrors
// lib/marketplace/billing/webhook-handler.ts's invoiceSubscriptionId (the
// field moved across Stripe API versions: top-level `subscription` in basil,
// `parent.subscription_details` in newer shapes) ─────────────────────────────
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const direct = (
    invoice as Stripe.Invoice & { subscription?: string | { id?: string } | null }
  ).subscription;
  const fromDirect = refId(direct);
  if (fromDirect) return fromDirect;

  const parent = (
    invoice as Stripe.Invoice & {
      parent?: { subscription_details?: { subscription?: string | { id?: string } | null } | null } | null;
    }
  ).parent;
  return refId(parent?.subscription_details?.subscription ?? null);
}

function refId(value: string | { id?: string } | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  return value.id?.trim() || null;
}

// ── Pure decision: what should happen for this invoice event? ────────────────
// Mirrors lib/marketplace/billing/webhook-handler.ts's shape — no db, no
// network, never throws. The route/apply layer below carries out the decision.

export type RetainerCycleDecision =
  | {
      action: "record";
      subscriptionId: string;
      stripeInvoiceId: string;
      status: "completed" | "failed";
      amountCents: number;
      currency: string;
      hostedInvoiceUrl: string | null;
    }
  | { action: "skip"; reason: string };

export function decideRetainerCycleFromInvoiceEvent(event: Stripe.Event): RetainerCycleDecision {
  if (event.type !== "invoice.paid" && event.type !== "invoice.payment_failed") {
    return { action: "skip", reason: `unhandled_event_type:${event.type}` };
  }

  const invoice = event.data.object as Stripe.Invoice;
  const stripeInvoiceId = (invoice.id ?? "").trim();
  if (!stripeInvoiceId) return { action: "skip", reason: "missing_invoice_id" };

  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return { action: "skip", reason: "missing_subscription_id" };

  // The initial-close invoice (billing_reason: subscription_create) is already
  // recorded by createDealOnAcceptance at checkout.session.completed time,
  // keyed on the checkout SESSION id — recording it again here (keyed on the
  // INVOICE id) would double-count the very first payment.
  if (event.type === "invoice.paid" && invoice.billing_reason === "subscription_create") {
    return { action: "skip", reason: "initial_close_invoice_subscription_create" };
  }

  const currency = (invoice.currency ?? "usd").toUpperCase();
  const hostedInvoiceUrl = invoice.hosted_invoice_url ?? null;

  if (event.type === "invoice.paid") {
    return {
      action: "record",
      subscriptionId,
      stripeInvoiceId,
      status: "completed",
      amountCents: invoice.amount_paid ?? invoice.total ?? 0,
      currency,
      hostedInvoiceUrl,
    };
  }

  // invoice.payment_failed
  return {
    action: "record",
    subscriptionId,
    stripeInvoiceId,
    status: "failed",
    amountCents: invoice.amount_due ?? invoice.total ?? 0,
    currency,
    hostedInvoiceUrl,
  };
}

// ── DI'd apply layer — mirrors lib/build/wallet-webhook-apply.ts's shape ────

export type RetainerInvoiceCycleDeps = {
  /** Look up an existing payment_records row by sourceId (the stripeInvoiceId)
   *  — the idempotency check. Null → no existing row. */
  findExistingBySourceId: (sourceId: string) => Promise<{ id: string } | null>;
  /** Resolve the agency org + contact that own this subscription, via the
   *  proposal it was created from. Null → unknown subscription (fail-soft skip). */
  resolveProposalBySubscriptionId: (
    subscriptionId: string,
  ) => Promise<{ agencyOrgId: string; contactId: string | null } | null>;
  /** Insert the payment_records row. Any row shape the caller decides — kept
   *  loose here so the DI fake can assert exact field values in tests. */
  insertPaymentRecord: (row: Record<string, unknown>) => Promise<void>;
};

export type RetainerInvoiceCycleResult =
  | { outcome: "recorded" }
  | { outcome: "already_recorded" }
  | { outcome: "skipped"; reason: string };

/** Apply the pure decision against real (or DI'd) storage. Fail-soft
 *  throughout: any dependency throwing is caught and degrades to `skipped`
 *  rather than propagating — a bookkeeping failure must never break the
 *  shared Connect webhook route for other event types in the same delivery. */
export async function applyRetainerInvoiceCycle(
  event: Stripe.Event,
  deps: RetainerInvoiceCycleDeps,
): Promise<RetainerInvoiceCycleResult> {
  try {
    const decision = decideRetainerCycleFromInvoiceEvent(event);
    if (decision.action === "skip") {
      return { outcome: "skipped", reason: decision.reason };
    }

    const existing = await deps.findExistingBySourceId(decision.stripeInvoiceId);
    if (existing) {
      return { outcome: "already_recorded" };
    }

    const resolved = await deps.resolveProposalBySubscriptionId(decision.subscriptionId);
    if (!resolved) {
      logEvent("retainer_cycle_unknown_subscription", {
        subscriptionId: decision.subscriptionId,
        stripeInvoiceId: decision.stripeInvoiceId,
      });
      return { outcome: "skipped", reason: "unknown_subscription" };
    }

    const amountDollars = (decision.amountCents / 100).toFixed(2);
    const metadata: Record<string, unknown> = {
      subscriptionId: decision.subscriptionId,
      currency: decision.currency,
      hostedInvoiceUrl: decision.hostedInvoiceUrl,
    };
    if (decision.status === "failed") {
      metadata.dunning = { failedAt: new Date().toISOString(), notifyStage: 0 };
    }

    await deps.insertPaymentRecord({
      orgId: resolved.agencyOrgId,
      contactId: resolved.contactId,
      stripePaymentIntentId: null,
      stripeAccountId: null,
      stripeChargeId: null,
      amount: amountDollars,
      currency: decision.currency,
      status: decision.status,
      sourceBlock: "retainer",
      sourceId: decision.stripeInvoiceId,
      metadata,
    });

    return { outcome: "recorded" };
  } catch (err) {
    logEvent("retainer_cycle_apply_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { outcome: "skipped", reason: "apply_error" };
  }
}

// ── Production deps — real DB reads/writes, wired by the webhook route ──────

async function findExistingBySourceIdReal(sourceId: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: paymentRecords.id })
    .from(paymentRecords)
    .where(and(eq(paymentRecords.sourceBlock, "retainer"), eq(paymentRecords.sourceId, sourceId)))
    .limit(1);
  return row ?? null;
}

/** Resolve the agency org + contact for a subscription id via the proposal it
 *  came from. Proposals don't carry a contactId column directly (contacts are
 *  find-or-created by email at acceptance time), so we re-resolve the same
 *  way createDealOnAcceptance does: case-insensitive email match, scoped to
 *  the proposal's agency org. */
async function resolveProposalBySubscriptionIdReal(
  subscriptionId: string,
): Promise<{ agencyOrgId: string; contactId: string | null } | null> {
  const [proposal] = await db
    .select({
      agencyOrgId: proposals.agencyOrgId,
      prospectEmail: proposals.prospectEmail,
    })
    .from(proposals)
    .where(eq(proposals.stripeSubscriptionId, subscriptionId))
    .limit(1);
  if (!proposal) return null;

  let contactId: string | null = null;
  const email = proposal.prospectEmail?.trim().toLowerCase();
  if (email) {
    const [contact] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.orgId, proposal.agencyOrgId), ilike(contacts.email, email)))
      .limit(1);
    contactId = contact?.id ?? null;
  }

  return { agencyOrgId: proposal.agencyOrgId, contactId };
}

async function insertPaymentRecordReal(row: Record<string, unknown>): Promise<void> {
  await db.insert(paymentRecords).values(row as typeof paymentRecords.$inferInsert);
}

export function defaultRetainerInvoiceCycleDeps(): RetainerInvoiceCycleDeps {
  return {
    findExistingBySourceId: findExistingBySourceIdReal,
    resolveProposalBySubscriptionId: resolveProposalBySubscriptionIdReal,
    insertPaymentRecord: insertPaymentRecordReal,
  };
}

/** Production entry point — the webhook route calls this directly. */
export async function recordRetainerInvoiceCycle(
  event: Stripe.Event,
): Promise<RetainerInvoiceCycleResult> {
  return applyRetainerInvoiceCycle(event, defaultRetainerInvoiceCycleDeps());
}
