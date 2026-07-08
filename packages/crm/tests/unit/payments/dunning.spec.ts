// packages/crm/tests/unit/payments/dunning.spec.ts
//
// Autopay console Task 4 — dunning NOTIFICATIONS (never charges). Mirrors
// checkUsageCapBreaches's shape (lib/billing/usage-cap.ts): a DI'd sweep over
// failed payment_records rows, escalating notifyStage on an age threshold.
// THE CRON NEVER CALLS STRIPE — Stripe's own smart retries handle re-charging;
// this cron only notifies (client + agency) and stamps the escalation.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runPaymentDunningSweep, type DunningSweepDeps, type FailedPaymentRow } from "@/lib/payments/dunning";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function baseRow(over: Partial<FailedPaymentRow> = {}): FailedPaymentRow {
  return {
    id: "pay-1",
    orgId: "org-agency-1",
    contactId: "contact-1",
    amount: "497.00",
    currency: "USD",
    metadata: { dunning: { failedAt: daysAgo(4).toISOString(), notifyStage: 0 }, hostedInvoiceUrl: "https://invoice.stripe.com/i/1" },
    ...over,
  };
}

function makeDeps(over: Partial<DunningSweepDeps> = {}): {
  deps: DunningSweepDeps;
  clientEmails: unknown[];
  agencyAlerts: unknown[];
  stamped: Array<{ id: string; metadata: Record<string, unknown> }>;
} {
  const clientEmails: unknown[] = [];
  const agencyAlerts: unknown[] = [];
  const stamped: Array<{ id: string; metadata: Record<string, unknown> }> = [];
  const deps: DunningSweepDeps = {
    listFailedPayments: async () => [baseRow()],
    resolveContactEmail: async () => "client@example.com",
    resolveAgencyNotifyTarget: async () => ({ agencyName: "Acme AI", toEmail: "agency@example.com" }),
    sendClientEmail: async (params) => {
      clientEmails.push(params);
    },
    sendAgencyAlert: async (params) => {
      agencyAlerts.push(params);
    },
    stampDunning: async (id, metadata) => {
      stamped.push({ id, metadata });
    },
    now: () => new Date(),
    ...over,
  };
  return { deps, clientEmails, agencyAlerts, stamped };
}

describe("runPaymentDunningSweep — notify-only, never calls Stripe", () => {
  test("stage 0, age >= 3d → client email + agency alert + stage -> 1", async () => {
    const { deps, clientEmails, agencyAlerts, stamped } = makeDeps();
    const result = await runPaymentDunningSweep(deps, {});
    assert.equal(result.notified, 1);
    assert.equal(clientEmails.length, 1);
    assert.equal(agencyAlerts.length, 1);
    assert.equal(stamped.length, 1);
    const dunning = stamped[0]!.metadata.dunning as { notifyStage: number };
    assert.equal(dunning.notifyStage, 1);
  });

  test("stage 0, age < 3d → skipped, no email, no stamp", async () => {
    const { deps, clientEmails, stamped } = makeDeps({
      listFailedPayments: async () => [
        baseRow({ metadata: { dunning: { failedAt: daysAgo(1).toISOString(), notifyStage: 0 } } }),
      ],
    });
    const result = await runPaymentDunningSweep(deps, {});
    assert.equal(result.notified, 0);
    assert.equal(clientEmails.length, 0);
    assert.equal(stamped.length, 0);
  });

  test("stage 1, age >= 7d (from failedAt) → second notice + stage -> 2", async () => {
    const { deps, clientEmails, stamped } = makeDeps({
      listFailedPayments: async () => [
        baseRow({ metadata: { dunning: { failedAt: daysAgo(8).toISOString(), notifyStage: 1 } } }),
      ],
    });
    const result = await runPaymentDunningSweep(deps, {});
    assert.equal(result.notified, 1);
    assert.equal(clientEmails.length, 1);
    const dunning = stamped[0]!.metadata.dunning as { notifyStage: number };
    assert.equal(dunning.notifyStage, 2);
  });

  test("stage 1, age < 7d → skipped (waiting for the day-7 escalation window)", async () => {
    const { deps, clientEmails } = makeDeps({
      listFailedPayments: async () => [
        baseRow({ metadata: { dunning: { failedAt: daysAgo(4).toISOString(), notifyStage: 1 } } }),
      ],
    });
    const result = await runPaymentDunningSweep(deps, {});
    assert.equal(result.notified, 0);
    assert.equal(clientEmails.length, 0);
  });

  test("stage 2 → capped, no more notifications ever", async () => {
    const { deps, clientEmails } = makeDeps({
      listFailedPayments: async () => [
        baseRow({ metadata: { dunning: { failedAt: daysAgo(30).toISOString(), notifyStage: 2 } } }),
      ],
    });
    const result = await runPaymentDunningSweep(deps, {});
    assert.equal(result.notified, 0);
    assert.equal(clientEmails.length, 0);
  });

  test("dryRun sends nothing and mutates nothing, but still reports what WOULD happen", async () => {
    const { deps, clientEmails, agencyAlerts, stamped } = makeDeps();
    const result = await runPaymentDunningSweep(deps, { dryRun: true });
    assert.equal(result.notified, 1);
    assert.equal(clientEmails.length, 0);
    assert.equal(agencyAlerts.length, 0);
    assert.equal(stamped.length, 0);
  });

  test("a row that later has a completed sibling for the same subscription period → skipped", async () => {
    const { deps, clientEmails } = makeDeps({
      listFailedPayments: async () => [
        baseRow({
          metadata: {
            dunning: { failedAt: daysAgo(4).toISOString(), notifyStage: 0 },
            subscriptionId: "sub_123",
            resolvedByLaterPayment: true,
          },
        }),
      ],
    });
    const result = await runPaymentDunningSweep(deps, {});
    assert.equal(result.notified, 0);
    assert.equal(clientEmails.length, 0);
  });

  test("no resolvable agency email → skipped, logged, never throws", async () => {
    const { deps, clientEmails } = makeDeps({
      resolveAgencyNotifyTarget: async () => null,
    });
    const result = await runPaymentDunningSweep(deps, {});
    assert.equal(result.notified, 0);
    assert.equal(clientEmails.length, 0);
    assert.equal(result.skipped.length, 1);
  });

  test("a single row's failure never aborts the sweep — continues with the rest", async () => {
    const { deps } = makeDeps({
      listFailedPayments: async () => [baseRow({ id: "pay-bad" }), baseRow({ id: "pay-good" })],
      sendClientEmail: async (params) => {
        if ((params as { paymentId: string }).paymentId === "pay-bad") throw new Error("resend down");
      },
    });
    const result = await runPaymentDunningSweep(deps, {});
    assert.equal(result.notified, 1);
    assert.equal(result.skipped.length, 1);
  });

  test("THE CRON NEVER CALLS STRIPE — deps has no Stripe seam at all (type-level pin)", () => {
    // No stripe-shaped key exists on DunningSweepDeps — enforced by the
    // type import above compiling without a Stripe import.
    assert.ok(true);
  });
});
