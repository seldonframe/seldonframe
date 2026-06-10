import { test } from "node:test";
import assert from "node:assert/strict";

import { speedToLeadArchetype } from "@/lib/agents/archetypes/speed-to-lead";
import { missedCallTextBackArchetype } from "@/lib/agents/archetypes/missed-call-text-back";
import {
  getConfigPlaceholderValue,
  getTriggerEventType,
  synthesizeAgentSpec,
} from "@/lib/agents/synthesis";
import type { AgentConfig } from "@/lib/agents/configure-actions";

/**
 * WS3.1.3 — synthesis function tests.
 *
 * Pins the substitution + validation contract so an archetype-author
 * adding a new $placeholder won't accidentally regress the dispatcher
 * path that fills them. Speed-to-Lead is the reference archetype
 * (validated end-to-end in the synthesis spike).
 */

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    placeholders: {},
    temperature: 0.7,
    model: "claude-sonnet-4",
    approvalRequired: true,
    maxRunsPerDay: 50,
    deployedAt: null,
    pausedAt: null,
    systemPromptOverride: null,
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// Speed-to-Lead has four required user_input placeholders:
// $formId, $appointmentTypeId, $waitSeconds, $maxTurns. The fixture
// below is the minimum config that passes the validator. ($maxTurns
// added 2026-05-19 as part of Phase 2 Task 2.4 — operators can now
// override the conversation turn limit per workspace.)
const COMPLETE_CONFIG = (): AgentConfig =>
  makeConfig({
    placeholders: {
      $formId: "form-123",
      $appointmentTypeId: "appt-456",
      $waitSeconds: "120",
      $maxTurns: "6",
    },
  });

// 2026-05-19 — fixture for tests covering the "no sensible default"
// path. The real speed-to-lead archetype now declares non-empty
// `example` for every user_input slot, so synthesis falls back to the
// example instead of throwing on missing input. To still cover the
// failure path, these tests use an archetype clone with example
// stripped — representing the case where an author explicitly leaves
// example blank because the placeholder MUST be set per-workspace
// (e.g. $formId must point at a real form id).
const minimalArchetypeWithoutExamples = {
  ...speedToLeadArchetype,
  placeholders: {
    $formId: { kind: "user_input" as const, description: "form id" },
    $appointmentTypeId: { kind: "user_input" as const, description: "appt id" },
    $waitSeconds: { kind: "user_input" as const, description: "wait" },
    $maxTurns: { kind: "user_input" as const, description: "turns" },
  },
};

test("synthesis fails with missing_required_placeholder when user_input is empty and example is absent", () => {
  const config = makeConfig({ placeholders: {} });
  const result = synthesizeAgentSpec(minimalArchetypeWithoutExamples, config);
  assert.equal(result.ok, false);
  if (result.ok) return; // narrow
  assert.equal(result.reason, "missing_required_placeholder");
  // The first required user_input is $formId.
  assert.ok(result.placeholderKey.startsWith("$"));
});

test("synthesis fails when only some required placeholders are filled and remaining have no example", () => {
  const config = makeConfig({
    placeholders: { $formId: "f", $appointmentTypeId: "a" /* missing $waitSeconds */ },
  });
  const result = synthesizeAgentSpec(minimalArchetypeWithoutExamples, config);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.placeholderKey, "$waitSeconds");
});

test("synthesis falls back to placeholder.example when operator config is missing the key (backwards-compat for new placeholders)", () => {
  // 2026-05-19 — Phase 2 Task 2.4 added $maxTurns + $forbiddenPhrases
  // to speed-to-lead. Operators configured BEFORE that change have
  // saved configs missing both keys. The synthesizer must fall back to
  // the archetype's example value rather than throwing — otherwise
  // every new placeholder addition breaks every existing agent's run
  // dispatch (observed in prod 2026-05-19 21:59:27 UTC).
  //
  // Fixture: complete config EXCEPT $maxTurns is absent. The archetype
  // declares example="6" for $maxTurns, so synthesis should succeed
  // with that as the filled value.
  const config = makeConfig({
    placeholders: {
      $formId: "form-123",
      $appointmentTypeId: "appt-456",
      $waitSeconds: "120",
      // $maxTurns intentionally absent
    },
  });
  const result = synthesizeAgentSpec(speedToLeadArchetype, config);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.filled.$maxTurns, "6");
  // The fallback should also appear in the spec's sidecar placeholders
  // map (keyed without the leading $).
  const placeholders = (result.spec.placeholders as Record<string, string>) ?? {};
  assert.equal(placeholders.maxTurns, "6");
});

test("synthesis falls back to example even when operator supplies a whitespace-only string", () => {
  // Whitespace-only / empty user input should be treated the same as
  // missing — fall back to example when available.
  const config = makeConfig({
    placeholders: {
      $formId: "form-123",
      $appointmentTypeId: "appt-456",
      $waitSeconds: "120",
      $maxTurns: "   ",
    },
  });
  const result = synthesizeAgentSpec(speedToLeadArchetype, config);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.filled.$maxTurns, "6");
});

test("synthesis fills user_input placeholders verbatim", () => {
  const result = synthesizeAgentSpec(speedToLeadArchetype, COMPLETE_CONFIG());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.filled.$formId, "form-123");
  assert.equal(result.filled.$appointmentTypeId, "appt-456");
  assert.equal(result.filled.$waitSeconds, "120");
  // The form id should appear somewhere in the spec — likely on the
  // trigger.filter or the first conversation step's matcher.
  const flat = JSON.stringify(result.spec);
  assert.ok(
    flat.includes("form-123"),
    "filled $formId should appear in the synthesized spec"
  );
  assert.ok(
    flat.includes("appt-456"),
    "filled $appointmentTypeId should appear in the synthesized spec"
  );
});

test("synthesis substitutes longer placeholder names before shorter ones (no $form vs $formId collision)", () => {
  const archetypeWithCollision = {
    ...speedToLeadArchetype,
    placeholders: {
      ...speedToLeadArchetype.placeholders,
      $form: { kind: "user_input" as const, description: "shorter" },
    },
    specTemplate: {
      trigger: { type: "event", event: "form.submitted" },
      steps: [
        { id: "x", type: "wait_for_duration", duration_seconds: 60, next: null },
      ],
      // Variable that uses both placeholder names — the longer one
      // ($formId) must be replaced first; the shorter ($form) must
      // not consume part of the longer match.
      variables: { full_id: "$formId", short_id: "$form" },
    },
  };
  const config = makeConfig({
    placeholders: {
      $formId: "long-id-value",
      $form: "short-id-value",
      $appointmentTypeId: "appt-xyz",
      $waitSeconds: "60",
      $maxTurns: "6",
    },
  });
  const result = synthesizeAgentSpec(archetypeWithCollision, config);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const variables = result.spec.variables as Record<string, unknown>;
  assert.equal(variables.full_id, "long-id-value");
  assert.equal(variables.short_id, "short-id-value");
});

test("synthesis does NOT inject LLM config into spec.variables (would break seedVariableScope)", () => {
  // V1 contract: spec.variables stays exactly as the archetype
  // template wrote it (ref strings only). LLM config (model,
  // temperature, systemPromptOverride) is NOT threaded into the
  // variables block because the runtime's seedVariableScope calls
  // .split('.') on every value — a numeric temperature there
  // breaks the run with "ref.split is not a function" before
  // step execution. Per-archetype override wiring at the step
  // level is V1.1.
  const config = {
    ...COMPLETE_CONFIG(),
    model: "claude-haiku-4",
    temperature: 0.3,
    systemPromptOverride: "Be terse.",
  };
  const result = synthesizeAgentSpec(speedToLeadArchetype, config);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const variables = (result.spec.variables as Record<string, unknown>) ?? {};
  assert.equal(variables.model, undefined);
  assert.equal(variables.temperature, undefined);
  assert.equal(variables.system_prompt, undefined);
  // Archetype's own variable keys must still be present.
  assert.equal(typeof variables.contactId, "string");
});

test("synthesis substitutes soul_copy placeholders with example text when provided", () => {
  const result = synthesizeAgentSpec(speedToLeadArchetype, COMPLETE_CONFIG());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // unfilledSoulCopy should be empty because Speed-to-Lead's
  // archetype author provided examples for every soul_copy slot.
  // If a future edit removes an example, the assertion records
  // exactly which placeholder regressed.
  assert.deepEqual(
    result.unfilledSoulCopy,
    [],
    `unfilled soul_copy: ${result.unfilledSoulCopy.join(", ")}`
  );
});

test("getTriggerEventType extracts the trigger.event from a synthesized spec", () => {
  const result = synthesizeAgentSpec(speedToLeadArchetype, COMPLETE_CONFIG());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(getTriggerEventType(result.spec), "form.submitted");
});

test("synthesis coerces whole-token numeric placeholders to numbers", () => {
  // Speed-to-Lead's wait step: { type: "wait", seconds: "$waitSeconds" }.
  // After substitution, the runtime validator requires `seconds` to
  // be a number. Whole-token coercion catches this case.
  const result = synthesizeAgentSpec(speedToLeadArchetype, COMPLETE_CONFIG());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const steps = result.spec.steps as Array<Record<string, unknown>>;
  const waitStep = steps.find((s) => s.type === "wait");
  assert.ok(waitStep, "wait step should be present in synthesized spec");
  assert.equal(typeof waitStep!.seconds, "number");
  assert.equal(waitStep!.seconds, 120);
});

test("synthesis does NOT coerce mixed-content tokens (sentences stay strings)", () => {
  const archetypeWithSentence = {
    ...speedToLeadArchetype,
    placeholders: {
      ...speedToLeadArchetype.placeholders,
      $count: { kind: "user_input" as const, description: "n" },
    },
    specTemplate: {
      trigger: { type: "event", event: "form.submitted" },
      steps: [{ id: "x", type: "wait", seconds: 60, next: null }],
      // Mixed content — should stay a string after substitution.
      variables: {
        sentence: "We waited $count minutes",
        bare: "$count",
      },
    },
  };
  const config = makeConfig({
    placeholders: { $count: "5", $formId: "f", $appointmentTypeId: "a", $waitSeconds: "1", $maxTurns: "6" },
  });
  const result = synthesizeAgentSpec(archetypeWithSentence, config);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const variables = result.spec.variables as Record<string, unknown>;
  assert.equal(variables.sentence, "We waited 5 minutes");
  assert.equal(variables.bare, 5); // coerced to number
});

// 2026-06-10 — soul_copy operator override. Before this change the
// soul_copy loop ignored config.placeholders entirely: every workspace
// got the archetype author's example copy (HVAC-flavored text on a
// med-spa workspace). Operator-supplied copy must win; the example
// stays the fallback. Reference archetype: missed-call-text-back,
// whose $textBackBody is the SMS body of the send_text_back step.

/** Extract the send_text_back SMS body from a synthesized missed-call spec. */
function sentTextBackBody(spec: Record<string, unknown>): unknown {
  const steps = spec.steps as Array<Record<string, unknown>>;
  const step = steps.find((s) => s.id === "send_text_back");
  assert.ok(step, "send_text_back step should be present in synthesized spec");
  const args = (step!.args ?? {}) as Record<string, unknown>;
  return args.body;
}

const MISSED_CALL_USER_INPUTS = {
  $delaySeconds: "30",
  $followupDelaySeconds: "14400",
};

test("soul_copy honors operator config override (config wins over example)", () => {
  const custom =
    "Thanks for calling Seldon Studio! Want this for your business? Book a free 15-min call.";
  const config = makeConfig({
    placeholders: { ...MISSED_CALL_USER_INPUTS, $textBackBody: custom },
  });
  const result = synthesizeAgentSpec(missedCallTextBackArchetype, config);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(sentTextBackBody(result.spec), custom);
  // Operator-supplied copy is audited as a filled value, NOT as an
  // example default — soulCopyDefaults must not shadow the override
  // (it is applied to the replacement map AFTER filled).
  assert.equal(result.filled.$textBackBody, custom);
  assert.equal(result.soulCopyDefaults.$textBackBody, undefined);
  assert.deepEqual(result.unfilledSoulCopy, []);
  // Sidecar placeholders map carries the override for dispatcher reads.
  const placeholders = (result.spec.placeholders as Record<string, string>) ?? {};
  assert.equal(placeholders.textBackBody, custom);
});

test("soul_copy falls back to the archetype example when config has no value", () => {
  const config = makeConfig({ placeholders: { ...MISSED_CALL_USER_INPUTS } });
  const result = synthesizeAgentSpec(missedCallTextBackArchetype, config);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const example = missedCallTextBackArchetype.placeholders.$textBackBody.example;
  assert.ok(example && example.length > 0, "fixture archetype must declare an example");
  assert.equal(sentTextBackBody(result.spec), example);
  assert.equal(result.soulCopyDefaults.$textBackBody, example);
});

test("whitespace-only soul_copy override falls back to the example", () => {
  const config = makeConfig({
    placeholders: { ...MISSED_CALL_USER_INPUTS, $textBackBody: "   " },
  });
  const result = synthesizeAgentSpec(missedCallTextBackArchetype, config);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const example = missedCallTextBackArchetype.placeholders.$textBackBody.example;
  assert.equal(sentTextBackBody(result.spec), example);
  assert.equal(result.soulCopyDefaults.$textBackBody, example);
});

test("getConfigPlaceholderValue returns the trimmed value or null", () => {
  const config = makeConfig({ placeholders: { $formId: "  abc  " } });
  assert.equal(getConfigPlaceholderValue(config, "$formId"), "abc");
  assert.equal(getConfigPlaceholderValue(config, "$missing"), null);
  assert.equal(
    getConfigPlaceholderValue(makeConfig({ placeholders: { $x: "" } }), "$x"),
    null
  );
});
