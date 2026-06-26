// F3 — attach a new agent to an EXISTING client instead of always creating a new
// one (fixes the duplicate "Acme Plumbing": deploying a 2nd agent used to spawn a
// 2nd client + a 2nd workspace/number).
//
// The fix is split into three pure/DI'd pieces, all tested here with NO DB:
//   1. resolveDeploymentClientMode — the branch decision (new vs. attach vs.
//      reject-a-foreign-id), given the agency's allow-list of client orgs.
//   2. createDeployment(existingClientOrgId) — the store writes clientOrgId onto
//      the new row for an ATTACH (so the idempotent provisioner no-ops → no
//      duplicate workspace) and leaves it ABSENT for a NEW client (today's path).
//   3. groupAttachableClients — derives the existing-client picker list from the
//      builder's deployments (grouped by provisioned clientOrgId), carrying the
//      shared number + the agents already on each client.
//
// To run:
//   cd packages/crm
//   node_modules/.bin/tsx --test tests/unit/deployments/attach-existing-client.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  createDeployment,
  groupAttachableClients,
  normalizeExistingClientOrgId,
  resolveDeploymentClientMode,
  type CreateDeploymentDeps,
  type DeploymentListItem,
} from "../../../src/lib/deployments/store";
import type { Deployment } from "../../../src/db/schema/deployments";
import type { AgentTemplate } from "../../../src/db/schema/agent-templates";

// ── fixtures ──────────────────────────────────────────────────────────

function fakeTemplate(over: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: "tmpl-1",
    builderOrgId: "builder-1",
    name: "Review Requester",
    slug: "review-requester",
    type: "voice_receptionist",
    blueprint: { archetype: "voice-receptionist" },
    status: "draft",
    evalScore: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as AgentTemplate;
}

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-1",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: null,
    clientContext: null,
    clientOrgId: null,
    surface: "phone",
    phoneNumber: null,
    phoneNumberSid: null,
    numberOrigin: null,
    calendarRef: null,
    bookingMode: "native",
    externalBookingUrl: null,
    bookingPolicy: null,
    customization: null,
    portalInvitedAt: null,
    priceCents: 9900,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Deployment;
}

/** A DeploymentListItem fixture for groupAttachableClients (only the fields it
 *  reads matter; the rest are filled to satisfy the type). */
function listItem(over: Partial<DeploymentListItem> = {}): DeploymentListItem {
  return {
    id: "dep-x",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: null,
    surface: "phone",
    phoneNumber: null,
    priceCents: 9900,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
    templateName: "AI Phone Receptionist",
    templateType: "voice_receptionist",
    templateTrigger: null,
    clientOrgId: "org-acme",
    portalInvitedAt: null,
    bookingMode: "native",
    calendarRef: null,
    bookingPolicy: null,
    customization: null,
    isOutbound: false,
    ...over,
  };
}

// ── 1. normalizeExistingClientOrgId (pure) ───────────────────────────────────

describe("normalizeExistingClientOrgId", () => {
  test("trims a real id; collapses blank / non-string to undefined", () => {
    assert.equal(normalizeExistingClientOrgId("  org-acme "), "org-acme");
    assert.equal(normalizeExistingClientOrgId(""), undefined);
    assert.equal(normalizeExistingClientOrgId("   "), undefined);
    assert.equal(normalizeExistingClientOrgId(null), undefined);
    assert.equal(normalizeExistingClientOrgId(undefined), undefined);
  });
});

// ── 2. resolveDeploymentClientMode (pure branch decision) ────────────────────

describe("resolveDeploymentClientMode", () => {
  test("no id → new client (today's default)", () => {
    assert.deepEqual(resolveDeploymentClientMode(undefined, ["org-acme"]), {
      mode: "new",
    });
    assert.deepEqual(resolveDeploymentClientMode("", ["org-acme"]), { mode: "new" });
    assert.deepEqual(resolveDeploymentClientMode(null, []), { mode: "new" });
  });

  test("id ∈ agency's clients → attach to that client org", () => {
    assert.deepEqual(
      resolveDeploymentClientMode("org-acme", ["org-acme", "org-beta"]),
      { mode: "attach", clientOrgId: "org-acme" },
    );
    // Set input is accepted too (the action may pass a Set).
    assert.deepEqual(
      resolveDeploymentClientMode("org-beta", new Set(["org-acme", "org-beta"])),
      { mode: "attach", clientOrgId: "org-beta" },
    );
  });

  test("id ∉ agency's clients → HARD reject (never silently create a new client)", () => {
    // The crux of the security guard: a stale/foreign id must NOT fall back to
    // 'new' (that would write into a foreign org or resurrect the dup-client bug).
    assert.deepEqual(resolveDeploymentClientMode("org-evil", ["org-acme"]), {
      mode: "error",
      error: "client_not_found",
    });
    assert.deepEqual(resolveDeploymentClientMode("org-acme", []), {
      mode: "error",
      error: "client_not_found",
    });
  });

  test("whitespace around a valid id still resolves to attach", () => {
    assert.deepEqual(
      resolveDeploymentClientMode("  org-acme  ", ["org-acme"]),
      { mode: "attach", clientOrgId: "org-acme" },
    );
  });
});

// ── 3. createDeployment — attach writes clientOrgId; new omits it ────────────

describe("createDeployment — attach vs. new client", () => {
  test("ATTACH: existingClientOrgId is written onto the new row (no new client)", async () => {
    let inserted: Record<string, unknown> | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values as Record<string, unknown>;
        return fakeDeployment({
          clientName: values.clientName,
          clientOrgId: (values as { clientOrgId?: string }).clientOrgId ?? null,
        });
      },
    };

    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme Plumbing",
      existingClientOrgId: "org-acme",
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(inserted, "insert must be called");
    const vals = inserted as Record<string, unknown>;
    // The whole point: the new deployment points at the EXISTING client org, so
    // provisionClientWorkspaceForDeployment short-circuits (clientOrgId set →
    // skipped) — ONE client, ONE workspace, no second number.
    assert.equal(vals.clientOrgId, "org-acme");
    assert.equal(vals.status, "draft");
    if (result.ok) assert.equal(result.deployment.clientOrgId, "org-acme");
  });

  test("NEW client: clientOrgId is ABSENT from the insert (provisioned on activation)", async () => {
    let inserted: Record<string, unknown> | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values as Record<string, unknown>;
        return fakeDeployment({ clientName: values.clientName });
      },
    };

    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Brand New Client",
      // no existingClientOrgId
      deps,
    });

    assert.equal(result.ok, true);
    assert.ok(inserted, "insert must be called");
    const vals = inserted as Record<string, unknown>;
    // Today's path is untouched: no clientOrgId key → the column stays null and
    // the activation-time provisioner creates the workspace as before.
    assert.equal(
      "clientOrgId" in vals,
      false,
      "new-client insert must NOT set clientOrgId",
    );
  });

  test("a blank existingClientOrgId is treated as NEW (key absent)", async () => {
    let inserted: Record<string, unknown> | null = null;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      insert: async (values) => {
        inserted = values as Record<string, unknown>;
        return fakeDeployment({ clientName: values.clientName });
      },
    };

    await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme Plumbing",
      existingClientOrgId: "   ",
      deps,
    });

    assert.ok(inserted, "insert must be called");
    const vals = inserted as Record<string, unknown>;
    assert.equal("clientOrgId" in vals, false);
  });

  test("ownership guard still applies (a foreign template can't attach)", async () => {
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate({ builderOrgId: "someone-else" }),
      insert: async () => {
        throw new Error("must not insert for a foreign template");
      },
    };

    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Acme Plumbing",
      existingClientOrgId: "org-acme",
      deps,
    });

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error, "template_not_found");
  });
});

// ── 4. groupAttachableClients (pure) ─────────────────────────────────────────

describe("groupAttachableClients", () => {
  test("groups deployments by clientOrgId into one attachable client each", () => {
    const clients = groupAttachableClients([
      // newest-first (matches listDeployments order)
      listItem({
        clientOrgId: "org-acme",
        clientName: "Acme Plumbing",
        phoneNumber: null,
        templateName: "Review Requester",
        status: "draft",
      }),
      listItem({
        clientOrgId: "org-acme",
        clientName: "Acme Plumbing",
        phoneNumber: "+15125550148",
        templateName: "AI Phone Receptionist",
        status: "active",
      }),
      listItem({
        clientOrgId: "org-beta",
        clientName: "Beta HVAC",
        phoneNumber: "+14155550199",
        templateName: "AI Phone Receptionist",
        status: "active",
      }),
    ]);

    assert.equal(clients.length, 2, "two distinct client orgs");

    const acme = clients.find((c) => c.clientOrgId === "org-acme");
    assert.ok(acme);
    assert.equal(acme!.clientName, "Acme Plumbing");
    // The shared line is surfaced even though the FIRST (newest) row had none.
    assert.equal(acme!.phoneNumber, "+15125550148");
    // Both agents already on the client are listed for context.
    assert.deepEqual(acme!.agentNames, ["Review Requester", "AI Phone Receptionist"]);

    const beta = clients.find((c) => c.clientOrgId === "org-beta");
    assert.equal(beta!.phoneNumber, "+14155550199");
  });

  test("skips deployments with no clientOrgId (no workspace → nothing to attach to)", () => {
    const clients = groupAttachableClients([
      listItem({ clientOrgId: null, clientName: "Draft Only" }),
    ]);
    assert.deepEqual(clients, []);
  });

  test("skips a CANCELED client (not a live attach target)", () => {
    const clients = groupAttachableClients([
      listItem({ clientOrgId: "org-dead", status: "canceled" }),
    ]);
    assert.deepEqual(clients, []);
  });

  test("de-dupes agent names across multiple deployments of the same template", () => {
    const clients = groupAttachableClients([
      listItem({ clientOrgId: "org-acme", templateName: "AI Receptionist" }),
      listItem({ clientOrgId: "org-acme", templateName: "AI Receptionist" }),
    ]);
    assert.equal(clients.length, 1);
    assert.deepEqual(clients[0].agentNames, ["AI Receptionist"]);
  });
});
