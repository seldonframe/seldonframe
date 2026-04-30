import { test } from "node:test";
import assert from "node:assert/strict";

import { speedToLeadArchetype } from "@/lib/agents/archetypes/speed-to-lead";
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

// Speed-to-Lead has three required user_input placeholders:
// $formId, $appointmentTypeId, $waitSeconds. The fixture below
// is the minimum config that passes the validator.
const COMPLETE_CONFIG = (): AgentConfig =>
  makeConfig({
    placeholders: {
      $formId: "form-123",
      $appointmentTypeId: "appt-456",
      $waitSeconds: "120",
    },
  });

test("synthesis fails with missing_required_placeholder when user_input is empty", () => {
  const config = makeConfig({ placeholders: {} });
  const result = synthesizeAgentSpec(speedToLeadArchetype, config);
  assert.equal(result.ok, false);
  if (result.ok) return; // narrow
  assert.equal(result.reason, "missing_required_placeholder");
  // The first required user_input is $formId.
  assert.ok(result.placeholderKey.startsWith("$"));
});

test("synthesis fails when only some required placeholders are filled", () => {
  const config = makeConfig({
    placeholders: { $formId: "f", $appointmentTypeId: "a" /* missing $waitSeconds */ },
  });
  const result = synthesizeAgentSpec(speedToLeadArchetype, config);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.placeholderKey, "$waitSeconds");
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
    placeholders: { $count: "5", $formId: "f", $appointmentTypeId: "a", $waitSeconds: "1" },
  });
  const result = synthesizeAgentSpec(archetypeWithSentence, config);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const variables = result.spec.variables as Record<string, unknown>;
  assert.equal(variables.sentence, "We waited 5 minutes");
  assert.equal(variables.bare, 5); // coerced to number
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
