// T11 — the "For myself" self-deploy core. Asserts org ids explicitly: the
// agency-write-vs-client-read bug class means this must NEVER target any org
// other than the caller's own.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  deployToSelfCore,
  deploymentSurfaceForTrigger,
  triggerSentence,
  blueprintHasGmailBinding,
  type DeployToSelfDeps,
} from "@/lib/agents/lifecycle/deploy-to-self";
import type { AgentBlueprint } from "@/db/schema/agents";
import type { AgentTrigger } from "@/lib/agents/triggers/agent-trigger";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";

function blueprintWithTrigger(trigger: AgentTrigger | null): AgentBlueprint {
  return { trigger: trigger ?? undefined } as unknown as AgentBlueprint;
}

const GMAIL_BINDING = {
  id: "c1",
  kind: "composio",
  enabledToolkits: ["gmail"],
  enabledTools: ["GMAIL_FETCH_EMAILS"],
};

function blueprintWithTriggerAndConnectors(
  trigger: AgentTrigger | null,
  connectors: unknown[],
): AgentBlueprint {
  return { trigger: trigger ?? undefined, connectors } as unknown as AgentBlueprint;
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

describe("blueprintHasGmailBinding", () => {
  test("true when a composio binding enables the gmail toolkit", () => {
    assert.equal(blueprintHasGmailBinding({ connectors: [GMAIL_BINDING] }), true);
  });
  test("false with no connectors", () => {
    assert.equal(blueprintHasGmailBinding({ connectors: [] }), false);
    assert.equal(blueprintHasGmailBinding({}), false);
    assert.equal(blueprintHasGmailBinding(null), false);
  });
  test("false when connectors bind a different toolkit", () => {
    assert.equal(
      blueprintHasGmailBinding({
        connectors: [{ id: "c1", kind: "composio", enabledToolkits: ["slack"], enabledTools: [] }],
      }),
      false,
    );
  });
  test("false for a non-composio (vetted/byo) binding", () => {
    assert.equal(
      blueprintHasGmailBinding({
        connectors: [{ id: "c1", kind: "vetted", serviceName: "postiz", enabledTools: [] }],
      }),
      false,
    );
  });
});

describe("deployToSelfCore — voice-profile ingestion (Part A3)", () => {
  test("fires ingestVoiceProfile for an email + gmail-bound template", async () => {
    let ingestedOrgId: string | null = null;
    const deps = fakeDeps({
      ingestVoiceProfile: async (args) => {
        ingestedOrgId = args.orgId;
      },
    });

    const result = await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTriggerAndConnectors(
        { kind: "schedule", cron: "0 * * * *", channel: "email" },
        [GMAIL_BINDING],
      ),
    });

    assert.equal(result.ok, true);
    assert.equal(ingestedOrgId, ORG_ID);
  });

  test("does NOT fire ingestVoiceProfile for an sms template", async () => {
    let called = false;
    const deps = fakeDeps({
      ingestVoiceProfile: async () => {
        called = true;
      },
    });

    await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTriggerAndConnectors(
        { kind: "event", event: "lead.created", channel: "sms" },
        [GMAIL_BINDING],
      ),
    });

    assert.equal(called, false);
  });

  test("does NOT fire ingestVoiceProfile for an email template with no gmail binding", async () => {
    let called = false;
    const deps = fakeDeps({
      ingestVoiceProfile: async () => {
        called = true;
      },
    });

    await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTrigger({ kind: "schedule", cron: "0 * * * *", channel: "email" }),
    });

    assert.equal(called, false);
  });

  test("ingestVoiceProfile throwing NEVER fails the deploy", async () => {
    const deps = fakeDeps({
      ingestVoiceProfile: async () => {
        throw new Error("composio down");
      },
    });

    const result = await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTriggerAndConnectors(
        { kind: "schedule", cron: "0 * * * *", channel: "email" },
        [GMAIL_BINDING],
      ),
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.deploymentId, "dep-1");
  });
});

describe("deployToSelfCore — poll->push upgrade hook (Part B2)", () => {
  test("calls maybeUpgradeInboxTrigger with the created deploymentId", async () => {
    let calledWith: unknown = null;
    const deps = fakeDeps({
      maybeUpgradeInboxTrigger: async (args) => {
        calledWith = args;
        return { upgraded: true };
      },
    });

    const result = await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTrigger({ kind: "schedule", cron: "0 * * * *", channel: "email" }),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(calledWith, { orgId: ORG_ID, deploymentId: "dep-1" });
  });

  test("maybeUpgradeInboxTrigger throwing NEVER fails the deploy", async () => {
    const deps = fakeDeps({
      maybeUpgradeInboxTrigger: async () => {
        throw new Error("composio down");
      },
    });

    const result = await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTrigger({ kind: "schedule", cron: "0 * * * *", channel: "email" }),
    });

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.deploymentId, "dep-1");
  });

  test("absent maybeUpgradeInboxTrigger dep -> no-op, deploy unaffected", async () => {
    const deps = fakeDeps();
    const result = await deployToSelfCore(deps, {
      orgId: ORG_ID,
      orgName: "Acme Plumbing",
      templateId: TEMPLATE_ID,
      blueprint: blueprintWithTrigger({ kind: "schedule", cron: "0 * * * *", channel: "email" }),
    });
    assert.equal(result.ok, true);
  });
});
