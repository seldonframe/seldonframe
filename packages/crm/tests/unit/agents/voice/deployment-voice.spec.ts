// ICP-3 — tests for loadDeploymentVoiceContext (deployment-voice.ts).
//
// The deployment voice path composes a persona from the agent TEMPLATE's
// blueprint, but scopes the tool-execution context + soul/timezone/intake to the
// BUILDER's org (so book_appointment lands in the builder's workspace calendar —
// per-client calendar is a LATER refinement). This test locks that assembly:
//   - blueprint comes from the template (greeting/voice/capabilities/customSkillMd)
//   - soul + timezone + intakeFields come from the builder org
//   - the ctx is scoped to builderOrgId (NOT the template's builderOrgId by
//     accident — same value here, but the ctx.orgId must be the builder org)
//   - testMode:false (a real booking, the ICP-3 payoff)
// DI the loaders + the template fetch + the persona inputs (repo convention) so
// there is no DB / network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  loadDeploymentVoiceContext,
  type DeploymentVoiceDeps,
} from "../../../../src/lib/agents/voice/deployment-voice";
import type { Deployment } from "../../../../src/db/schema/deployments";
import type { AgentTemplate } from "../../../../src/db/schema/agent-templates";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";
import type { BookingIntakeField } from "../../../../src/lib/bookings/actions";

const STABLE_CONV = "conv-deploy-fixed";

const DEPLOYMENT: Deployment = {
  id: "dep-1",
  builderOrgId: "builder-org-1",
  agentTemplateId: "tmpl-1",
  clientName: "Bright Smile Dental",
  clientContact: null,
  surface: "phone",
  phoneNumber: "+18335550100",
  calendarRef: null,
  priceCents: 0,
  stripeSubscriptionId: null,
  stripeCustomerId: null,
  status: "active",
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const TEMPLATE_BLUEPRINT: AgentBlueprint = {
  archetype: "voice-receptionist",
  capabilities: ["look_up_availability", "book_appointment"],
  greeting: "Thanks for calling Bright Smile Dental!",
  voice: "marin",
  faq: [{ q: "Do you take walk-ins?", a: "By appointment only." }],
};

const TEMPLATE: AgentTemplate = {
  id: "tmpl-1",
  builderOrgId: "builder-org-1",
  name: "Dental Receptionist",
  slug: "dental-receptionist",
  type: "voice_receptionist",
  blueprint: TEMPLATE_BLUEPRINT,
  status: "tested",
  evalScore: 90,
  createdAt: new Date("2026-06-01T00:00:00Z"),
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

const BUILDER_FIELDS: BookingIntakeField[] = [
  { id: "reason", type: "text", label: "Reason for visit", required: true },
];

function baseDeps(): DeploymentVoiceDeps {
  return {
    getAgentTemplate: async (id: string) => {
      assert.equal(id, "tmpl-1", "loads the deployment's template");
      return TEMPLATE;
    },
    // The builder-org persona inputs (soul/timezone/intake) — blueprint here is
    // the builder's OWN voice agent blueprint and must be OVERRIDDEN by the
    // template's blueprint in the result.
    loadVoicePersonaInputs: async (orgId: string) => {
      assert.equal(orgId, "builder-org-1", "soul/tz come from the builder org");
      return {
        soul: { businessName: "Bright Smile Dental", industry: "dentistry" },
        timezone: "America/New_York",
        blueprint: { greeting: "WRONG — builder's own greeting", voice: "cedar" } as AgentBlueprint,
        intakeFields: BUILDER_FIELDS,
      };
    },
    getVoiceAgentId: async (orgId: string) => {
      assert.equal(orgId, "builder-org-1");
      return "builder-voice-agent";
    },
    generateConversationId: () => STABLE_CONV,
  };
}

describe("loadDeploymentVoiceContext — template blueprint + builder-org tools", () => {
  test("ctx is scoped to the builder org, testMode false, fresh conversation id", async () => {
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    assert.ok(result, "resolves a context");
    assert.equal(result!.ctx.orgId, "builder-org-1");
    assert.equal(result!.ctx.agentId, "builder-voice-agent");
    assert.equal(result!.ctx.conversationId, STABLE_CONV);
    assert.equal(result!.ctx.testMode, false);
    assert.equal(result!.ctx.timezone, "America/New_York");
  });

  test("persona uses the TEMPLATE blueprint (greeting/voice), not the builder's own", async () => {
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    // greeting + voice surfaced for the call must come from the template.
    assert.equal(result!.greeting, "Thanks for calling Bright Smile Dental!");
    assert.equal(result!.audioVoice, "marin");
    // The composed instructions are built from the template blueprint — its FAQ
    // answer must appear, and the builder's wrong greeting must NOT leak in.
    assert.match(result!.instructions, /By appointment only\./);
    assert.doesNotMatch(result!.instructions, /WRONG — builder's own greeting/);
  });

  test("persona includes the builder org's business facts + intake fields", async () => {
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    // soul businessName flows into the persona header.
    assert.match(result!.instructions, /Bright Smile Dental/);
    // builder-org appointment intake field id appears in the booking instruction.
    assert.match(result!.instructions, /reason/);
  });

  test("returns null when the template can't be loaded (degrade to fallback)", async () => {
    const deps = baseDeps();
    deps.getAgentTemplate = async () => null;
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps,
    });
    assert.equal(result, null);
  });

  test("passes builderOrgId + agentId through for transcript persistence", async () => {
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    // The webhook persists the transcript to the builder org with this agent id.
    assert.equal(result!.transcriptOrgId, "builder-org-1");
    assert.equal(result!.transcriptAgentId, "builder-voice-agent");
  });
});
