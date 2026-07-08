// Front-office bridge — tests for provisionClientWorkspaceForDeployment
// (lib/deployments/provision-client-workspace.ts).
//
// Provisioning runs at ACTIVATION, OFF the live-call path. It must be:
//   - IDEMPOTENT: deployment.clientOrgId already set → no-op (re-activation safe).
//   - SOFT-FAIL: createFullWorkspace error/throw → { ok:false }, clientOrgId NOT
//     persisted, never throws (activation must still succeed; the agent falls
//     back to builderOrgId writes until a later retry succeeds).
//   - BEST-EFFORT BRANDING: the agency attach (parentAgencyId) is best-effort —
//     a resolver/attach failure must NOT fail provisioning (clientOrgId is still
//     persisted, the workspace just stays unbranded/attachable later).
//
// Everything is DI'd — no createFullWorkspace, no DB, no network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  provisionClientWorkspaceForDeployment,
  copyTemplateConnectorsToAgent,
  type ProvisionClientWorkspaceDeps,
  type CopyTemplateConnectorsDeps,
} from "../../../src/lib/deployments/provision-client-workspace";
import type { Deployment } from "../../../src/db/schema/deployments";
import type { ConnectorBinding } from "../../../src/lib/agents/mcp/connectors";

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-1",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Acme Plumbing",
    clientContact: { phone: "+15125550101", email: "ops@acme.test" },
    clientContext: {
      soul: { businessName: "Acme Plumbing", services: [{ name: "Drain cleaning" }] },
    },
    surface: "phone",
    phoneNumber: "+18335550100",
    phoneNumberSid: "PNxxxx",
    numberOrigin: "provisioned",
    calendarRef: null,
    bookingMode: "native",
    externalBookingUrl: null,
    clientOrgId: null,
    portalInvitedAt: null,
    priceCents: 9900,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    status: "active",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    ...over,
  } as Deployment;
}

/** A baseline happy-path deps set; each test overrides the seam it exercises.
 *  enforceSubAccountCap defaults to always-allow so the existing suite (written
 *  before the cap gate existed) keeps exercising every OTHER seam unchanged. */
function baseDeps(over: Partial<ProvisionClientWorkspaceDeps> = {}): ProvisionClientWorkspaceDeps {
  return {
    createFullWorkspace: async () => ({ status: "ready", workspace_id: "client-org-9" }),
    resolveBuilderAgency: async () => "agency-1",
    setParentAgency: async () => {},
    updateDeployment: async () => {},
    enforceSubAccountCap: async () => ({ ok: true }),
    ...over,
  };
}

describe("provisionClientWorkspaceForDeployment", () => {
  test("idempotent — clientOrgId already set → no-op (no create, no persist)", async () => {
    let created = false;
    let updated = false;
    const deps = baseDeps({
      createFullWorkspace: async () => {
        created = true;
        return { status: "ready", workspace_id: "should-not-happen" };
      },
      updateDeployment: async () => {
        updated = true;
      },
    });
    const result = await provisionClientWorkspaceForDeployment(
      deps,
      fakeDeployment({ clientOrgId: "existing-org" }),
    );
    assert.deepEqual(result, { ok: true, orgId: "existing-org", skipped: true });
    assert.equal(created, false, "must NOT call createFullWorkspace when already provisioned");
    assert.equal(updated, false, "must NOT re-persist clientOrgId");
  });

  // 2026-07-08 post-review fix wave — spec invariant 5 (sub-account cap
  // bypassable + miscounts, BLOCKING). The deploy-provisioning path
  // (provisionClientWorkspaceForDeployment, invoked from
  // activateDeploymentAction's Twilio-number activation flow) was an
  // UNGATED write of parentAgencyId — a builder at the sub-account cap
  // could keep deploying client workspaces indefinitely by activating
  // more deployments. The cap must be checked BEFORE any provisioning
  // side effect (no half-provisioned state on rejection).
  test("BLOCKED at cap — enforceSubAccountCap rejects → no createFullWorkspace, no persist, structured reject returned", async () => {
    let created = false;
    let persisted = false;
    const deps = baseDeps({
      enforceSubAccountCap: async (builderOrgId) => {
        assert.equal(builderOrgId, "builder-1");
        return { ok: false, reason: "subaccount_limit_reached", used: 10, limit: 10 };
      },
      createFullWorkspace: async () => {
        created = true;
        return { status: "ready", workspace_id: "should-not-happen" };
      },
      updateDeployment: async () => {
        persisted = true;
      },
    });
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.deepEqual(result, {
      ok: false,
      error: "subaccount_limit_reached",
      used: 10,
      limit: 10,
    });
    assert.equal(created, false, "must NOT call createFullWorkspace when over cap");
    assert.equal(persisted, false, "must NOT persist clientOrgId when over cap");
  });

  test("UNDER cap — enforceSubAccountCap allows → provisioning proceeds normally", async () => {
    let capChecked = false;
    const deps = baseDeps({
      enforceSubAccountCap: async () => {
        capChecked = true;
        return { ok: true };
      },
    });
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.deepEqual(result, { ok: true, orgId: "client-org-9" });
    assert.equal(capChecked, true, "the cap gate must be consulted on every non-idempotent call");
  });

  test("idempotent skip path does NOT re-check the cap (already provisioned, no new attach)", async () => {
    let capChecked = false;
    const deps = baseDeps({
      enforceSubAccountCap: async () => {
        capChecked = true;
        return { ok: true };
      },
    });
    const result = await provisionClientWorkspaceForDeployment(
      deps,
      fakeDeployment({ clientOrgId: "existing-org" }),
    );
    assert.deepEqual(result, { ok: true, orgId: "existing-org", skipped: true });
    assert.equal(capChecked, false, "re-activation of an already-provisioned deployment must not re-check the cap");
  });

  test("happy — create ok → agency resolved → parentAgency set → clientOrgId persisted", async () => {
    const calls: string[] = [];
    let builtInputFrom: unknown = null;
    let attachArgs: { orgId: string; agencyId: string } | null = null;
    let persistedPatch: { id: string; patch: { clientOrgId?: string } } | null = null;
    const deps = baseDeps({
      buildInput: (args) => {
        builtInputFrom = args;
        return {
          business_name: "Acme Plumbing",
          city: "Austin",
          state: "TX",
          phone: "+15125550101",
          services: ["Drain cleaning"],
          business_description: "desc",
          email: null,
          address: null,
          weekly_hours: null,
        };
      },
      createFullWorkspace: async () => {
        calls.push("create");
        return { status: "ready", workspace_id: "client-org-9" };
      },
      resolveBuilderAgency: async (builderOrgId) => {
        calls.push("resolveAgency");
        assert.equal(builderOrgId, "builder-1");
        return "agency-1";
      },
      setParentAgency: async (orgId, agencyId) => {
        calls.push("setParentAgency");
        attachArgs = { orgId, agencyId };
      },
      updateDeployment: async (id, patch) => {
        calls.push("updateDeployment");
        persistedPatch = { id, patch };
      },
    });

    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.deepEqual(result, { ok: true, orgId: "client-org-9" });
    // create happens BEFORE the (best-effort) agency attach, and clientOrgId is persisted.
    assert.deepEqual(calls, ["create", "resolveAgency", "setParentAgency", "updateDeployment"]);
    assert.deepEqual(attachArgs, { orgId: "client-org-9", agencyId: "agency-1" });
    assert.deepEqual(persistedPatch, { id: "dep-1", patch: { clientOrgId: "client-org-9" } });
    // buildInput is fed the deployment's captured fields.
    assert.deepEqual(builtInputFrom, {
      clientName: "Acme Plumbing",
      clientContext: fakeDeployment().clientContext,
      clientContact: fakeDeployment().clientContact,
    });
  });

  test("no-agency — agency null → workspace created UNATTACHED, clientOrgId still persisted", async () => {
    let setCalled = false;
    let persisted: string | null = null;
    const deps = baseDeps({
      resolveBuilderAgency: async () => null,
      setParentAgency: async () => {
        setCalled = true;
      },
      updateDeployment: async (_id, patch) => {
        persisted = patch.clientOrgId ?? null;
      },
    });
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.deepEqual(result, { ok: true, orgId: "client-org-9" });
    assert.equal(setCalled, false, "no agency → never attach");
    assert.equal(persisted, "client-org-9", "clientOrgId persisted regardless of agency");
  });

  test("branding best-effort — setParentAgency throws → still ok, clientOrgId persisted", async () => {
    let persisted: string | null = null;
    const deps = baseDeps({
      resolveBuilderAgency: async () => "agency-1",
      setParentAgency: async () => {
        throw new Error("attach blew up");
      },
      updateDeployment: async (_id, patch) => {
        persisted = patch.clientOrgId ?? null;
      },
    });
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.deepEqual(result, { ok: true, orgId: "client-org-9" });
    assert.equal(persisted, "client-org-9", "attach failure must not block clientOrgId persistence");
  });

  test("soft-fail — createFullWorkspace returns error → { ok:false }, clientOrgId NOT persisted", async () => {
    let updated = false;
    const deps = baseDeps({
      createFullWorkspace: async () => ({ status: "error", error: { step: "validate", message: "bad" } }),
      updateDeployment: async () => {
        updated = true;
      },
    });
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.equal(result.ok, false);
    assert.equal(updated, false, "no clientOrgId persisted on create failure");
  });

  test("soft-fail — createFullWorkspace returns ready but no workspace_id → { ok:false }", async () => {
    const deps = baseDeps({
      createFullWorkspace: async () => ({ status: "ready" }),
    });
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.equal(result.ok, false);
  });

  test("soft-fail — createFullWorkspace THROWS → { ok:false }, never throws out", async () => {
    let updated = false;
    const deps = baseDeps({
      createFullWorkspace: async () => {
        throw new Error("neon down");
      },
      updateDeployment: async () => {
        updated = true;
      },
    });
    // Must not reject.
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.equal(result.ok, false);
    assert.equal(updated, false);
  });
});

// ── Activation-wiring contract ────────────────────────────────────────────
// The "use server" provisionDeploymentNumberAction can't be unit-booted (it
// calls getOrgId()/assertWritable()/real Twilio with no DI seam — repo
// convention is to test the logic layer). These lock the wiring the action
// performs: the provisioner is called with the deployments-store updateDeployment
// adapter shape, persists clientOrgId on success, and on a provisioning failure
// returns {ok:false} WITHOUT persisting + WITHOUT throwing — so the action can
// log + continue and activation still succeeds.
describe("provisionClientWorkspaceForDeployment — activation wiring", () => {
  // Mirror the action's updateDeployment adapter: a {clientOrgId} patch routed
  // through the store's updateDeployment(input) signature.
  function storeAdapter(captured: { id?: string; clientOrgId?: string }) {
    return async (id: string, patch: { clientOrgId: string }) => {
      // shape-equivalent to: await updateDeployment({ id, patch })
      captured.id = id;
      captured.clientOrgId = patch.clientOrgId;
    };
  }

  test("on success, the clientOrgId is persisted via the store adapter", async () => {
    const captured: { id?: string; clientOrgId?: string } = {};
    const deps = baseDeps({
      createFullWorkspace: async () => ({ status: "ready", workspace_id: "client-org-77" }),
      updateDeployment: storeAdapter(captured),
    });
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.deepEqual(result, { ok: true, orgId: "client-org-77" });
    assert.equal(captured.id, "dep-1");
    assert.equal(captured.clientOrgId, "client-org-77");
  });

  test("activation still succeeds when provisioning fails (no persist, no throw)", async () => {
    const captured: { id?: string; clientOrgId?: string } = {};
    const deps = baseDeps({
      createFullWorkspace: async () => {
        throw new Error("workspace creation exploded");
      },
      updateDeployment: storeAdapter(captured),
    });
    // The action wraps this in try/catch + an {ok:false} check; here we prove the
    // provisioner itself yields a clean {ok:false} (the action then continues).
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.equal(result.ok, false);
    assert.equal(captured.clientOrgId, undefined, "no clientOrgId persisted on failure");
  });
});

// ── #3 Task 5 Step 2 — copy template connectors onto the deployed text agent ──
//
// After the client workspace is provisioned, the deploying template's bound MCP
// connectors must be copied onto the client's slug='default' agent blueprint so
// the deployed TEXT agent gets the builder's connectors (the runtime seam reads
// agents.blueprint.connectors). It's:
//   - OPT-IN by data: a template with no connectors → a no-op (never touch the
//     agent), so the byte-for-byte native path is preserved for the common case.
//   - IDEMPOTENT + SOFT-FAIL: invoked best-effort from the provisioner; a failure
//     (or absence of the dep) NEVER breaks provisioning.
//   - VOICE NOT WIRED: this runs at provisioning regardless of surface, but only
//     the TEXT runtime (executeTurn) consumes connectors; the voice realtime path
//     ignores them (it's native-only). The copy is harmless either way.
describe("copyTemplateConnectorsToAgent (deploy-copy)", () => {
  const CONNECTORS: ConnectorBinding[] = [
    {
      id: "postiz",
      kind: "vetted",
      serviceName: "postiz",
      enabledTools: ["schedulePost"],
      tools: [{ name: "schedulePost", description: "x", inputSchema: { type: "object" } }],
    },
  ];

  function copyDeps(over: Partial<CopyTemplateConnectorsDeps> = {}): CopyTemplateConnectorsDeps {
    return {
      loadTemplateConnectors: async () => CONNECTORS,
      findClientDefaultAgentId: async () => "client-agent-1",
      updateAgentConnectors: async () => ({ ok: true }),
      ...over,
    };
  }

  test("copies the template's connectors onto the client default agent", async () => {
    let updated: { agentId: string; orgId: string; connectors: ConnectorBinding[] } | null = null;
    const deps = copyDeps({
      updateAgentConnectors: async (args) => {
        updated = args;
        return { ok: true };
      },
    });
    const result = await copyTemplateConnectorsToAgent(deps, {
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientOrgId: "client-org-9",
    });
    assert.deepEqual(result, { ok: true, copied: 1 });
    assert.deepEqual(updated, {
      agentId: "client-agent-1",
      orgId: "client-org-9",
      connectors: CONNECTORS,
    });
  });

  test("no connectors on the template → no-op (agent blueprint untouched)", async () => {
    let updateCalled = false;
    const deps = copyDeps({
      loadTemplateConnectors: async () => [],
      updateAgentConnectors: async () => {
        updateCalled = true;
        return { ok: true };
      },
    });
    const result = await copyTemplateConnectorsToAgent(deps, {
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientOrgId: "client-org-9",
    });
    assert.deepEqual(result, { ok: true, copied: 0 });
    assert.equal(updateCalled, false, "native path preserved — never update when no connectors");
  });

  test("client default agent missing → clean skip (no throw)", async () => {
    const deps = copyDeps({ findClientDefaultAgentId: async () => null });
    const result = await copyTemplateConnectorsToAgent(deps, {
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientOrgId: "client-org-9",
    });
    assert.deepEqual(result, { ok: false, reason: "no_client_agent" });
  });

  test("soft-fail — a thrown dep yields {ok:false}, never throws out", async () => {
    const deps = copyDeps({
      loadTemplateConnectors: async () => {
        throw new Error("db down");
      },
    });
    const result = await copyTemplateConnectorsToAgent(deps, {
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientOrgId: "client-org-9",
    });
    assert.equal(result.ok, false);
  });
});

describe("provisionClientWorkspaceForDeployment — connector copy wiring", () => {
  test("after clientOrgId is persisted, the copy seam runs with the template + client org", async () => {
    let copyArgs: { agentTemplateId: string; clientOrgId: string; builderOrgId: string } | null = null;
    const deps = baseDeps({
      createFullWorkspace: async () => ({ status: "ready", workspace_id: "client-org-42" }),
      // New best-effort seam (defaulted in the action). Provisioner calls it
      // after persisting clientOrgId.
      copyTemplateConnectors: async (args) => {
        copyArgs = args;
      },
    });
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.deepEqual(result, { ok: true, orgId: "client-org-42" });
    assert.deepEqual(copyArgs, {
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientOrgId: "client-org-42",
    });
  });

  test("a thrown copy seam never fails provisioning (clientOrgId still persisted)", async () => {
    let persisted: string | null = null;
    const deps = baseDeps({
      updateDeployment: async (_id, patch) => {
        persisted = patch.clientOrgId ?? null;
      },
      copyTemplateConnectors: async () => {
        throw new Error("copy blew up");
      },
    });
    const result = await provisionClientWorkspaceForDeployment(deps, fakeDeployment());
    assert.deepEqual(result, { ok: true, orgId: "client-org-9" });
    assert.equal(persisted, "client-org-9", "connector copy failure must not block provisioning");
  });

  test("idempotent skip path does NOT run the copy seam", async () => {
    let copyCalled = false;
    const deps = baseDeps({
      copyTemplateConnectors: async () => {
        copyCalled = true;
      },
    });
    await provisionClientWorkspaceForDeployment(
      deps,
      fakeDeployment({ clientOrgId: "existing-org" }),
    );
    assert.equal(copyCalled, false, "already-provisioned no-op must not re-copy connectors");
  });
});
