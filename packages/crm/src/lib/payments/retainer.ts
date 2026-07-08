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

import { and, desc, eq, ilike } from "drizzle-orm";
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
