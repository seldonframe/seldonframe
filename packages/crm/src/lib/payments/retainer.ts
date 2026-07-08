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

import { and, desc, eq, ilike, sql } from "drizzle-orm";
import StripeClient from "stripe";
import type Stripe from "stripe";
import { db } from "@/db";
import { contacts, paymentRecords, proposals, stripeConnections, subscriptions } from "@/db/schema";
import { logEvent } from "@/lib/observability/log";
import { buildCheckoutSessionParams } from "@/lib/proposals/checkout";
import { createProposal } from "@/lib/proposals/create";

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
      /** true when amount_paid is LESS than the invoice total — a partial
       *  payment (e.g. a proration credit ate part of the cycle, or a
       *  partially-applied balance). Surfaced so the agency's revenue
       *  picture isn't silently wrong about a short payment. */
      partial: boolean;
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
    // Prefer amount_paid ONLY when it's actually positive — a zero/absent
    // amount_paid on a "paid" invoice (a degenerate shape, but Stripe's
    // fields are all optional) falls back to total rather than silently
    // recording $0 for a real cycle. When amount_paid IS positive but LESS
    // than total, that's a genuine partial payment — record the amount
    // actually collected but flag it so the revenue picture stays honest.
    const total = invoice.total ?? 0;
    const amountPaid = invoice.amount_paid ?? 0;
    const amountCents = amountPaid > 0 ? amountPaid : total;
    const partial = amountPaid > 0 && amountPaid < total;
    return {
      action: "record",
      subscriptionId,
      stripeInvoiceId,
      status: "completed",
      amountCents,
      currency,
      hostedInvoiceUrl,
      partial,
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
    partial: false,
  };
}

// ── DI'd apply layer — mirrors lib/build/wallet-webhook-apply.ts's shape ────

/** The minimal existing-row shape needed to decide idempotent-vs-recovery. */
export type ExistingPaymentRecordRow = { id: string; status: string; metadata: Record<string, unknown> };

/** An outstanding (unresolved) failed row for a SIBLING invoice id on the
 *  same subscription — Stripe sometimes issues a brand-new invoice id for a
 *  retried/replacement cycle rather than re-firing the original one. */
export type OutstandingFailedSiblingRow = { id: string; stripeInvoiceId: string; metadata: Record<string, unknown> };

export type RetainerInvoiceCycleDeps = {
  /** Look up an existing payment_records row by sourceId (the stripeInvoiceId)
   *  — the idempotency check. Null → no existing row. Carries status+metadata
   *  so the caller can tell "already recorded, nothing to do" apart from
   *  "recorded as FAILED, this invoice.paid is a RECOVERY". */
  findExistingBySourceId: (sourceId: string) => Promise<ExistingPaymentRecordRow | null>;
  /** Find an OUTSTANDING (status:"failed", not yet resolvedByLaterPayment)
   *  payment_records row for this subscription whose stripeInvoiceId is
   *  DIFFERENT from the one on the incoming event — the sibling-invoice
   *  recovery case. Null → none. */
  findOutstandingFailedForSubscription: (
    subscriptionId: string,
    excludingStripeInvoiceId: string,
  ) => Promise<OutstandingFailedSiblingRow | null>;
  /** Resolve the agency org + contact that own this subscription, via the
   *  proposal it was created from. Null → unknown subscription (fail-soft skip). */
  resolveProposalBySubscriptionId: (
    subscriptionId: string,
  ) => Promise<{ agencyOrgId: string; contactId: string | null } | null>;
  /** Insert the payment_records row. Any row shape the caller decides — kept
   *  loose here so the DI fake can assert exact field values in tests. */
  insertPaymentRecord: (row: Record<string, unknown>) => Promise<void>;
  /** Patch an existing payment_records row by id — used for BOTH the
   *  same-invoice recovery flip (failed -> completed) and stamping
   *  resolvedByLaterPayment on an outstanding sibling row. */
  updatePaymentRecord: (id: string, patch: Record<string, unknown>) => Promise<void>;
};

export type RetainerInvoiceCycleResult =
  | { outcome: "recorded" }
  | { outcome: "recovered" }
  | { outcome: "already_recorded" }
  | { outcome: "skipped"; reason: string };

/** Apply the pure decision against real (or DI'd) storage. Fail-soft
 *  throughout: any dependency throwing is caught and degrades to `skipped`
 *  rather than propagating — a bookkeeping failure must never break the
 *  shared Connect webhook route for other event types in the same delivery.
 *
 *  RECOVERY (money-severity review fix, BLOCKING #2): Stripe's smart
 *  retries mean a client who fixed their card gets re-billed successfully —
 *  but that success can arrive as EITHER (a) invoice.paid re-fired for the
 *  SAME invoice id whose row we already recorded as "failed", or (b) a
 *  BRAND-NEW invoice id for the same subscription while an outstanding
 *  failed row (different invoice id) still sits unresolved. Both cases must
 *  stamp `metadata.resolvedByLaterPayment = true` on the failed row so the
 *  dunning cron (dunning.ts's `resolved_by_later_payment` guard) stops
 *  emailing a client who already paid. Without this, dunning notifies
 *  forever. */
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
      // RECOVERY (same invoice id): a previously-FAILED row now has a
      // invoice.paid delivered for the SAME stripeInvoiceId — Stripe's smart
      // retry succeeded. Flip it to completed; never insert a second row.
      if (decision.action === "record" && decision.status === "completed" && existing.status === "failed") {
        const amountDollars = (decision.amountCents / 100).toFixed(2);
        await deps.updatePaymentRecord(existing.id, {
          status: "completed",
          amount: amountDollars,
          metadata: {
            ...existing.metadata,
            resolvedByLaterPayment: true,
            paidAt: new Date().toISOString(),
            hostedInvoiceUrl: decision.hostedInvoiceUrl,
            ...(decision.partial ? { partial: true } : {}),
          },
        });
        return { outcome: "recovered" };
      }
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
    if (decision.status === "completed" && decision.partial) {
      metadata.partial = true;
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

    // RECOVERY (sibling invoice id): this NEW invoice recorded successfully —
    // if an OUTSTANDING failed row exists for a DIFFERENT invoice id on the
    // same subscription, Stripe issued a replacement invoice rather than
    // re-firing the original. Stamp the sibling so dunning stops chasing it.
    if (decision.status === "completed") {
      const sibling = await deps.findOutstandingFailedForSubscription(decision.subscriptionId, decision.stripeInvoiceId);
      if (sibling) {
        await deps.updatePaymentRecord(sibling.id, {
          metadata: { ...sibling.metadata, resolvedByLaterPayment: true, resolvedAt: new Date().toISOString() },
        });
      }
    }

    return { outcome: "recorded" };
  } catch (err) {
    logEvent("retainer_cycle_apply_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { outcome: "skipped", reason: "apply_error" };
  }
}

// ── Production deps — real DB reads/writes, wired by the webhook route ──────

async function findExistingBySourceIdReal(sourceId: string): Promise<ExistingPaymentRecordRow | null> {
  const [row] = await db
    .select({ id: paymentRecords.id, status: paymentRecords.status, metadata: paymentRecords.metadata })
    .from(paymentRecords)
    .where(and(eq(paymentRecords.sourceBlock, "retainer"), eq(paymentRecords.sourceId, sourceId)))
    .limit(1);
  if (!row) return null;
  return { id: row.id, status: row.status, metadata: (row.metadata as Record<string, unknown>) ?? {} };
}

/** Find an OUTSTANDING (status:"failed", not yet resolvedByLaterPayment)
 *  retainer row for this subscription whose sourceId (stripeInvoiceId) is
 *  DIFFERENT from the one on the incoming event. The subscription id lives
 *  in metadata.subscriptionId (there's no dedicated column on
 *  payment_records) — matched via a bound jsonb ->> text comparison, never
 *  sql.raw interpolation. */
async function findOutstandingFailedForSubscriptionReal(
  subscriptionId: string,
  excludingStripeInvoiceId: string,
): Promise<OutstandingFailedSiblingRow | null> {
  const rows = await db
    .select({ id: paymentRecords.id, sourceId: paymentRecords.sourceId, metadata: paymentRecords.metadata })
    .from(paymentRecords)
    .where(
      and(
        eq(paymentRecords.sourceBlock, "retainer"),
        eq(paymentRecords.status, "failed"),
        sql`${paymentRecords.metadata} ->> 'subscriptionId' = ${subscriptionId}`,
      ),
    )
    .orderBy(desc(paymentRecords.createdAt));

  for (const row of rows) {
    if (!row.sourceId || row.sourceId === excludingStripeInvoiceId) continue;
    const metadata = (row.metadata as Record<string, unknown>) ?? {};
    if (metadata.resolvedByLaterPayment === true) continue;
    return { id: row.id, stripeInvoiceId: row.sourceId, metadata };
  }
  return null;
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

async function updatePaymentRecordReal(id: string, patch: Record<string, unknown>): Promise<void> {
  await db
    .update(paymentRecords)
    .set({ ...(patch as Partial<typeof paymentRecords.$inferInsert>), updatedAt: new Date() })
    .where(eq(paymentRecords.id, id));
}

export function defaultRetainerInvoiceCycleDeps(): RetainerInvoiceCycleDeps {
  return {
    findExistingBySourceId: findExistingBySourceIdReal,
    findOutstandingFailedForSubscription: findOutstandingFailedForSubscriptionReal,
    resolveProposalBySubscriptionId: resolveProposalBySubscriptionIdReal,
    insertPaymentRecord: insertPaymentRecordReal,
    updatePaymentRecord: updatePaymentRecordReal,
  };
}

/** Production entry point — the webhook route calls this directly. */
export async function recordRetainerInvoiceCycle(
  event: Stripe.Event,
): Promise<RetainerInvoiceCycleResult> {
  return applyRetainerInvoiceCycle(event, defaultRetainerInvoiceCycleDeps());
}

// ── D1 — attach a retainer to an EXISTING client (createClientRetainerCheckout)
//
// REUSES buildCheckoutSessionParams verbatim (design D1): the same
// subscription-mode Stripe Checkout with GMV_FEE_PERCENT that /start already
// creates for new closes — zero new fee logic. Delivery is a checkout link;
// card entry is always the client's own action in a Stripe-hosted surface, we
// never touch or store card numbers here.

export type CreateClientRetainerCheckoutInput = {
  builderOrgId: string;
  clientOrgId: string;
  contact: { email: string; name: string; firstName?: string | null; phone?: string | null };
  monthlyPriceCents: number;
  setupFeeCents?: number;
};

export type CreateRetainerCheckoutDeps = {
  /** The AGENCY's (builderOrgId's) active connected account, if any. Null →
   *  no Stripe call is ever made (D6 money-safety: inert without a connection). */
  getActiveConnection: (builderOrgId: string) => Promise<{ stripeAccountId: string } | null>;
  /** Create the proposal row the checkout session's metadata points at —
   *  reuses the SAME proposals table the /start live-sell flow uses, so the
   *  Connect webhook's existing checkout.session.completed + cycle-recording
   *  paths need no changes to pick this up. */
  createProposalRow: (input: CreateClientRetainerCheckoutInput) => Promise<{ id: string; signedToken: string }>;
  /** The single Stripe call this function makes — checkout session creation
   *  via the connected account, using buildCheckoutSessionParams's output
   *  verbatim. */
  createCheckoutSession: (
    params: Stripe.Checkout.SessionCreateParams,
    options: Stripe.RequestOptions,
  ) => Promise<{ id: string; url: string | null }>;
  persistCheckoutSessionId: (proposalId: string, sessionId: string) => Promise<void>;
  baseUrl: string;
};

export type CreateClientRetainerCheckoutResult =
  | { ok: true; checkoutUrl: string; proposalId: string }
  | {
      ok: false;
      reason: "stripe_not_connected" | "checkout_session_missing_url" | "stripe_error";
    };

export async function createClientRetainerCheckout(
  input: CreateClientRetainerCheckoutInput,
  deps: CreateRetainerCheckoutDeps,
): Promise<CreateClientRetainerCheckoutResult> {
  const connection = await deps.getActiveConnection(input.builderOrgId);
  if (!connection) {
    return { ok: false, reason: "stripe_not_connected" };
  }

  const proposal = await deps.createProposalRow(input);

  const params = buildCheckoutSessionParams({
    proposalId: proposal.id,
    previewWorkspaceId: null,
    prospectEmail: input.contact.email,
    prospectName: input.contact.name,
    monthlyPriceCents: input.monthlyPriceCents,
    setupFeeCents: input.setupFeeCents,
    signedToken: proposal.signedToken,
    baseUrl: deps.baseUrl,
  });

  let session: { id: string; url: string | null };
  try {
    session = await deps.createCheckoutSession(params, { stripeAccount: connection.stripeAccountId });
  } catch (err) {
    logEvent("retainer_checkout_stripe_error", {
      builderOrgId: input.builderOrgId,
      clientOrgId: input.clientOrgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "stripe_error" };
  }

  if (!session.url) {
    return { ok: false, reason: "checkout_session_missing_url" };
  }

  await deps.persistCheckoutSessionId(proposal.id, session.id);

  return { ok: true, checkoutUrl: session.url, proposalId: proposal.id };
}

async function getActiveConnectionReal(builderOrgId: string): Promise<{ stripeAccountId: string } | null> {
  const [row] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(and(eq(stripeConnections.orgId, builderOrgId), eq(stripeConnections.isActive, true)))
    .limit(1);
  return row ?? null;
}

async function createProposalRowReal(
  input: CreateClientRetainerCheckoutInput,
): Promise<{ id: string; signedToken: string }> {
  const proposal = await createProposal({
    agencyOrgId: input.builderOrgId,
    createdByUserId: "", // system-created retainer attach; no human proposal author
    prospectName: input.contact.name,
    prospectEmail: input.contact.email,
    prospectFirstName: input.contact.firstName ?? null,
    prospectPhone: input.contact.phone ?? null,
    agencyName: input.contact.name,
    monthlyPriceCents: input.monthlyPriceCents,
    setupFeeCents: input.setupFeeCents ?? 0,
    // previewWorkspaceId doubles as the CLIENT ORG join key for existing-client
    // retainers (D1) — the webhook's own previewMode-flip logic is a safe no-op
    // for an already-active client (it only flips workspaces still in
    // previewMode:true), so reusing this column costs nothing and lets
    // cancelClientRetainer + resolveProposalBySubscriptionId resolve the
    // CLIENT org (not just the agency org that subscriptions.orgId carries).
    previewWorkspaceId: input.clientOrgId,
    scopeItems: [{ label: "Monthly retainer" }],
    generatedHtml: `<p>Retainer checkout for ${input.contact.name}. $${(input.monthlyPriceCents / 100).toFixed(0)}/mo.</p>`,
  });
  return { id: proposal.id, signedToken: proposal.signedToken };
}

function getStripeClientReal(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) return null;
  return new StripeClient(secretKey, { apiVersion: "2025-08-27.basil" });
}

export function defaultCreateRetainerCheckoutDeps(): CreateRetainerCheckoutDeps {
  return {
    getActiveConnection: getActiveConnectionReal,
    createProposalRow: createProposalRowReal,
    createCheckoutSession: async (params, options) => {
      const stripe = getStripeClientReal();
      if (!stripe) throw new Error("stripe_not_configured");
      const session = await stripe.checkout.sessions.create(params, options);
      return { id: session.id, url: session.url };
    },
    persistCheckoutSessionId: async (proposalId, sessionId) => {
      await db
        .update(proposals)
        .set({ stripeCheckoutSessionId: sessionId, updatedAt: new Date() })
        .where(eq(proposals.id, proposalId));
    },
    baseUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://app.seldonframe.com",
  };
}

/** Production entry point — the agency editor's server action calls this. */
export async function createClientRetainer(
  input: CreateClientRetainerCheckoutInput,
): Promise<CreateClientRetainerCheckoutResult> {
  return createClientRetainerCheckout(input, defaultCreateRetainerCheckoutDeps());
}

// ── cancel a client's retainer subscription — the ONE other new mutating
// Stripe call besides checkout creation. Org-scoped (the caller must own the
// client org) + inert without an active connection (D6).

export type CancelClientRetainerInput = {
  builderOrgId: string;
  clientOrgId: string;
};

export type CancelRetainerDeps = {
  /** Does builderOrgId own clientOrgId? (org-scoped authz — the same
   *  resolveBuilderAgency-style ownership check the other client-card
   *  editors use). */
  authorize: (input: CancelClientRetainerInput) => Promise<boolean>;
  getActiveConnection: (builderOrgId: string) => Promise<{ stripeAccountId: string } | null>;
  /** Find the client's currently-active retainer subscription. Null → no
   *  active subscription to cancel. */
  findActiveSubscription: (clientOrgId: string) => Promise<{ stripeSubscriptionId: string } | null>;
  cancelSubscription: (subscriptionId: string, stripeAccountId: string) => Promise<void>;
};

export type CancelClientRetainerResult =
  | { ok: true }
  | { ok: false; reason: "unauthorized" | "stripe_not_connected" | "no_active_subscription" | "stripe_error" };

export async function cancelClientRetainer(
  input: CancelClientRetainerInput,
  deps: CancelRetainerDeps,
): Promise<CancelClientRetainerResult> {
  const authorized = await deps.authorize(input);
  if (!authorized) return { ok: false, reason: "unauthorized" };

  const connection = await deps.getActiveConnection(input.builderOrgId);
  if (!connection) return { ok: false, reason: "stripe_not_connected" };

  const activeSubscription = await deps.findActiveSubscription(input.clientOrgId);
  if (!activeSubscription) return { ok: false, reason: "no_active_subscription" };

  try {
    await deps.cancelSubscription(activeSubscription.stripeSubscriptionId, connection.stripeAccountId);
  } catch (err) {
    logEvent("retainer_cancel_stripe_error", {
      builderOrgId: input.builderOrgId,
      clientOrgId: input.clientOrgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "stripe_error" };
  }

  return { ok: true };
}

/** Resolve a client org's active retainer subscription. IMPORTANT:
 *  subscriptions.orgId is the AGENCY's org (resolved from the connected
 *  Stripe account in the webhook — see resolveOrgByAccount in
 *  app/api/webhooks/stripe/connect/route.ts), NEVER the client org. The
 *  client join key is proposals.previewWorkspaceId (repurposed for
 *  existing-client retainers — see createProposalRowReal above) →
 *  proposals.stripeSubscriptionId → subscriptions.stripeSubscriptionId. */
async function findActiveSubscriptionReal(clientOrgId: string): Promise<{ stripeSubscriptionId: string } | null> {
  const proposalRows = await db
    .select({ stripeSubscriptionId: proposals.stripeSubscriptionId })
    .from(proposals)
    .where(eq(proposals.previewWorkspaceId, clientOrgId));

  const subscriptionIds = proposalRows
    .map((r) => r.stripeSubscriptionId)
    .filter((id): id is string => Boolean(id));
  if (subscriptionIds.length === 0) return null;

  const { inArray } = await import("drizzle-orm");
  const [row] = await db
    .select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
    .from(subscriptions)
    .where(and(inArray(subscriptions.stripeSubscriptionId, subscriptionIds), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  if (!row?.stripeSubscriptionId) return null;
  return { stripeSubscriptionId: row.stripeSubscriptionId };
}

// ── The shared retainer join (money-severity review fix, BLOCKING #1) ──────
//
// payment_records + contacts.customFields.billing are written under the
// AGENCY org (createDealOnAcceptance / insertPaymentRecordReal above), but
// the CLIENT PORTAL session's orgId is the CLIENT org — the same
// previewWorkspaceId join key findActiveSubscriptionReal already uses.
// resolveRetainerLinkForClientOrg is the ONE place that resolves
// clientOrgId -> {agencyOrgId, contactId, stripeCustomerId}; portal-billing's
// history, card, and update-card reads MUST all go through this (never
// re-derive the join independently — that's what caused the bug).

export type RetainerLinkDeps = {
  /** Find the client org's retainer proposal (the previewWorkspaceId join —
   *  see createProposalRowReal). Null → no retainer ever attached for this
   *  client org (empty state, never a throw, never a cross-org fallback). */
  findProposalByClientOrgId: (
    clientOrgId: string,
  ) => Promise<{ agencyOrgId: string; prospectEmail: string | null; stripeCustomerId: string | null } | null>;
  /** Resolve the AGENCY-SIDE contact for this email — the SAME
   *  case-insensitive, agency-org-scoped lookup createDealOnAcceptance and
   *  resolveProposalBySubscriptionIdReal use. Null → no contact resolved. */
  resolveContactForAgency: (agencyOrgId: string, email: string) => Promise<{ id: string } | null>;
};

export type RetainerLink = {
  agencyOrgId: string;
  contactId: string | null;
  stripeCustomerId: string | null;
};

/** clientOrgId -> {agencyOrgId, contactId, stripeCustomerId}. Null when no
 *  retainer proposal exists for this client org — an empty state, NEVER
 *  cross-org leakage (a client org with no matching proposal resolves
 *  nothing, full stop; there is no fallback to "any" proposal). */
export async function resolveRetainerLinkForClientOrg(
  clientOrgId: string,
  deps: RetainerLinkDeps,
): Promise<RetainerLink | null> {
  const proposal = await deps.findProposalByClientOrgId(clientOrgId);
  if (!proposal) return null;

  let contactId: string | null = null;
  const email = proposal.prospectEmail?.trim().toLowerCase();
  if (email) {
    const contact = await deps.resolveContactForAgency(proposal.agencyOrgId, email);
    contactId = contact?.id ?? null;
  }

  return { agencyOrgId: proposal.agencyOrgId, contactId, stripeCustomerId: proposal.stripeCustomerId };
}

async function findProposalByClientOrgIdReal(
  clientOrgId: string,
): Promise<{ agencyOrgId: string; prospectEmail: string | null; stripeCustomerId: string | null } | null> {
  const [row] = await db
    .select({
      agencyOrgId: proposals.agencyOrgId,
      prospectEmail: proposals.prospectEmail,
      stripeCustomerId: proposals.stripeCustomerId,
    })
    .from(proposals)
    .where(eq(proposals.previewWorkspaceId, clientOrgId))
    .orderBy(desc(proposals.createdAt))
    .limit(1);
  return row ?? null;
}

async function resolveContactForAgencyReal(agencyOrgId: string, email: string): Promise<{ id: string } | null> {
  const [row] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(and(eq(contacts.orgId, agencyOrgId), ilike(contacts.email, email)))
    .limit(1);
  return row ?? null;
}

export function defaultRetainerLinkDeps(): RetainerLinkDeps {
  return {
    findProposalByClientOrgId: findProposalByClientOrgIdReal,
    resolveContactForAgency: resolveContactForAgencyReal,
  };
}

/** Production entry point — used by lib/payments/portal-billing.ts and
 *  lib/payments/portal-billing-actions.ts so history, card, and
 *  update-card all resolve the SAME agency-side org+contact. */
export async function getRetainerLinkForClientOrg(clientOrgId: string): Promise<RetainerLink | null> {
  return resolveRetainerLinkForClientOrg(clientOrgId, defaultRetainerLinkDeps());
}

// ── D4 — client-card retainer status. Pure: derived from the ALREADY-STORED
// subscriptions row (never a Stripe call — the plan is explicit: "do NOT
// call Stripe to render status"). The subscriptions row is kept current by
// the Connect webhook's existing customer.subscription.* handler.

export type RetainerStatus = "none" | "active" | "past_due" | "canceled";

/** Stripe subscription statuses that mean "billing is on schedule" for our
 *  purposes — trialing counts as active (no card-decline concern yet). */
const ACTIVE_LIKE = new Set(["active", "trialing"]);
/** Statuses that mean "the card needs attention" — the dunning cron's target. */
const PAST_DUE_LIKE = new Set(["past_due", "unpaid"]);
/** Statuses that mean "this subscription is done" — never returning. */
const CANCELED_LIKE = new Set(["canceled", "incomplete_expired"]);

export function deriveRetainerStatus(input: { subscription: { status: string } | null }): RetainerStatus {
  if (!input.subscription) return "none";
  const status = input.subscription.status;
  if (PAST_DUE_LIKE.has(status)) return "past_due";
  if (CANCELED_LIKE.has(status)) return "canceled";
  if (ACTIVE_LIKE.has(status)) return "active";
  // Unknown/future Stripe status → default to "active" rather than hiding a
  // real subscription behind an unrecognized string (fail-soft toward
  // visibility, not toward silence).
  return "active";
}

export function defaultCancelRetainerDeps(
  authorize: (input: CancelClientRetainerInput) => Promise<boolean>,
): CancelRetainerDeps {
  return {
    authorize,
    getActiveConnection: getActiveConnectionReal,
    findActiveSubscription: findActiveSubscriptionReal,
    cancelSubscription: async (subscriptionId, stripeAccountId) => {
      const stripe = getStripeClientReal();
      if (!stripe) throw new Error("stripe_not_configured");
      await stripe.subscriptions.cancel(subscriptionId, {}, { stripeAccount: stripeAccountId });
    },
  };
}
