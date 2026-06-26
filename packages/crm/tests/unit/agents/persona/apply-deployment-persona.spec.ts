// Per-deployment persona (P2) — the prompt-builder CONSUMES the resolved persona.
//
// `applyDeploymentPersona` is the pure seam that splices a resolved persona into
// the `{ blueprint, soul }` inputs `composeSystemPrompt` reads, mirroring the
// voice path (deployment-voice.ts injects customSkillMd / faq into the blueprint
// it passes). This unit pins the splice so chat/SMS/email speak AS the client:
//   - prompt   → blueprint.customSkillMd (verbatim; resolver already filled it)
//   - faq      → blueprint.faq (override-wins-WHOLE)
//   - services → soul.services (the "Services we offer" block reads the soul)
//   - greeting → greetingPrefix (the chat prompt has no native greeting seam)
// A null field leaves its target untouched; a null/absent persona returns the
// inputs unchanged. Pure — no Postgres / Anthropic / network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  applyDeploymentPersona,
  composeSystemPrompt,
} from "../../../../src/lib/agents/prompt";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";
import type { OrgSoul } from "../../../../src/lib/soul/types";

function baseBlueprint(overrides: Partial<AgentBlueprint> = {}): AgentBlueprint {
  return {
    archetype: "website-chatbot",
    capabilities: ["provide_faq_answer", "book_appointment"],
    faq: [{ q: "Template Q?", a: "Template A.", source: "operator" }],
    customSkillMd: "TEMPLATE SKILL BODY",
    ...overrides,
  };
}

// A minimal soul — only the fields the splice touches matter; cast the rest.
function baseSoul(overrides: Partial<OrgSoul> = {}): OrgSoul {
  return {
    businessName: "Acme",
    services: [{ name: "Template Service" }],
    ...overrides,
  } as OrgSoul;
}

describe("applyDeploymentPersona", () => {
  test("null persona → blueprint + soul returned unchanged, no greeting", () => {
    const blueprint = baseBlueprint();
    const soul = baseSoul();
    const out = applyDeploymentPersona({ blueprint, soul, persona: null });
    // Same references back out — byte-for-byte unchanged (the workspace path).
    assert.equal(out.blueprint, blueprint);
    assert.equal(out.soul, soul);
    assert.equal(out.greetingPrefix, null);
  });

  test("absent persona (undefined) → unchanged", () => {
    const blueprint = baseBlueprint();
    const soul = baseSoul();
    const out = applyDeploymentPersona({ blueprint, soul });
    assert.equal(out.blueprint, blueprint);
    assert.equal(out.soul, soul);
    assert.equal(out.greetingPrefix, null);
  });

  test("persona.prompt → blueprint.customSkillMd (override), original not mutated", () => {
    const blueprint = baseBlueprint();
    const out = applyDeploymentPersona({
      blueprint,
      soul: null,
      persona: {
        greeting: null,
        prompt: "You are the receptionist for Bright Smile Dental.",
        faq: null,
        services: null,
      },
    });
    assert.equal(
      out.blueprint.customSkillMd,
      "You are the receptionist for Bright Smile Dental.",
    );
    // Source blueprint is untouched (new object returned).
    assert.equal(blueprint.customSkillMd, "TEMPLATE SKILL BODY");
    assert.notEqual(out.blueprint, blueprint);
  });

  test("persona.prompt null → blueprint.customSkillMd stands (template body)", () => {
    const blueprint = baseBlueprint();
    const out = applyDeploymentPersona({
      blueprint,
      soul: null,
      persona: { greeting: null, prompt: null, faq: null, services: null },
    });
    assert.equal(out.blueprint.customSkillMd, "TEMPLATE SKILL BODY");
  });

  test("persona.faq → blueprint.faq (override-wins-WHOLE)", () => {
    const blueprint = baseBlueprint();
    const out = applyDeploymentPersona({
      blueprint,
      soul: null,
      persona: {
        greeting: null,
        prompt: null,
        faq: [{ q: "Do you take walk-ins?", a: "Yes, before 4pm." }],
        services: null,
      },
    });
    assert.deepEqual(out.blueprint.faq, [
      { q: "Do you take walk-ins?", a: "Yes, before 4pm." },
    ]);
    // Original untouched.
    assert.deepEqual(blueprint.faq, [
      { q: "Template Q?", a: "Template A.", source: "operator" },
    ]);
  });

  test("persona.services → soul.services (mapped name/description, price dropped)", () => {
    const soul = baseSoul();
    const out = applyDeploymentPersona({
      blueprint: baseBlueprint(),
      soul,
      persona: {
        greeting: null,
        prompt: null,
        faq: null,
        services: [
          { name: "Teeth Whitening", description: "60-min in-office", price: "$199" },
          { name: "Checkup" },
        ],
      },
    });
    assert.deepEqual(out.soul?.services, [
      { name: "Teeth Whitening", description: "60-min in-office" },
      { name: "Checkup" },
    ]);
    // Original soul untouched.
    assert.deepEqual(soul.services, [{ name: "Template Service" }]);
  });

  test("persona.services with null soul → a soul carrying just the services", () => {
    const out = applyDeploymentPersona({
      blueprint: baseBlueprint(),
      soul: null,
      persona: {
        greeting: null,
        prompt: null,
        faq: null,
        services: [{ name: "Mobile Repair" }],
      },
    });
    assert.deepEqual(out.soul?.services, [{ name: "Mobile Repair" }]);
  });

  test("persona.greeting → greetingPrefix (trimmed)", () => {
    const out = applyDeploymentPersona({
      blueprint: baseBlueprint(),
      soul: null,
      persona: {
        greeting: "  Thanks for calling Bright Smile Dental!  ",
        prompt: null,
        faq: null,
        services: null,
      },
    });
    assert.equal(out.greetingPrefix, "Thanks for calling Bright Smile Dental!");
  });

  test("blank greeting → greetingPrefix null (no empty opener)", () => {
    const out = applyDeploymentPersona({
      blueprint: baseBlueprint(),
      soul: null,
      persona: { greeting: "   ", prompt: null, faq: null, services: null },
    });
    assert.equal(out.greetingPrefix, null);
  });
});

// ── end-to-end through composeSystemPrompt ──────────────────────────────────
// Proves the spliced persona actually reaches the ASSEMBLED prompt the model
// reads. composeSystemPrompt is async but pure (it only reads bundled skill-pack
// .md files — no DB / network / Anthropic), so it runs under the unit harness.
describe("applyDeploymentPersona → composeSystemPrompt (assembled prompt)", () => {
  test("persona.prompt + faq + greeting all appear in the assembled prompt", async () => {
    const applied = applyDeploymentPersona({
      blueprint: baseBlueprint(),
      soul: baseSoul(),
      persona: {
        greeting: "Thanks for calling Bright Smile Dental!",
        prompt: "You are the receptionist for Bright Smile Dental. Be warm.",
        faq: [{ q: "Are you open Saturdays?", a: "Yes, 9am to 1pm." }],
        services: [{ name: "Teeth Whitening", description: "60-min in-office" }],
      },
    });

    const prompt = await composeSystemPrompt({
      orgName: "Bright Smile Dental",
      soul: applied.soul,
      blueprint: applied.blueprint,
      archetype: "website-chatbot",
      greetingPrefix: applied.greetingPrefix,
    });

    // The resolved script REPLACED the up-front platform skills (customSkillMd seam).
    assert.match(prompt, /You are the receptionist for Bright Smile Dental\. Be warm\./);
    // The deployment FAQ reached the grounding/context block (override-wins-WHOLE:
    // the template's "Template Q?" must NOT appear).
    assert.match(prompt, /Are you open Saturdays\?/);
    assert.match(prompt, /Yes, 9am to 1pm\./);
    assert.doesNotMatch(prompt, /Template Q\?/);
    // The deployment services reached the "Services we offer" block.
    assert.match(prompt, /Teeth Whitening/);
    assert.doesNotMatch(prompt, /Template Service/);
    // The greeting became the opener directive.
    assert.match(prompt, /Open the conversation with: "Thanks for calling Bright Smile Dental!"/);
  });

  test("no persona → prompt has NO opener directive and keeps the template body", async () => {
    const applied = applyDeploymentPersona({
      blueprint: baseBlueprint(),
      soul: baseSoul(),
      persona: null,
    });

    const prompt = await composeSystemPrompt({
      orgName: "Acme",
      soul: applied.soul,
      blueprint: applied.blueprint,
      archetype: "website-chatbot",
      greetingPrefix: applied.greetingPrefix,
    });

    assert.doesNotMatch(prompt, /Open the conversation with:/);
    // The agent's own template body + FAQ stand.
    assert.match(prompt, /TEMPLATE SKILL BODY/);
    assert.match(prompt, /Template Q\?/);
  });
});
