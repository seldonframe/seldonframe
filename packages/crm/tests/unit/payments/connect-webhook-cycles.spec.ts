// packages/crm/tests/unit/payments/connect-webhook-cycles.spec.ts
//
// Autopay console Task 1 — record every retainer BILLING CYCLE from the
// Connect webhook's invoice.paid / invoice.payment_failed events.
//
// `decideRetainerCycleFromInvoiceEvent(event)` is the PURE decision (mirrors
// lib/marketplace/billing/webhook-handler.ts's shape: no Stripe import beyond
// the type, no db, no network — just "what should happen"). The route/apply
// layer (`applyRetainerInvoiceCycle`) is DI'd (mirrors
// lib/build/wallet-webhook-apply.ts) so end-state (rows inserted, idempotency,
// unknown-subscription fail-soft) is testable without a DB.
//
// Money-safety pinned here:
//  - duplicate invoice.paid delivery (same stripeInvoiceId) → NO second row.
//  - the INITIAL-close invoice (billing_reason: subscription_create) must NOT
//    double-record — checkout.session.completed already wrote that row.
//  - unknown subscription (no proposal match) → a logged skip, NEVER a throw.
//  - invoice.payment_failed → a "failed" row + metadata.dunning stamp.
//  - RECOVERY (money-severity review fix, BLOCKING #2): Stripe re-fires
//    invoice.paid for the SAME invoice id after a successful smart retry —
//    the existing FAILED row must flip to "completed" +
//    metadata.resolvedByLaterPayment=true (never a second row). Stripe can
//    ALSO issue a brand-new invoice id for the same subscription+period — the
//    outstanding failed SIBLING row (different invoice id, same
//    subscription) must also get stamped resolvedByLaterPayment so the
//    dunning cron stops emailing a client who already paid.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type Stripe from "stripe";

import {
  decideRetainerCycleFromInvoiceEvent,
  applyRetainerInvoiceCycle,
  type RetainerInvoiceCycleDeps,
} from "@/lib/payments/retainer";

type InvoiceOverrides = Partial<Stripe.Invoice> & { subscription?: string };

function invoiceEvent(
  type: "invoice.paid" | "invoice.payment_failed",
  overrides: InvoiceOverrides = {},
  eventId = "evt_1",
): Stripe.Event {
  const invoice: InvoiceOverrides = {
    id: "in_123",
    subscription: "sub_123",
    customer: "cus_123",
    total: 49700,
    amount_paid: 49700,
    amount_due: 0,
    currency: "usd",
    billing_reason: "subscription_cycle",
    hosted_invoice_url: "https://invoice.stripe.com/i/acct_1/in_123",
    // billing period (unix seconds) — "month 2" in the sibling-recovery tests;
    // month 1 is [1_000_000, 2_000_000).
    period_start: 2_000_000,
    period_end: 3_000_000,
    ...overrides,
  };
  return {
    id: eventId,
    type,
    account: "acct_agency_1",
    data: { object: invoice as Stripe.Invoice },
  } as unknown as Stripe.Event;
}

describe("decideRetainerCycleFromInvoiceEvent — pure decision", () => {
  test("invoice.paid with subscription_cycle reason → record decision", () => {
    const decision = decideRetainerCycleFromInvoiceEvent(invoiceEvent("invoice.paid"));
    assert.equal(decision.action, "record");
    if (decision.action !== "record") return;
    assert.equal(decision.subscriptionId, "sub_123");
    assert.equal(decision.stripeInvoiceId, "in_123");
    assert.equal(decision.status, "completed");
    assert.equal(decision.amountCents, 49700);
  });

  test("invoice.paid with billing_reason subscription_create → skip (initial-close already recorded)", () => {
    const decision = decideRetainerCycleFromInvoiceEvent(
      invoiceEvent("invoice.paid", { billing_reason: "subscription_create" }),
    );
    assert.equal(decision.action, "skip");
    if (decision.action !== "skip") return;
    assert.match(decision.reason, /subscription_create/);
  });

  test("invoice.paid missing subscription id → skip, never throws", () => {
    const decision = decideRetainerCycleFromInvoiceEvent(
      invoiceEvent("invoice.paid", { subscription: undefined }),
    );
    assert.equal(decision.action, "skip");
    if (decision.action !== "skip") return;
    assert.match(decision.reason, /subscription/);
  });

  test("invoice.payment_failed → record decision with status failed", () => {
    const decision = decideRetainerCycleFromInvoiceEvent(
      invoiceEvent("invoice.payment_failed", { amount_due: 49700, amount_paid: 0 }),
    );
    assert.equal(decision.action, "record");
    if (decision.action !== "record") return;
    assert.equal(decision.status, "failed");
    assert.equal(decision.amountCents, 49700);
    assert.equal(decision.partial, false);
  });

  test("invoice.paid with amount_paid === total (the normal case) → not partial", () => {
    const decision = decideRetainerCycleFromInvoiceEvent(
      invoiceEvent("invoice.paid", { total: 49700, amount_paid: 49700 }),
    );
    assert.equal(decision.action, "record");
    if (decision.action !== "record") return;
    assert.equal(decision.amountCents, 49700);
    assert.equal(decision.partial, false);
  });

  test("invoice.paid with amount_paid LESS than total → records the amount actually paid, flags partial:true", () => {
    const decision = decideRetainerCycleFromInvoiceEvent(
      invoiceEvent("invoice.paid", { total: 49700, amount_paid: 20000 }),
    );
    assert.equal(decision.action, "record");
    if (decision.action !== "record") return;
    assert.equal(decision.amountCents, 20000);
    assert.equal(decision.partial, true);
  });

  test("record decisions carry the invoice's billing period (period_start/period_end)", () => {
    const paid = decideRetainerCycleFromInvoiceEvent(invoiceEvent("invoice.paid"));
    assert.equal(paid.action, "record");
    if (paid.action !== "record") return;
    assert.equal(paid.periodStart, 2_000_000);
    assert.equal(paid.periodEnd, 3_000_000);

    const failed = decideRetainerCycleFromInvoiceEvent(
      invoiceEvent("invoice.payment_failed", { amount_due: 49700, amount_paid: 0 }),
    );
    assert.equal(failed.action, "record");
    if (failed.action !== "record") return;
    assert.equal(failed.periodStart, 2_000_000);
    assert.equal(failed.periodEnd, 3_000_000);
  });

  test("missing period fields on the invoice (degenerate) → null periods, still a record decision", () => {
    const decision = decideRetainerCycleFromInvoiceEvent(
      invoiceEvent("invoice.paid", { period_start: undefined, period_end: undefined }),
    );
    assert.equal(decision.action, "record");
    if (decision.action !== "record") return;
    assert.equal(decision.periodStart, null);
    assert.equal(decision.periodEnd, null);
  });

  test("invoice.paid with amount_paid = 0 (degenerate) → falls back to total, never records $0 for a real cycle", () => {
    const decision = decideRetainerCycleFromInvoiceEvent(
      invoiceEvent("invoice.paid", { total: 49700, amount_paid: 0 }),
    );
    assert.equal(decision.action, "record");
    if (decision.action !== "record") return;
    assert.equal(decision.amountCents, 49700);
    // amount_paid wasn't positive, so this isn't treated as a "confirmed
    // partial" — it's the fallback path, not a partial payment signal.
    assert.equal(decision.partial, false);
  });
});

describe("applyRetainerInvoiceCycle — end state via DI fakes", () => {
  function makeDeps(over: Partial<RetainerInvoiceCycleDeps> = {}): {
    deps: RetainerInvoiceCycleDeps;
    inserted: Array<Record<string, unknown>>;
    updated: Array<{ id: string; patch: Record<string, unknown> }>;
  } {
    const inserted: Array<Record<string, unknown>> = [];
    const updated: Array<{ id: string; patch: Record<string, unknown> }> = [];
    const deps: RetainerInvoiceCycleDeps = {
      findExistingBySourceId: async () => null,
      findOutstandingFailedForSubscription: async () => [],
      resolveProposalBySubscriptionId: async () => ({
        agencyOrgId: "org-agency-1",
        contactId: "contact-1",
      }),
      insertPaymentRecord: async (row) => {
        inserted.push(row);
      },
      updatePaymentRecord: async (id, patch) => {
        updated.push({ id, patch });
      },
      ...over,
    };
    return { deps, inserted, updated };
  }

  test("invoice.paid (cycle) → inserts ONE completed payment_records row, org+contact resolved via subscription", async () => {
    const { deps, inserted } = makeDeps();
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "recorded");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]!.orgId, "org-agency-1");
    assert.equal(inserted[0]!.contactId, "contact-1");
    assert.equal(inserted[0]!.sourceBlock, "retainer");
    assert.equal(inserted[0]!.sourceId, "in_123");
    assert.equal(inserted[0]!.status, "completed");
    assert.equal(inserted[0]!.amount, "497.00");
  });

  test("duplicate invoice.paid delivery (same stripeInvoiceId, already completed) → NO second row, no update", async () => {
    const { deps, inserted, updated } = makeDeps({
      findExistingBySourceId: async (sourceId) =>
        sourceId === "in_123" ? { id: "existing-row-1", status: "completed", metadata: {} } : null,
    });
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "already_recorded");
    assert.equal(inserted.length, 0);
    assert.equal(updated.length, 0);
  });

  test("RECOVERY (same invoice id) — invoice.paid re-fired for a stripeInvoiceId whose row is currently 'failed' → flips it to completed + resolvedByLaterPayment, NO second row", async () => {
    const { deps, inserted, updated } = makeDeps({
      findExistingBySourceId: async (sourceId) =>
        sourceId === "in_123"
          ? {
              id: "existing-failed-row-1",
              status: "failed",
              metadata: { dunning: { failedAt: "2026-07-01T00:00:00.000Z", notifyStage: 1 } },
            }
          : null,
    });
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "recovered");
    assert.equal(inserted.length, 0);
    assert.equal(updated.length, 1);
    assert.equal(updated[0]!.id, "existing-failed-row-1");
    assert.equal(updated[0]!.patch.status, "completed");
    assert.equal(updated[0]!.patch.amount, "497.00");
    const metadata = updated[0]!.patch.metadata as {
      resolvedByLaterPayment?: boolean;
      paidAt?: string;
      dunning?: { notifyStage?: number };
    };
    assert.equal(metadata.resolvedByLaterPayment, true);
    assert.equal(typeof metadata.paidAt, "string");
    // the original dunning stamp is preserved (not reset) — the sweep's
    // resolvedByLaterPayment check short-circuits BEFORE it ever looks at
    // notifyStage again, so leaving it as-is is safe and auditable.
    assert.equal(metadata.dunning?.notifyStage, 1);

    // After the flip, a dunning sweep over this row must see
    // resolvedByLaterPayment and skip it (pinned in dunning.spec.ts's
    // existing "resolved_by_later_payment" case — this test only pins the
    // WRITE side of the recovery).
  });

  test("RECOVERY (sibling invoice id) — invoice.paid for a NEW invoice id on the same subscription, while an OUTSTANDING failed row exists for a DIFFERENT invoice id → the new invoice records normally AND the outstanding failed sibling gets stamped resolvedByLaterPayment", async () => {
    const { deps, inserted, updated } = makeDeps({
      findExistingBySourceId: async () => null, // this invoice id (in_123) has no row yet
      findOutstandingFailedForSubscription: async (subscriptionId) =>
        subscriptionId === "sub_123"
          ? [
              {
                id: "outstanding-failed-row-99",
                stripeInvoiceId: "in_OLD_999",
                metadata: {
                  dunning: { failedAt: "2026-07-01T00:00:00.000Z", notifyStage: 0 },
                  // SAME billing period as the incoming paid invoice — the
                  // replacement-invoice case the sibling recovery exists for.
                  periodStart: 2_000_000,
                  periodEnd: 3_000_000,
                },
              },
            ]
          : [],
    });
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "recorded");
    // the NEW invoice is recorded as its own row
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]!.sourceId, "in_123");
    assert.equal(inserted[0]!.status, "completed");
    // the OLD outstanding failed sibling (different invoice id) is stamped,
    // never inserted twice
    assert.equal(updated.length, 1);
    assert.equal(updated[0]!.id, "outstanding-failed-row-99");
    const metadata = updated[0]!.patch.metadata as { resolvedByLaterPayment?: boolean };
    assert.equal(metadata.resolvedByLaterPayment, true);
  });

  test("NO false recovery (period narrowing, 2026-07-08 money-review follow-up) — a NEXT-period invoice.paid must NOT stamp a PRIOR period's outstanding failed row: month 1 was never collected and dunning must keep chasing it", async () => {
    const { deps, inserted, updated } = makeDeps({
      findExistingBySourceId: async () => null,
      findOutstandingFailedForSubscription: async () => [
        {
          id: "month1-failed-row",
          stripeInvoiceId: "in_MONTH1_FAILED",
          metadata: {
            dunning: { failedAt: "2026-06-01T00:00:00.000Z", notifyStage: 1 },
            // month 1 — strictly PRIOR to the incoming invoice's month-2
            // period [2_000_000, 3_000_000).
            periodStart: 1_000_000,
            periodEnd: 2_000_000,
          },
        },
      ],
    });
    // the incoming event is the month-2 cycle paying normally
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "recorded");
    // month 2 records as its own completed row…
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]!.status, "completed");
    // …but the month-1 failed row is NOT stamped resolvedByLaterPayment —
    // that money was never collected and the agency must keep the signal.
    assert.equal(updated.length, 0);
  });

  test("RECOVERY (sibling, legacy row without period metadata) — a failed row written before periods were stamped is still resolvable (fail-open preserves the never-dun-a-paid-client guarantee)", async () => {
    const { deps, updated } = makeDeps({
      findExistingBySourceId: async () => null,
      findOutstandingFailedForSubscription: async () => [
        {
          id: "legacy-failed-row",
          stripeInvoiceId: "in_LEGACY",
          metadata: { dunning: { failedAt: "2026-07-01T00:00:00.000Z", notifyStage: 0 } },
        },
      ],
    });
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "recorded");
    assert.equal(updated.length, 1);
    assert.equal(updated[0]!.id, "legacy-failed-row");
  });

  test("RECOVERY (sibling, incoming invoice missing period fields) — a degenerate paid invoice without period_start fails OPEN and still resolves the outstanding sibling (old behavior preserved)", async () => {
    const { deps, updated } = makeDeps({
      findExistingBySourceId: async () => null,
      findOutstandingFailedForSubscription: async () => [
        {
          id: "month1-failed-row",
          stripeInvoiceId: "in_MONTH1_FAILED",
          metadata: { periodStart: 1_000_000, periodEnd: 2_000_000 },
        },
      ],
    });
    const result = await applyRetainerInvoiceCycle(
      invoiceEvent("invoice.paid", { period_start: undefined, period_end: undefined }),
      deps,
    );
    assert.equal(result.outcome, "recorded");
    // with no period on the paid invoice we can't prove the sibling is a
    // prior period — fail open (resolve) rather than risk dunning a client
    // who already paid.
    assert.equal(updated.length, 1);
    assert.equal(updated[0]!.id, "month1-failed-row");
  });

  test("period narrowing picks the SAME-period sibling even when a prior-period failed row is also outstanding", async () => {
    const { deps, updated } = makeDeps({
      findExistingBySourceId: async () => null,
      findOutstandingFailedForSubscription: async () => [
        {
          id: "month1-failed-row",
          stripeInvoiceId: "in_MONTH1_FAILED",
          metadata: { periodStart: 1_000_000, periodEnd: 2_000_000 },
        },
        {
          id: "month2-failed-row",
          stripeInvoiceId: "in_MONTH2_FAILED",
          metadata: { periodStart: 2_000_000, periodEnd: 3_000_000 },
        },
      ],
    });
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "recorded");
    // ONLY the same-period sibling is stamped; month 1 keeps dunning.
    assert.equal(updated.length, 1);
    assert.equal(updated[0]!.id, "month2-failed-row");
  });

  test("failed + completed inserts stamp the billing period into metadata (what the period narrowing reads back later)", async () => {
    const { deps, inserted } = makeDeps();
    await applyRetainerInvoiceCycle(
      invoiceEvent("invoice.payment_failed", { amount_due: 49700, amount_paid: 0 }),
      deps,
    );
    await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid", { id: "in_456" }), deps);
    assert.equal(inserted.length, 2);
    for (const row of inserted) {
      const metadata = row.metadata as { periodStart?: number; periodEnd?: number };
      assert.equal(metadata.periodStart, 2_000_000);
      assert.equal(metadata.periodEnd, 3_000_000);
    }
  });

  test("RECOVERY does not fire for invoice.payment_failed events (only invoice.paid recovers)", async () => {
    const { deps, updated } = makeDeps({
      findExistingBySourceId: async (sourceId) =>
        sourceId === "in_123" ? { id: "existing-failed-row-1", status: "failed", metadata: {} } : null,
    });
    const result = await applyRetainerInvoiceCycle(
      invoiceEvent("invoice.payment_failed", { amount_due: 49700, amount_paid: 0 }),
      deps,
    );
    // a repeat payment_failed for an already-failed row is just "already
    // recorded" (still failed) — no recovery semantics apply to a failure event.
    assert.equal(result.outcome, "already_recorded");
    assert.equal(updated.length, 0);
  });

  test("initial-close invoice (billing_reason subscription_create) → skipped, no insert", async () => {
    const { deps, inserted } = makeDeps();
    const result = await applyRetainerInvoiceCycle(
      invoiceEvent("invoice.paid", { billing_reason: "subscription_create" }),
      deps,
    );
    assert.equal(result.outcome, "skipped");
    assert.equal(inserted.length, 0);
  });

  test("unknown subscription (no proposal match) → logged skip, never throws", async () => {
    const { deps, inserted } = makeDeps({
      resolveProposalBySubscriptionId: async () => null,
    });
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "skipped");
    assert.equal(result.reason, "unknown_subscription");
    assert.equal(inserted.length, 0);
  });

  test("insertPaymentRecord throwing → caught, result is skipped (fail-soft, never propagates)", async () => {
    const { deps, inserted } = makeDeps({
      insertPaymentRecord: async () => {
        throw new Error("db exploded");
      },
    });
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "skipped");
    assert.equal(inserted.length, 0);
  });

  test("invoice.paid with a partial amount_paid → inserts a completed row with metadata.partial=true", async () => {
    const { deps, inserted } = makeDeps();
    const result = await applyRetainerInvoiceCycle(
      invoiceEvent("invoice.paid", { total: 49700, amount_paid: 20000 }),
      deps,
    );
    assert.equal(result.outcome, "recorded");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]!.amount, "200.00");
    const metadata = inserted[0]!.metadata as { partial?: boolean };
    assert.equal(metadata.partial, true);
  });

  test("invoice.payment_failed → inserts a failed row with dunning stamp", async () => {
    const { deps, inserted } = makeDeps();
    const result = await applyRetainerInvoiceCycle(
      invoiceEvent("invoice.payment_failed", { amount_due: 49700, amount_paid: 0 }),
      deps,
    );
    assert.equal(result.outcome, "recorded");
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0]!.status, "failed");
    const metadata = inserted[0]!.metadata as { dunning?: { failedAt?: string; notifyStage?: number } };
    assert.equal(metadata.dunning?.notifyStage, 0);
    assert.equal(typeof metadata.dunning?.failedAt, "string");
  });
});
