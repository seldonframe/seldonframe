// packages/crm/tests/unit/payments/retainer-link.spec.ts
//
// Money-severity review fix (BLOCKING #1) — the shared retainer join.
// payment_records + contacts.customFields.billing are written under the
// AGENCY org (createDealOnAcceptance / retainer.ts's insertPaymentRecord),
// but a portal session's orgId is the CLIENT org. `resolveRetainerLinkForClientOrg`
// is the ONE place that resolves session.orgId (client) -> proposals.previewWorkspaceId
// -> {agencyOrgId, contactId, stripeCustomerId} so portal-billing's history,
// card, and update-card reads all agree on which org actually owns the rows.
//
// Pinned: a DIFFERENT client org's session (wrong previewWorkspaceId) can
// NEVER resolve another org's link — no cross-org leakage via the join.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveRetainerLinkForClientOrg,
  type RetainerLinkDeps,
} from "@/lib/payments/retainer";

function makeDeps(over: Partial<RetainerLinkDeps> = {}): RetainerLinkDeps {
  return {
    findProposalByClientOrgId: async () => null,
    resolveContactForAgency: async () => null,
    ...over,
  };
}

describe("resolveRetainerLinkForClientOrg", () => {
  test("no proposal for this clientOrgId → null (empty state, never a throw)", async () => {
    const result = await resolveRetainerLinkForClientOrg("client-org-nope", makeDeps());
    assert.equal(result, null);
  });

  test("proposal found → resolves {agencyOrgId, contactId, stripeCustomerId} via the SAME agency-org contact lookup createDealOnAcceptance uses", async () => {
    const deps = makeDeps({
      findProposalByClientOrgId: async (clientOrgId) => {
        assert.equal(clientOrgId, "client-org-1");
        return { agencyOrgId: "org-agency-1", prospectEmail: "owner@acme.com", stripeCustomerId: "cus_123" };
      },
      resolveContactForAgency: async (agencyOrgId, email) => {
        assert.equal(agencyOrgId, "org-agency-1");
        assert.equal(email, "owner@acme.com");
        return { id: "contact-agency-side-1" };
      },
    });

    const result = await resolveRetainerLinkForClientOrg("client-org-1", deps);
    assert.deepEqual(result, {
      agencyOrgId: "org-agency-1",
      contactId: "contact-agency-side-1",
      stripeCustomerId: "cus_123",
    });
  });

  test("proposal found but no matching agency-side contact → contactId null, still resolves agencyOrgId (never throws)", async () => {
    const deps = makeDeps({
      findProposalByClientOrgId: async () => ({
        agencyOrgId: "org-agency-1",
        prospectEmail: "owner@acme.com",
        stripeCustomerId: null,
      }),
      resolveContactForAgency: async () => null,
    });

    const result = await resolveRetainerLinkForClientOrg("client-org-1", deps);
    assert.deepEqual(result, { agencyOrgId: "org-agency-1", contactId: null, stripeCustomerId: null });
  });

  test("a DIFFERENT client org's session can never resolve THIS org's link — wrong clientOrgId -> null", async () => {
    const deps: RetainerLinkDeps = {
      findProposalByClientOrgId: async (clientOrgId) => {
        // Simulate a DB that only has a proposal for "client-org-1" —
        // asking for any other id must return nothing, never fall back to
        // "any proposal" or leak across orgs.
        if (clientOrgId === "client-org-1") {
          return { agencyOrgId: "org-agency-1", prospectEmail: "owner@acme.com", stripeCustomerId: "cus_123" };
        }
        return null;
      },
      resolveContactForAgency: async () => ({ id: "contact-agency-side-1" }),
    };

    const legit = await resolveRetainerLinkForClientOrg("client-org-1", deps);
    assert.equal(legit?.agencyOrgId, "org-agency-1");

    const impostor = await resolveRetainerLinkForClientOrg("client-org-EVIL", deps);
    assert.equal(impostor, null);
  });
});
