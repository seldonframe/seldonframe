// T11 — the "For myself" self-deploy core. Asserts org ids explicitly: the
// agency-write-vs-client-read bug class means this must NEVER target any org
// other than the caller's own.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  deployToSelfCore,
  deploymentSurfaceForTrigger,
  triggerSentence,
  type DeployToSelfDeps,
} from "@/lib/agents/lifecycle/deploy-to-self";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { AgentTrigger } from "@/lib/agents/triggers/agent-trigger";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";

function blueprintWithTrigger(trigger: AgentTrigger | null): AgentBlueprint {
  return { trigger: trigger ?? undefined } as unknown as AgentBlueprint;
}

function fakeDeps(overrides: Partial<DeployToSelfDeps> = {}): DeployToSelfDeps {
  return {
    createDeployment: async () => ({ ok: true, deploymentId: "dep-1" }),
    activateDeployment: async () => ({ ok: true }),
    ...overrides,
  };
}

describe("deploymentSurfaceForTrigger", () => {
  test("inbound voice → phone", () => {
    assert.equal(deploymentSurfaceForTrigger({ kind: "inbound", channel: "voice" }), "phone");
  });
  test("inbound chat → embed", () => {
    assert.equal(deploymentSurfaceForTrigger({ kind: "inbound", channel: "chat" }), "embed");
  });
  test("schedule → email", () => {
    assert.equal(deploymentSurfaceForTrigger({ kind: "schedule", cron: "0 * * * *", channel: "email" }), "email");
  });
  test("event sms → sms", () => {
    assert.equal(
      deploymentSurfaceForTrigger({ kind: "event", event: "booking.completed", channel: "sms" }),
      "sms",
    );
  });
});

describe("triggerSentence", () => {
  test("schedule → checks in on a schedule", () => {
    assert.match(triggerSentence({ kind: "schedule", cron: "0 * * * *", channel: "email" }), /schedule/);
  });
  test("inbound voice → answers your phone", () => {
    assert.match(triggerSentence({ kind: "inbound", channel: "voice" }), /answers your phone/);
  });
});

describe("deployToSelfCore", () => {
  test("self-target invariant: builderOrgId AND existingClientOrgId are BOTH the caller's own org, never any other id", async () => {
    let calledWith: unknown = null;
    const deps = fakeDeps({
      createDeployment: async (args) => {
        calledWith = args;
        return { ok: true, deploymentId: "dep-1" };
      },
    });

    await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTrigger({ kind: "schedule", cron: "0 * * * *", channel: "email" }),
    });

    const call = calledWith as { builderOrgId: string; existingClientOrgId: string; agentTemplateId: string };
    assert.equal(call.builderOrgId, ORG_ID);
    assert.equal(call.existingClientOrgId, ORG_ID);
    assert.equal(call.builderOrgId, call.existingClientOrgId, "must never diverge — self-target only");
    assert.equal(call.agentTemplateId, TEMPLATE_ID);
  });

  test("phone-less trigger (schedule) → activates immediately", async () => {
    let activateCalledWith: string | null = null;
    const deps = fakeDeps({
      activateDeployment: async (id) => {
        activateCalledWith = id;
        return { ok: true };
      },
    });

    const result = await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTrigger({ kind: "schedule", cron: "0 * * * *", channel: "email" }),
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.active, true);
      assert.equal(result.deploymentId, "dep-1");
    }
    assert.equal(activateCalledWith, "dep-1");
  });

  test("phone-owning trigger (inbound voice) → stays draft, never activated", async () => {
    let activateCalled = false;
    const deps = fakeDeps({
      activateDeployment: async () => {
        activateCalled = true;
        return { ok: true };
      },
    });

    const result = await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTrigger({ kind: "inbound", channel: "voice" }),
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.active, false);
    assert.equal(activateCalled, false, "must never auto-activate a phone-owning trigger");
  });

  test("createDeployment failure → ok:false, never attempts to activate", async () => {
    let activateCalled = false;
    const deps = fakeDeps({
      createDeployment: async () => ({ ok: false, error: "invalid_input" }),
      activateDeployment: async () => {
        activateCalled = true;
        return { ok: true };
      },
    });

    const result = await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTrigger(null),
    });

    assert.deepEqual(result, { ok: false, error: "create_failed" });
    assert.equal(activateCalled, false);
  });
});
