// Marketplace buyer onboarding — TDD for the PURE step engine (no DB, no I/O).
//
// `buildOnboardingSteps(blueprint)` turns a normalized agent blueprint
// (surface + bound connector toolkits) into an ordered wizard step list. This
// is the only substantial net-new pure logic in the buyer journey (the rest is
// thin wiring over the existing deployment model). The engine takes a
// NORMALIZED shape ({ surface: string[]; connectors: {kind; toolkit?}[] }); the
// adapter `normalizeBlueprintForOnboarding(agentType, blueprint)` maps the REAL
// AgentBlueprint (which has no `surface` — surface is derived from the listing's
// agentType — and whose connectors are a ConnectorBinding discriminated union)
// onto it. Both are covered here.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildOnboardingSteps,
  normalizeBlueprintForOnboarding,
} from "../../../../src/lib/marketplace/onboarding/steps";

// ─── buildOnboardingSteps (the engine, normalized input) ─────────────────────

test("receptionist: business → calendar → phone → connect openai voice → test → go-live", () => {
  const steps = buildOnboardingSteps({
    surface: ["voice", "sms"],
    connectors: [{ kind: "composio", toolkit: "googlecalendar" }],
  });
  assert.deepEqual(
    steps.map((s) => s.kind),
    ["business_info", "connect_tool", "phone", "connect_openai_voice", "test", "go_live"],
  );
  assert.equal(steps[1].toolkit, "googlecalendar");
});

test("social poster: brand → connect socials → test → go-live (NO phone)", () => {
  const steps = buildOnboardingSteps({
    surface: ["social"],
    connectors: [
      { kind: "composio", toolkit: "instagram" },
      { kind: "composio", toolkit: "linkedin" },
    ],
  });
  const kinds = steps.map((s) => s.kind);
  assert.ok(kinds.includes("brand_info"));
  assert.ok(kinds.includes("connect_tool"));
  assert.ok(!kinds.includes("phone"));
  assert.equal(kinds.at(-1), "go_live");
});

test("a connector-less chat agent: business → test → go-live", () => {
  const steps = buildOnboardingSteps({ surface: ["chat"], connectors: [] });
  assert.deepEqual(
    steps.map((s) => s.kind),
    ["business_info", "test", "go_live"],
  );
});

test("first step is always required; go_live is always required + last", () => {
  const steps = buildOnboardingSteps({ surface: ["voice"], connectors: [] });
  assert.equal(steps[0].required, true);
  const last = steps.at(-1);
  assert.equal(last?.kind, "go_live");
  assert.equal(last?.required, true);
});

test("connect_tool steps are skippable (not required) and carry their toolkit", () => {
  const steps = buildOnboardingSteps({
    surface: ["chat"],
    connectors: [{ kind: "composio", toolkit: "googlecalendar" }],
  });
  const connect = steps.find((s) => s.kind === "connect_tool");
  assert.ok(connect);
  assert.equal(connect?.required, false);
  assert.equal(connect?.toolkit, "googlecalendar");
});

test("social surface ends with a 'preview' step, not 'test'", () => {
  const steps = buildOnboardingSteps({ surface: ["social"], connectors: [] });
  const kinds = steps.map((s) => s.kind);
  assert.ok(kinds.includes("preview"));
  assert.ok(!kinds.includes("test"));
});

test("connect_openai_voice is voice-only, right after phone, and skippable", () => {
  const voiceSteps = buildOnboardingSteps({ surface: ["voice"], connectors: [] });
  const kinds = voiceSteps.map((s) => s.kind);
  const phoneIdx = kinds.indexOf("phone");
  const voiceStepIdx = kinds.indexOf("connect_openai_voice");
  assert.ok(phoneIdx >= 0, "voice surface must include phone");
  assert.equal(voiceStepIdx, phoneIdx + 1, "connect_openai_voice must come immediately after phone");

  const step = voiceSteps.find((s) => s.kind === "connect_openai_voice");
  assert.equal(step?.required, false, "must never gate go-live");

  const chatSteps = buildOnboardingSteps({ surface: ["chat"], connectors: [] });
  assert.ok(
    !chatSteps.some((s) => s.kind === "connect_openai_voice"),
    "a non-voice surface must not get the step",
  );

  const socialSteps = buildOnboardingSteps({ surface: ["social"], connectors: [] });
  assert.ok(
    !socialSteps.some((s) => s.kind === "connect_openai_voice"),
    "a social surface (no phone) must not get the step either",
  );
});

test("every step has a non-empty label", () => {
  const steps = buildOnboardingSteps({
    surface: ["voice"],
    connectors: [{ kind: "composio", toolkit: "googlecalendar" }],
  });
  for (const s of steps) {
    assert.equal(typeof s.label, "string");
    assert.ok(s.label.length > 0);
  }
});

test("tolerates a malformed/empty blueprint without throwing", () => {
  // jsonb is untyped at the edge — a missing surface must not crash the engine.
  const steps = buildOnboardingSteps({
    surface: [],
    connectors: undefined,
  } as unknown as Parameters<typeof buildOnboardingSteps>[0]);
  // No voice/social → defaults to business_info; always ends go_live.
  assert.equal(steps[0].kind, "business_info");
  assert.equal(steps.at(-1)?.kind, "go_live");
});

// ─── normalizeBlueprintForOnboarding (REAL blueprint → engine input) ─────────

test("normalize: voice_receptionist agentType yields a voice surface", () => {
  const norm = normalizeBlueprintForOnboarding("voice_receptionist", {});
  assert.deepEqual(norm.surface, ["voice"]);
  assert.deepEqual(norm.connectors, []);
});

test("normalize: chat_assistant agentType yields a chat surface", () => {
  const norm = normalizeBlueprintForOnboarding("chat_assistant", {});
  assert.deepEqual(norm.surface, ["chat"]);
});

test("normalize: a composio connector binding expands to one toolkit each", () => {
  const norm = normalizeBlueprintForOnboarding("voice_receptionist", {
    connectors: [
      {
        id: "c1",
        kind: "composio",
        enabledToolkits: ["googlecalendar", "gmail"],
        enabledTools: [],
      },
    ],
  });
  // Each toolkit becomes its own connect_tool input row.
  assert.deepEqual(
    norm.connectors.map((c) => c.toolkit),
    ["googlecalendar", "gmail"],
  );
});

test("normalize: a vetted social connector (postiz) marks the surface social", () => {
  const norm = normalizeBlueprintForOnboarding("chat_assistant", {
    connectors: [
      { id: "postiz", kind: "vetted", serviceName: "postiz", enabledTools: [] },
    ],
  });
  assert.ok(norm.surface.includes("social"));
});

test("normalize: end-to-end — a real receptionist blueprint builds the receptionist steps", () => {
  const norm = normalizeBlueprintForOnboarding("voice_receptionist", {
    connectors: [
      {
        id: "c1",
        kind: "composio",
        enabledToolkits: ["googlecalendar"],
        enabledTools: [],
      },
    ],
  });
  const steps = buildOnboardingSteps(norm);
  assert.deepEqual(
    steps.map((s) => s.kind),
    ["business_info", "connect_tool", "phone", "connect_openai_voice", "test", "go_live"],
  );
});

test("normalize: tolerates a null/garbage blueprint (jsonb edge)", () => {
  const norm = normalizeBlueprintForOnboarding(
    "voice_receptionist",
    null as unknown as Record<string, unknown>,
  );
  assert.deepEqual(norm.surface, ["voice"]);
  assert.deepEqual(norm.connectors, []);
});
