// packages/crm/tests/unit/payments/portal-billing.spec.ts
//
// Money-severity review fix (BLOCKING #1) — payment_records +
// contacts.customFields.billing are written under the AGENCY org
// (createDealOnAcceptance / retainer.ts), but the portal session's orgId is
// the CLIENT org. resolvePortalBillingData now takes the CLIENT org id,
// resolves the shared retainer join (lib/payments/retainer.ts::
// resolveRetainerLinkForClientOrg) to find the AGENCY org + agency-side
// contact, and reads payment_records + the card summary from THAT org —
// never from the client org directly. Pinned: a different client org's
// session (wrong/no proposal link) sees an empty state, never another
// org's rows — no cross-org leakage even via the join.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolvePortalBillingData,
  type PortalBillingDeps,
} from "@/lib/payments/portal-billing";
import type { RetainerLink } from "@/lib/payments/retainer";

function makeDeps(over: Partial<PortalBillingDeps> = {}): PortalBillingDeps {
  return {
    resolveRetainerLink: async () => null,
    listPaymentRecordsForContact: async () => [],
    getContactBillingCard: async () => null,
    ...over,
  };
}

const LINK: RetainerLink = { agencyOrgId: "org-agency-1", contactId: "contact-agency-1", stripeCustomerId: "cus_1" };

describe("resolvePortalBillingData — resolves the AGENCY-side org via the shared retainer join", () => {
  test("no retainer link for this client org → empty state (no payments, no card), never throws", async () => {
    const result = await resolvePortalBillingData("client-org-no-retainer", makeDeps());
    assert.deepEqual(result, { payments: [], card: null });
  });

  test("link resolved → reads payment_records + card scoped by the AGENCY org + agency-side contactId, NOT the client org", async () => {
    let capturedPaymentArgs: { orgId: string; contactId: string } | undefined;
    let capturedCardArgs: { orgId: string; contactId: string } | undefined;
    const deps = makeDeps({
      resolveRetainerLink: async (clientOrgId) => {
        assert.equal(clientOrgId, "client-org-1");
        return LINK;
      },
      listPaymentRecordsForContact: async (orgId, contactId) => {
        capturedPaymentArgs = { orgId, contactId };
        return [];
      },
      getContactBillingCard: async (orgId, contactId) => {
        capturedCardArgs = { orgId, contactId };
        return null;
      },
    });

    await resolvePortalBillingData("client-org-1", deps);

    // MUST be the AGENCY org + agency-side contact — never "client-org-1".
    assert.deepEqual(capturedPaymentArgs, { orgId: "org-agency-1", contactId: "contact-agency-1" });
    assert.deepEqual(capturedCardArgs, { orgId: "org-agency-1", contactId: "contact-agency-1" });
  });

  test("returns ONLY the rows the scoped (agency-side) query returns — no cross-org merge", async () => {
    const deps = makeDeps({
      resolveRetainerLink: async () => LINK,
      listPaymentRecordsForContact: async (orgId, contactId) => {
        if (orgId === "org-agency-1" && contactId === "contact-agency-1") {
          return [
            {
              id: "pay-1",
              amount: "497.00",
              currency: "USD",
              status: "completed",
              sourceBlock: "retainer",
              createdAt: new Date("2026-07-01T00:00:00Z"),
              metadata: { hostedInvoiceUrl: "https://invoice.stripe.com/i/1" },
            },
          ];
        }
        return [];
      },
    });

    const result = await resolvePortalBillingData("client-org-1", deps);
    assert.equal(result.payments.length, 1);
    assert.equal(result.payments[0]!.id, "pay-1");
  });

  test("a DIFFERENT client org whose retainer link resolves to null sees an empty state — never another org's rows", async () => {
    const deps = makeDeps({
      resolveRetainerLink: async (clientOrgId) => (clientOrgId === "client-org-1" ? LINK : null),
      listPaymentRecordsForContact: async () => [
        {
          id: "pay-leaked",
          amount: "1.00",
          currency: "USD",
          status: "completed",
          sourceBlock: "retainer",
          createdAt: new Date(),
          metadata: {},
        },
      ],
      getContactBillingCard: async () => ({ brand: "visa", last4: "0000", expMonth: 1, expYear: 2030 }),
    });

    // The legit client org sees its rows.
    const legit = await resolvePortalBillingData("client-org-1", deps);
    assert.equal(legit.payments.length, 1);

    // An impostor client org (no matching proposal → link resolves null)
    // NEVER reaches listPaymentRecordsForContact / getContactBillingCard at
    // all — empty state, even though the fakes above would happily return
    // data if called.
    const impostor = await resolvePortalBillingData("client-org-EVIL", deps);
    assert.deepEqual(impostor, { payments: [], card: null });
  });

  test("card summary passthrough from the agency-side contact's customFields.billing (brand/last4 only)", async () => {
    const deps = makeDeps({
      resolveRetainerLink: async () => LINK,
      getContactBillingCard: async () => ({ brand: "visa", last4: "4242", expMonth: 12, expYear: 2027 }),
    });
    const result = await resolvePortalBillingData("client-org-1", deps);
    assert.deepEqual(result.card, { brand: "visa", last4: "4242", expMonth: 12, expYear: 2027 });
  });

  test("link resolved but no card on file → card is null, never throws", async () => {
    const result = await resolvePortalBillingData("client-org-1", makeDeps({ resolveRetainerLink: async () => LINK }));
    assert.equal(result.card, null);
  });

  test("link resolved but no agency-side contactId → skips the scoped reads entirely (nothing to scope by), empty state", async () => {
    let paymentsCalled = false;
    let cardCalled = false;
    const deps = makeDeps({
      resolveRetainerLink: async () => ({ agencyOrgId: "org-agency-1", contactId: null, stripeCustomerId: "cus_1" }),
      listPaymentRecordsForContact: async () => {
        paymentsCalled = true;
        return [];
      },
      getContactBillingCard: async () => {
        cardCalled = true;
        return null;
      },
    });
    const result = await resolvePortalBillingData("client-org-1", deps);
    assert.deepEqual(result, { payments: [], card: null });
    assert.equal(paymentsCalled, false);
    assert.equal(cardCalled, false);
  });
});
