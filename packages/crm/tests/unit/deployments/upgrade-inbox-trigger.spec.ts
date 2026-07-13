// Email-agent slice (Part B2) — poll -> push upgrade for a record-compiled
// inbox-watch agent. ALL conditions must hold (schedule/email/inbox-watch
// cron + gmail binding + webhook secret configured + gmail connected) before
// a live createTrigger call flips the template's trigger to event/push. Any
// missing condition or failure leaves the hourly schedule intact (the floor).

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  maybeUpgradeInboxTriggerToPush,
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
