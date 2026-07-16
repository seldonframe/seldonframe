// Email-agent slice (Part B2) — poll -> push upgrade for a record-compiled
// inbox-watch agent. ALL conditions must hold (schedule/email/inbox-watch
// cron + gmail binding + webhook secret configured + gmail connected) before
// a live createTrigger call flips the template's trigger to event/push. Any
// missing condition or failure leaves the hourly schedule intact (the floor).

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  maybeUpgradeInboxTriggerToPush,
  resolveConnectedAccountId,
  type UpgradeInboxTriggerDeps,
} from "../../../src/lib/deployments/upgrade-inbox-trigger";
import type { AgentBlueprint } from "../../../src/db/schema/agents";

const ORG = "org_1";
const DEPLOYMENT = "dep_1";
const TEMPLATE = "tmpl_1";

const GMAIL_BINDING = {
  id: "c1",
  kind: "composio",
  enabledToolkits: ["gmail"],
  enabledTools: ["GMAIL_FETCH_EMAILS"],
};

function inboxWatchBlueprint(overrides: Record<string, unknown> = {}): AgentBlueprint {
  return {
    trigger: { kind: "schedule", cron: "0 * * * *", channel: "email" },
    connectors: [GMAIL_BINDING],
    ...overrides,
  } as unknown as AgentBlueprint;
}

function fakeDeps(overrides: Partial<UpgradeInboxTriggerDeps> = {}): UpgradeInboxTriggerDeps {
  return {
    getDeployment: async () => ({ orgId: ORG, agentTemplateId: TEMPLATE }),
    getTemplateBlueprint: async () => inboxWatchBlueprint(),
    countDeploymentsForTemplate: async () => 1,
    hasWebhookSecret: () => true,
    isGmailConnected: async () => true,
    createTrigger: async () => ({ triggerId: "trig_1" }),
    updateTemplateTrigger: async () => {},
    stampUpgraded: async () => {},
    now: () => new Date("2026-07-12T12:00:00Z"),
    ...overrides,
  };
}

test("full conditions -> upgraded + trigger flipped to event/push", async () => {
  let updatedTrigger: unknown = null;
  let stampedDeploymentId: string | null = null;
  const deps = fakeDeps({
    updateTemplateTrigger: async (templateId, trigger) => {
      assert.equal(templateId, TEMPLATE);
      updatedTrigger = trigger;
    },
    stampUpgraded: async (deploymentId) => {
      stampedDeploymentId = deploymentId;
    },
  });

  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });

  assert.deepEqual(r, { upgraded: true });
  assert.deepEqual(updatedTrigger, {
    kind: "event",
    event: "composio.gmail.new_message",
    channel: "email",
  });
  assert.equal(stampedDeploymentId, DEPLOYMENT);
});

test("not a schedule trigger -> not upgraded, schedule (i.e. whatever it was) intact", async () => {
  let updateCalled = false;
  const deps = fakeDeps({
    getTemplateBlueprint: async () =>
      inboxWatchBlueprint({ trigger: { kind: "inbound", channel: "email" } }),
    updateTemplateTrigger: async () => {
      updateCalled = true;
    },
  });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.equal(r.upgraded, false);
  assert.equal(updateCalled, false);
});

test("not the inferred inbox-watch cron -> not upgraded", async () => {
  const deps = fakeDeps({
    getTemplateBlueprint: async () =>
      inboxWatchBlueprint({ trigger: { kind: "schedule", cron: "0 9 * * *", channel: "email" } }),
  });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.equal(r.upgraded, false);
});

test("no gmail binding -> not upgraded", async () => {
  const deps = fakeDeps({
    getTemplateBlueprint: async () => inboxWatchBlueprint({ connectors: [] }),
  });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.equal(r.upgraded, false);
});

test("no COMPOSIO_WEBHOOK_SECRET configured -> not upgraded", async () => {
  const deps = fakeDeps({ hasWebhookSecret: () => false });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.equal(r.upgraded, false);
});

test("gmail not connected for the org -> not upgraded", async () => {
  const deps = fakeDeps({ isGmailConnected: async () => false });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.equal(r.upgraded, false);
});

test("createTrigger returns no triggerId -> not upgraded, schedule intact", async () => {
  let updateCalled = false;
  const deps = fakeDeps({
    createTrigger: async () => ({ triggerId: null }),
    updateTemplateTrigger: async () => {
      updateCalled = true;
    },
  });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.equal(r.upgraded, false);
  assert.equal(updateCalled, false);
});

test("createTrigger throwing -> not upgraded, never throws", async () => {
  const deps = fakeDeps({
    createTrigger: async () => {
      throw new Error("composio down");
    },
  });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.equal(r.upgraded, false);
  assert.ok(r.reason);
});

test("deployment not found -> not upgraded, never throws", async () => {
  const deps = fakeDeps({ getDeployment: async () => null });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.equal(r.upgraded, false);
});

test("deployment belongs to a different org -> not upgraded (org-scoped)", async () => {
  const deps = fakeDeps({ getDeployment: async () => ({ orgId: "other_org", agentTemplateId: TEMPLATE }) });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.equal(r.upgraded, false);
});

// verify-gate FIX 4 — a shared multi-client template must never inherit an
// event trigger it never registered its own Composio createTrigger for.
test("FIX 4 — template has >1 deployment -> refuse the flip, reason multi_deployment", async () => {
  let updateCalled = false;
  const deps = fakeDeps({
    countDeploymentsForTemplate: async (agentTemplateId) => {
      assert.equal(agentTemplateId, TEMPLATE);
      return 2;
    },
    updateTemplateTrigger: async () => {
      updateCalled = true;
    },
  });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.deepEqual(r, { upgraded: false, reason: "multi_deployment" });
  assert.equal(updateCalled, false);
});

test("FIX 4 — template has exactly 1 deployment -> upgrade proceeds normally", async () => {
  const deps = fakeDeps({ countDeploymentsForTemplate: async () => 1 });
  const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
  assert.deepEqual(r, { upgraded: true });
});

// Agent receipts slice (Task 4) — resolveConnectedAccountId (pure).
describe("resolveConnectedAccountId", () => {
  test("0 accounts -> null", () => {
    assert.equal(resolveConnectedAccountId([]), null);
  });
  test("1 account -> that id", () => {
    assert.equal(resolveConnectedAccountId(["acc_1"]), "acc_1");
  });
  test(">1 accounts -> the first", () => {
    assert.equal(resolveConnectedAccountId(["acc_1", "acc_2", "acc_3"]), "acc_1");
  });
});

// Agent receipts slice (Task 4) — the connected-account pin wiring.
describe("maybeUpgradeInboxTriggerToPush — connected-account pin", () => {
  test("no listConnectedAccounts dep -> createTrigger called with no connectedAccountId (unchanged behavior)", async () => {
    let createTriggerArgs: unknown[] = [];
    const deps = fakeDeps({
      createTrigger: async (...args: unknown[]) => {
        createTriggerArgs = args;
        return { triggerId: "trig_1" };
      },
    });
    const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
    assert.equal(r.upgraded, true);
    assert.deepEqual(createTriggerArgs, [ORG, null]);
  });

  test("1 connected account -> pinned + persisted + passed to createTrigger", async () => {
    let persistedArgs: unknown = null;
    let createTriggerArgs: unknown[] = [];
    const deps = fakeDeps({
      listConnectedAccounts: async () => ["acc_only"],
      persistConnectedAccountId: async (deploymentId, connectedAccountId) => {
        persistedArgs = { deploymentId, connectedAccountId };
      },
      createTrigger: async (...args: unknown[]) => {
        createTriggerArgs = args;
        return { triggerId: "trig_1" };
      },
    });
    const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
    assert.equal(r.upgraded, true);
    assert.deepEqual(persistedArgs, { deploymentId: DEPLOYMENT, connectedAccountId: "acc_only" });
    assert.deepEqual(createTriggerArgs, [ORG, "acc_only"]);
  });

  test(">1 connected accounts -> the FIRST is pinned + persisted + passed to createTrigger", async () => {
    let createTriggerArgs: unknown[] = [];
    const deps = fakeDeps({
      listConnectedAccounts: async () => ["acc_a", "acc_b"],
      createTrigger: async (...args: unknown[]) => {
        createTriggerArgs = args;
        return { triggerId: "trig_1" };
      },
    });
    const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
    assert.equal(r.upgraded, true);
    assert.deepEqual(createTriggerArgs, [ORG, "acc_a"]);
  });

  test("0 connected accounts -> createTrigger called with null, no persist attempted", async () => {
    let persistCalled = false;
    let createTriggerArgs: unknown[] = [];
    const deps = fakeDeps({
      listConnectedAccounts: async () => [],
      persistConnectedAccountId: async () => {
        persistCalled = true;
      },
      createTrigger: async (...args: unknown[]) => {
        createTriggerArgs = args;
        return { triggerId: "trig_1" };
      },
    });
    const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
    assert.equal(r.upgraded, true);
    assert.equal(persistCalled, false);
    assert.deepEqual(createTriggerArgs, [ORG, null]);
  });

  test("a throwing listConnectedAccounts is swallowed — upgrade still proceeds with no pin", async () => {
    let createTriggerArgs: unknown[] = [];
    const deps = fakeDeps({
      listConnectedAccounts: async () => {
        throw new Error("composio down");
      },
      createTrigger: async (...args: unknown[]) => {
        createTriggerArgs = args;
        return { triggerId: "trig_1" };
      },
    });
    const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
    assert.equal(r.upgraded, true);
    assert.deepEqual(createTriggerArgs, [ORG, null]);
  });

  test("a throwing persistConnectedAccountId is swallowed — upgrade still proceeds, trigger still pinned", async () => {
    let createTriggerArgs: unknown[] = [];
    const deps = fakeDeps({
      listConnectedAccounts: async () => ["acc_only"],
      persistConnectedAccountId: async () => {
        throw new Error("db down");
      },
      createTrigger: async (...args: unknown[]) => {
        createTriggerArgs = args;
        return { triggerId: "trig_1" };
      },
    });
    const r = await maybeUpgradeInboxTriggerToPush(deps, { orgId: ORG, deploymentId: DEPLOYMENT });
    assert.equal(r.upgraded, true);
    assert.deepEqual(createTriggerArgs, [ORG, "acc_only"]);
  });
});
