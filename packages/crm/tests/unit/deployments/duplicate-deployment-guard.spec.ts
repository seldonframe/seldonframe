// Duplicate-deployment guard (2026-07-16) — born from a live incident: the
// same push-triggered Gmail template deployed 3× to the same mailbox ran 3
// paid agentic turns per incoming email until the operator's Anthropic
// credits were gone. createDeployment now REJECTS an exact duplicate (same
// builder + template + surface + client target, non-canceled) unless the
// caller passes the explicit `allowDuplicate: true` escape hatch.
//
// Properties under test:
//   - duplicate found → { ok:false, error:"duplicate_deployment",
//     duplicateOfDeploymentId } and insert is NEVER called
//   - allowDuplicate: true → guard skipped (findDuplicate not even consulted),
//     insert proceeds
//   - no duplicate → create proceeds (guard is a pass-through)
//   - the guard passes the resolved client target: clientOrgId on the attach
//     path, null + clientName on the new-client path
//   - deployToSelfCore maps duplicate_deployment → its own "already_deployed"

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  createDeployment,
  type CreateDeploymentDeps,
} from "@/lib/deployments/store";
import { deployToSelfCore } from "@/lib/agents/lifecycle/deploy-to-self";
import type { AgentTemplate } from "@/db/schema/agent-templates";
import type { Deployment } from "@/db/schema/deployments";
import type { AgentBlueprint } from "@/db/schema/agents";

function fakeTemplate(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: "tmpl-1",
    builderOrgId: "builder-1",
    name: "Gmail forwarder",
    type: "chat",
    blueprint: {},
    ...overrides,
  } as AgentTemplate;
}

function fakeDeployment(overrides: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-new",
    builderOrgId: "builder-1",
    agentTemplateId: "tmpl-1",
    clientName: "Zen Flow Hydration",
    surface: "email",
    status: "draft",
    ...overrides,
  } as Deployment;
}

describe("createDeployment — duplicate guard", () => {
  test("rejects an exact duplicate and never inserts", async () => {
    let insertCalled = false;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      findDuplicate: async () => ({ id: "dep-existing" }),
      insert: async () => {
        insertCalled = true;
        return fakeDeployment();
      },
    };
    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Zen Flow Hydration",
      surface: "email",
      deps,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "duplicate_deployment");
      assert.equal(result.duplicateOfDeploymentId, "dep-existing");
    }
    assert.equal(insertCalled, false, "a duplicate must never insert");
  });

  test("allowDuplicate: true skips the guard entirely and inserts", async () => {
    let findDuplicateCalled = false;
    let insertCalled = false;
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      findDuplicate: async () => {
        findDuplicateCalled = true;
        return { id: "dep-existing" };
      },
      insert: async () => {
        insertCalled = true;
        return fakeDeployment();
      },
    };
    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Zen Flow Hydration",
      surface: "email",
      allowDuplicate: true,
      deps,
    });
    assert.equal(result.ok, true);
    assert.equal(insertCalled, true);
    assert.equal(
      findDuplicateCalled,
      false,
      "explicit override must not even consult the guard",
    );
  });

  test("no duplicate → create proceeds normally", async () => {
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      findDuplicate: async () => null,
      insert: async () => fakeDeployment(),
    };
    const result = await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Zen Flow Hydration",
      surface: "email",
      deps,
    });
    assert.equal(result.ok, true);
  });

  test("attach path passes the clientOrgId as the client target; new-client path passes null", async () => {
    const seen: Array<{ clientOrgId: string | null; clientName: string }> = [];
    const deps: CreateDeploymentDeps = {
      findTemplateById: async () => fakeTemplate(),
      findDuplicate: async (args) => {
        seen.push({ clientOrgId: args.clientOrgId, clientName: args.clientName });
        return null;
      },
      insert: async () => fakeDeployment(),
    };
    await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "Zen Flow Hydration",
      surface: "email",
      existingClientOrgId: "client-org-9",
      deps,
    });
    await createDeployment({
      builderOrgId: "builder-1",
      agentTemplateId: "tmpl-1",
      clientName: "New Client Co",
      surface: "email",
      deps,
    });
    assert.deepEqual(seen, [
      { clientOrgId: "client-org-9", clientName: "Zen Flow Hydration" },
      { clientOrgId: null, clientName: "New Client Co" },
    ]);
  });
});

describe("deployToSelfCore — duplicate surfaces as already_deployed", () => {
  test("maps the store's duplicate_deployment to its own variant", async () => {
    const result = await deployToSelfCore(
      {
        createDeployment: async () => ({
          ok: false,
          error: "duplicate_deployment",
        }),
        activateDeployment: async () => ({ ok: true }),
      },
      {
        orgId: "org-1",
        orgName: "Zen Flow Hydration",
        templateId: "tmpl-1",
        blueprint: {
          trigger: { kind: "event", channel: "email", event: "composio.gmail.new_message" },
        } as unknown as AgentBlueprint,
      },
    );
    assert.deepEqual(result, { ok: false, error: "already_deployed" });
  });

  test("any other create failure still maps to create_failed", async () => {
    const result = await deployToSelfCore(
      {
        createDeployment: async () => ({ ok: false, error: "invalid_input" }),
        activateDeployment: async () => ({ ok: true }),
      },
      {
        orgId: "org-1",
        orgName: "Zen Flow Hydration",
        templateId: "tmpl-1",
        blueprint: {
          trigger: { kind: "event", channel: "email", event: "composio.gmail.new_message" },
        } as unknown as AgentBlueprint,
      },
    );
    assert.deepEqual(result, { ok: false, error: "create_failed" });
  });
});
