// Marketplace buyer onboarding — TDD for the buyer→deployment SEAM.
//
// A marketplace purchase by a BUYER yields a buyer-OWNED deployment of the
// listing's blueprint (not just an editable template), so the agent is runnable
// (phone + calendar + go-live) and the wizard configures it. This covers:
//   1. planBuyerDeployment   — PURE: listing + buyer org + cloned template id →
//                              the CreateDeploymentInput (owner = buyer, draft,
//                              empty onboarding progress).
//   2. resolveOrCreateBuyerDeployment — DI'd + idempotent (one deployment per
//                              buyer+listing) over a FAKE store.
//   3. getBuyerAgent         — ORG-SCOPED read: returns the deployment + its
//                              blueprint + computed steps + progress, or null
//                              when the deployment isn't the buyer's.
//
// No Postgres: the DB lives behind injected deps, faked here.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  planBuyerDeployment,
  resolveOrCreateBuyerDeployment,
  getBuyerAgent,
  type BuyerListing,
  type ResolveBuyerDeploymentDeps,
  type GetBuyerAgentDeps,
} from "../../../../src/lib/marketplace/buyer/buyer-deployment";
import type { Deployment } from "../../../../src/db/schema/deployments";
import type { AgentTemplate } from "../../../../src/db/schema/agent-templates";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";

// ─── fixtures ────────────────────────────────────────────────────────────────

function voiceListing(over: Partial<BuyerListing> = {}): BuyerListing {
  return {
    id: "listing-1",
    slug: "front-desk",
    name: "Front Desk Receptionist",
    kind: "agent",
    agentType: "voice_receptionist",
    agentBlueprint: {
      connectors: [
        {
          id: "c1",
          kind: "composio",
          enabledToolkits: ["googlecalendar"],
          enabledTools: [],
        },
      ],
    } as AgentBlueprint,
    ...over,
  };
}

function fakeDeployment(over: Partial<Deployment> = {}): Deployment {
  return {
    id: "dep-1",
    builderOrgId: "buyer-1",
    agentTemplateId: "tmpl-buyer-1",
    clientName: "Front Desk Receptionist",
    clientContact: null,
    surface: "phone",
    phoneNumber: null,
    phoneNumberSid: null,
    numberOrigin: null,
    calendarRef: null,
    bookingMode: "native",
    externalBookingUrl: null,
    bookingPolicy: null,
    customization: null,
    clientContext: null,
    priceCents: 0,
    stripeSubscriptionId: null,
    stripeCustomerId: null,
    clientOrgId: null,
    portalInvitedAt: null,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

function fakeBuyerTemplate(over: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: "tmpl-buyer-1",
    builderOrgId: "buyer-1",
    name: "Front Desk Receptionist",
    slug: "front-desk-receptionist",
    type: "voice_receptionist",
    blueprint: voiceListing().agentBlueprint as AgentBlueprint,
    status: "draft",
    evalScore: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

// ─── planBuyerDeployment (pure) ──────────────────────────────────────────────

test("planBuyerDeployment: owner is the buyer org, status implicitly draft", () => {
  const input = planBuyerDeployment({
    buyerOrgId: "buyer-1",
    listing: voiceListing(),
    agentTemplateId: "tmpl-buyer-1",
  });
  assert.equal(input.builderOrgId, "buyer-1");
  assert.equal(input.agentTemplateId, "tmpl-buyer-1");
});

test("planBuyerDeployment: a voice listing deploys to a phone surface", () => {
  const input = planBuyerDeployment({
    buyerOrgId: "buyer-1",
    listing: voiceListing(),
    agentTemplateId: "tmpl-buyer-1",
  });
  assert.equal(input.surface, "phone");
});

test("planBuyerDeployment: a chat listing deploys to an embed surface", () => {
  const input = planBuyerDeployment({
    buyerOrgId: "buyer-1",
    listing: voiceListing({ agentType: "chat_assistant" }),
    agentTemplateId: "tmpl-buyer-1",
  });
  assert.equal(input.surface, "embed");
});

test("planBuyerDeployment: clientName falls back to the listing name", () => {
  const input = planBuyerDeployment({
    buyerOrgId: "buyer-1",
    listing: voiceListing({ name: "Siding Pro Receptionist" }),
    agentTemplateId: "tmpl-buyer-1",
  });
  assert.equal(input.clientName, "Siding Pro Receptionist");
});

test("planBuyerDeployment: seeds an EMPTY onboarding progress on the deployment", () => {
  const input = planBuyerDeployment({
    buyerOrgId: "buyer-1",
    listing: voiceListing(),
    agentTemplateId: "tmpl-buyer-1",
  });
  assert.deepEqual(input.customization?.onboardingProgress, { doneKinds: [] });
});

// ─── resolveOrCreateBuyerDeployment (DI'd, idempotent) ───────────────────────

test("resolveOrCreateBuyerDeployment: creates a deployment when none exists", async () => {
  const created: Deployment[] = [];
  const deps: ResolveBuyerDeploymentDeps = {
    findExistingForListing: async () => null,
    createDeployment: async (input) => {
      const dep = fakeDeployment({
        builderOrgId: input.builderOrgId,
        agentTemplateId: input.agentTemplateId,
        surface: input.surface ?? "phone",
      });
      created.push(dep);
      return dep;
    },
  };
  const result = await resolveOrCreateBuyerDeployment(
    { buyerOrgId: "buyer-1", listing: voiceListing(), agentTemplateId: "tmpl-buyer-1" },
    deps,
  );
  assert.equal(result.ok, true);
  assert.equal(created.length, 1);
  assert.equal(result.ok && result.deployment.builderOrgId, "buyer-1");
});

test("resolveOrCreateBuyerDeployment: idempotent — reuses an existing deployment, no second create", async () => {
  const existing = fakeDeployment();
  let createCalls = 0;
  const deps: ResolveBuyerDeploymentDeps = {
    findExistingForListing: async () => existing,
    createDeployment: async () => {
      createCalls += 1;
      return fakeDeployment({ id: "dep-2" });
    },
  };
  const result = await resolveOrCreateBuyerDeployment(
    { buyerOrgId: "buyer-1", listing: voiceListing(), agentTemplateId: "tmpl-buyer-1" },
    deps,
  );
  assert.equal(result.ok, true);
  assert.equal(createCalls, 0); // no duplicate create
  assert.equal(result.ok && result.deployment.id, "dep-1"); // the existing one
});

test("resolveOrCreateBuyerDeployment: rejects a non-agent listing", async () => {
  const deps: ResolveBuyerDeploymentDeps = {
    findExistingForListing: async () => null,
    createDeployment: async () => fakeDeployment(),
  };
  const result = await resolveOrCreateBuyerDeployment(
    {
      buyerOrgId: "buyer-1",
      listing: voiceListing({ kind: "soul" }),
      agentTemplateId: "tmpl-buyer-1",
    },
    deps,
  );
  assert.equal(result.ok, false);
});

test("resolveOrCreateBuyerDeployment: rejects a missing buyer org", async () => {
  const deps: ResolveBuyerDeploymentDeps = {
    findExistingForListing: async () => null,
    createDeployment: async () => fakeDeployment(),
  };
  const result = await resolveOrCreateBuyerDeployment(
    { buyerOrgId: "", listing: voiceListing(), agentTemplateId: "tmpl-buyer-1" },
    deps,
  );
  assert.equal(result.ok, false);
});

// ─── getBuyerAgent (org-scoped read) ─────────────────────────────────────────

test("getBuyerAgent: returns the deployment + blueprint + steps + progress", async () => {
  const deps: GetBuyerAgentDeps = {
    findDeploymentById: async () => fakeDeployment(),
    findTemplateById: async () => fakeBuyerTemplate(),
  };
  const result = await getBuyerAgent("dep-1", "buyer-1", deps);
  assert.ok(result);
  assert.equal(result?.deployment.id, "dep-1");
  // Voice + googlecalendar → the receptionist step list.
  assert.deepEqual(
    result?.steps.map((s) => s.kind),
    ["business_info", "connect_tool", "phone", "test", "go_live"],
  );
  assert.deepEqual(result?.progress.doneKinds, []);
});

test("getBuyerAgent: ORG-SCOPED — returns null when the deployment is another org's", async () => {
  const deps: GetBuyerAgentDeps = {
    findDeploymentById: async () => fakeDeployment({ builderOrgId: "other-org" }),
    findTemplateById: async () => fakeBuyerTemplate(),
  };
  const result = await getBuyerAgent("dep-1", "buyer-1", deps);
  assert.equal(result, null);
});

test("getBuyerAgent: returns null when the deployment does not exist", async () => {
  const deps: GetBuyerAgentDeps = {
    findDeploymentById: async () => null,
    findTemplateById: async () => fakeBuyerTemplate(),
  };
  const result = await getBuyerAgent("nope", "buyer-1", deps);
  assert.equal(result, null);
});

test("getBuyerAgent: reads back a persisted onboarding progress from customization", async () => {
  const deps: GetBuyerAgentDeps = {
    findDeploymentById: async () =>
      fakeDeployment({
        customization: { onboardingProgress: { doneKinds: ["business_info"] } },
      }),
    findTemplateById: async () => fakeBuyerTemplate(),
  };
  const result = await getBuyerAgent("dep-1", "buyer-1", deps);
  assert.deepEqual(result?.progress.doneKinds, ["business_info"]);
  // The resume point skips the done step.
  assert.equal(result?.nextStep?.kind, "connect_tool");
});
