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
  });
});

describe("applyRetainerInvoiceCycle — end state via DI fakes", () => {
  function makeDeps(over: Partial<RetainerInvoiceCycleDeps> = {}): {
    deps: RetainerInvoiceCycleDeps;
    inserted: Array<Record<string, unknown>>;
  } {
    const inserted: Array<Record<string, unknown>> = [];
    const deps: RetainerInvoiceCycleDeps = {
      findExistingBySourceId: async () => null,
      resolveProposalBySubscriptionId: async () => ({
        agencyOrgId: "org-agency-1",
        contactId: "contact-1",
      }),
      insertPaymentRecord: async (row) => {
        inserted.push(row);
      },
      ...over,
    };
    return { deps, inserted };
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

  test("duplicate invoice.paid delivery (same stripeInvoiceId) → NO second row", async () => {
    const { deps, inserted } = makeDeps({
      findExistingBySourceId: async (sourceId) =>
        sourceId === "in_123" ? { id: "existing-row-1" } : null,
    });
    const result = await applyRetainerInvoiceCycle(invoiceEvent("invoice.paid"), deps);
    assert.equal(result.outcome, "already_recorded");
    assert.equal(inserted.length, 0);
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
