// Front-office bridge — tests for inviteClientToPortal
// (lib/deployments/portal-invite.ts), the testable core behind the "use server"
// inviteClientToPortalAction.
//
// Portal access is OPT-IN: the agency flips it on, which sends the client a
// magic link into their (provisioned) client workspace + stamps
// deployments.portalInvitedAt. Contract:
//   - REQUIRES deployment.clientOrgId (no provisioned workspace → nothing to
//     invite into).
//   - resolves a contact in the client org (primary contact, else create one
//     from deployment.clientContact.email); no email anywhere → can't invite.
//   - sends the magic link via the existing portal auth, then stamps
//     portalInvitedAt (re-invite allowed; updates the timestamp).
//
// All effects (slug load, contact resolve/create, magic-link, deployment update,
// clock) are DI'd — no DB / network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  inviteClientToPortal,
  type InviteClientToPortalDeps,
} from "../../../src/lib/deployments/portal-invite";
import type { Deployment } from "../../../src/db/schema/deployments";

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-1",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: { email: "owner@acme.test" },
    clientContext: null,
    surface: "phone",
    phoneNumber: "+18335550100",
    phoneNumberSid: null,
    numberOrigin: null,
    calendarRef: null,
    bookingMode: "native",
    externalBookingUrl: null,
    clientOrgId: "client-org-9",
    portalInvitedAt: null,
    priceCents: 0,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    status: "active",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  } as Deployment;
}

function baseDeps(over: Partial<InviteClientToPortalDeps> = {}): InviteClientToPortalDeps {
  return {
    loadOrgSlug: async () => "acme-plumbing",
    resolvePrimaryContactId: async () => "contact-1",
    createContactForEmail: async () => "contact-created",
    createMagicLink: async () => ({ inviteUrl: "https://app.test/customer/acme-plumbing/magic?token=x" }),
    updateDeployment: async () => {},
    now: () => new Date("2026-06-21T12:00:00Z"),
    ...over,
  };
}

describe("inviteClientToPortal", () => {
  test("requires clientOrgId — absent → { ok:false, no_client_org }, nothing sent/stamped", async () => {
    let sent = false;
    let stamped = false;
    const deps = baseDeps({
      createMagicLink: async () => {
        sent = true;
        return { inviteUrl: "x" };
      },
      updateDeployment: async () => {
        stamped = true;
      },
    });
    const result = await inviteClientToPortal(deps, fakeDeployment({ clientOrgId: null }));
    assert.deepEqual(result, { ok: false, error: "no_client_org" });
    assert.equal(sent, false);
    assert.equal(stamped, false);
  });

  test("happy — primary contact resolved → magic link sent → portalInvitedAt stamped", async () => {
    const calls: string[] = [];
    let magicArgs: { orgSlug: string; contactId: string } | null = null;
    let patch: { id: string; portalInvitedAt: Date } | null = null;
    const deps = baseDeps({
      loadOrgSlug: async (orgId) => {
        calls.push("slug");
        assert.equal(orgId, "client-org-9");
        return "acme-plumbing";
      },
      resolvePrimaryContactId: async (orgId) => {
        calls.push("contact");
        assert.equal(orgId, "client-org-9");
        return "contact-1";
      },
      createMagicLink: async (args) => {
        calls.push("magic");
        magicArgs = args;
        return { inviteUrl: "https://app.test/customer/acme-plumbing/magic?token=x" };
      },
      updateDeployment: async (id, p) => {
        calls.push("stamp");
        patch = { id, portalInvitedAt: p.portalInvitedAt };
      },
    });
    const result = await inviteClientToPortal(deps, fakeDeployment());
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ["slug", "contact", "magic", "stamp"]);
    assert.deepEqual(magicArgs, { orgSlug: "acme-plumbing", contactId: "contact-1" });
    assert.deepEqual(patch, { id: "dep-1", portalInvitedAt: new Date("2026-06-21T12:00:00Z") });
    if (result.ok) assert.match(result.inviteUrl, /\/magic\?token=/);
  });

  test("no primary contact → creates one from clientContact.email, then invites", async () => {
    let createdFrom: { orgId: string; email: string } | null = null;
    let magicContactId: string | null = null;
    const deps = baseDeps({
      resolvePrimaryContactId: async () => null, // no existing contact
      createContactForEmail: async (orgId, email) => {
        createdFrom = { orgId, email };
        return "contact-new";
      },
      createMagicLink: async (args) => {
        magicContactId = args.contactId;
        return { inviteUrl: "https://app.test/x" };
      },
    });
    const result = await inviteClientToPortal(deps, fakeDeployment());
    assert.equal(result.ok, true);
    assert.deepEqual(createdFrom, { orgId: "client-org-9", email: "owner@acme.test" });
    assert.equal(magicContactId, "contact-new");
  });

  test("no contact anywhere AND no clientContact.email → { ok:false, no_contact_email }", async () => {
    let sent = false;
    const deps = baseDeps({
      resolvePrimaryContactId: async () => null,
      createMagicLink: async () => {
        sent = true;
        return { inviteUrl: "x" };
      },
    });
    const result = await inviteClientToPortal(
      deps,
      fakeDeployment({ clientContact: null }),
    );
    assert.deepEqual(result, { ok: false, error: "no_contact_email" });
    assert.equal(sent, false);
  });

  test("re-invite is allowed and refreshes portalInvitedAt", async () => {
    const when = new Date("2026-07-01T09:00:00Z");
    let stampedAt: Date | null = null;
    const deps = baseDeps({
      now: () => when,
      updateDeployment: async (_id, p) => {
        stampedAt = p.portalInvitedAt;
      },
    });
    // Already invited earlier; re-invite must still send + update the stamp.
    const result = await inviteClientToPortal(
      deps,
      fakeDeployment({ portalInvitedAt: new Date("2026-06-21T12:00:00Z") }),
    );
    assert.equal(result.ok, true);
    assert.equal(stampedAt, when);
  });
});
