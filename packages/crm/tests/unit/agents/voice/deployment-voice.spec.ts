// ICP-3 — tests for loadDeploymentVoiceContext (deployment-voice.ts).
//
// The deployment voice path composes a persona from the agent TEMPLATE's
// blueprint and the deployment's CLIENT identity, but scopes the tool-execution
// context + timezone/intake to the BUILDER's org (so book_appointment lands in
// the builder's workspace calendar — per-client calendar is a LATER refinement).
// This test locks that assembly:
//   - blueprint comes from the template (greeting/voice/capabilities/customSkillMd)
//   - the persona speaks AS THE CLIENT (deployment.clientName); the builder's own
//     soul (industry / services / facts) must NOT leak into the instructions
//   - timezone + intakeFields come from the builder org
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
  clientContext: null,
  surface: "phone",
  phoneNumber: "+18335550100",
  phoneNumberSid: null,
  numberOrigin: null,
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
    // The builder-org persona inputs. The blueprint here is the builder's OWN
    // voice agent blueprint and must be OVERRIDDEN by the template's. The soul is
    // the BUILDER's business (Seldon Studio, an agency) and must be DROPPED — the
    // deployed agent speaks as the CLIENT, never the builder. Only timezone +
    // intakeFields are consumed. Every field below uses a recognizable sentinel
    // so a leak is unambiguous.
    loadVoicePersonaInputs: async (orgId: string) => {
      assert.equal(orgId, "builder-org-1", "tz/intake come from the builder org");
      return {
        soul: {
          businessName: "Seldon Studio Agency",
          businessDescription: "BUILDER-SOUL-LEAK we build AI agents for SMBs",
          services: [{ name: "BUILDER-SERVICE-LEAK agent deployment" }],
        },
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

  test("persona speaks AS THE CLIENT — client name in, builder soul facts out", async () => {
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    // The persona header names the CLIENT (deployment.clientName), so the agent
    // introduces itself as the client's receptionist.
    assert.match(result!.instructions, /Bright Smile Dental/);
    // The builder's OWN soul must NOT leak — neither its business name nor any of
    // its facts (description / services). This is the bug this phase fixes: a
    // deployed agent must never pitch the builder's business to the client's
    // callers. baseDeps() returns a builder soul stuffed with sentinels.
    assert.doesNotMatch(result!.instructions, /Seldon Studio Agency/);
    assert.doesNotMatch(result!.instructions, /BUILDER-SOUL-LEAK/);
    assert.doesNotMatch(result!.instructions, /BUILDER-SERVICE-LEAK/);
    // builder-org appointment intake fields still drive the booking instruction
    // (booking lands in the builder calendar — that part is unchanged).
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

describe("loadDeploymentVoiceContext — speaks the CLIENT's services + FAQ", () => {
  // The deployment now carries the CLIENT's captured business context. The
  // persona must surface the client's OWN services + FAQ (so the agent answers
  // as them), the client's FAQ must OVERRIDE the template's, and the BUILDER's
  // soul must STILL never leak. Sentinels make any leak/miss unambiguous.
  const DEPLOYMENT_WITH_CONTEXT: Deployment = {
    ...DEPLOYMENT,
    clientContext: {
      soul: {
        businessName: "Bright Smile Dental",
        businessDescription: "CLIENT-DESC-XYZ a cosmetic + family dental practice",
        services: [
          { name: "CLIENT-SVC-XYZ teeth whitening", description: "in-office, one visit" },
        ],
      },
      faq: [{ q: "Do you offer financing?", a: "CLIENT-FAQ-XYZ yes, 0% for 12 months." }],
    },
  };

  test("composed instructions contain the client's service + FAQ + name", async () => {
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT_WITH_CONTEXT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    assert.ok(result);
    // The client's own service + FAQ answer + name all surface.
    assert.match(result!.instructions, /CLIENT-SVC-XYZ teeth whitening/);
    assert.match(result!.instructions, /CLIENT-FAQ-XYZ yes, 0% for 12 months\./);
    assert.match(result!.instructions, /CLIENT-DESC-XYZ/);
    assert.match(result!.instructions, /Bright Smile Dental/);
  });

  test("the client's FAQ OVERRIDES the template's FAQ", async () => {
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT_WITH_CONTEXT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    // Client FAQ in…
    assert.match(result!.instructions, /Do you offer financing\?/);
    // …and the TEMPLATE's FAQ answer ("By appointment only.") is replaced, not
    // appended. The template Q ("Do you take walk-ins?") must be gone too.
    assert.doesNotMatch(result!.instructions, /By appointment only\./);
    assert.doesNotMatch(result!.instructions, /Do you take walk-ins\?/);
  });

  test("the BUILDER's soul STILL never leaks, even with a client context present", async () => {
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT_WITH_CONTEXT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    assert.doesNotMatch(result!.instructions, /Seldon Studio Agency/);
    assert.doesNotMatch(result!.instructions, /BUILDER-SOUL-LEAK/);
    assert.doesNotMatch(result!.instructions, /BUILDER-SERVICE-LEAK/);
  });

  test("no clientContext → name-only fallback (today's behavior, no client facts)", async () => {
    // DEPLOYMENT has clientContext: null. The persona names the client but
    // surfaces NO client services/FAQ-from-context, and the template FAQ stands.
    const result = await loadDeploymentVoiceContext({
      deployment: DEPLOYMENT,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    assert.ok(result);
    assert.match(result!.instructions, /Bright Smile Dental/);
    // No client-context sentinels (there was no context).
    assert.doesNotMatch(result!.instructions, /CLIENT-SVC-XYZ/);
    assert.doesNotMatch(result!.instructions, /CLIENT-FAQ-XYZ/);
    // The TEMPLATE's FAQ is used (not overridden), so its answer is present.
    assert.match(result!.instructions, /By appointment only\./);
    // And the builder soul still never leaks.
    assert.doesNotMatch(result!.instructions, /BUILDER-SOUL-LEAK/);
  });

  test("clientContext with a name overrides the clientName for the persona header", async () => {
    const renamed: Deployment = {
      ...DEPLOYMENT,
      clientName: "Fallback Name Co",
      clientContext: { soul: { businessName: "Captured Brand Name" } },
    };
    const result = await loadDeploymentVoiceContext({
      deployment: renamed,
      now: new Date("2026-06-01T17:00:00Z"),
      deps: baseDeps(),
    });
    assert.match(result!.instructions, /Captured Brand Name/);
  });
});
