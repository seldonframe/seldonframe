// Regression test: missed-call-text-back agent config save persistence.
//
// Bug: org e1b16f47 (Seldon Studio) saw `settings->'agentConfigs'->'missed-call-text-back'`
// = null even after the operator filled the Configure form and clicked Save/Deploy.
// speed-to-lead and review-requester persisted fine.
//
// Root cause: "missed-call-text-back" was absent from ARCHETYPE_REQUIREMENTS in
// setup-checklist.ts. The checklist fell back to [crmCheckItem()] — 1/1, always met —
// omitting the SMS (Twilio) requirement. More critically, the omission also signals that
// no one had written a test that exercises the full save-validation path for this
// archetype, allowing the bug to go undetected.
//
// What these tests pin:
//   1. ARCHETYPE_REQUIREMENTS must have an entry for "missed-call-text-back".
//   2. That entry must include an sms check item (id "sms").
//   3. synthesizeAgentSpec succeeds when both user_input placeholders are supplied
//      (mirrors saveAgentConfigAction's validation contract — same "required user_input"
//      check, same fallback-to-example path).
//   4. synthesizeAgentSpec falls back to example values when config is empty
//      (ensures synthesis-time fallback also works for existing deployed agents that
//      were configured before this bug was fixed).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { missedCallTextBackArchetype } from "../../src/lib/agents/archetypes/missed-call-text-back";
import { synthesizeAgentSpec } from "../../src/lib/agents/synthesis";
import { ARCHETYPE_REQUIREMENTS } from "../../src/lib/agents/setup-checklist";
import type { AgentConfig } from "../../src/lib/agents/configure-actions";

// ── helpers ──────────────────────────────────────────────────────────────────

function makeConfig(placeholders: Record<string, string> = {}): AgentConfig {
  return {
    placeholders,
    temperature: 0.7,
    model: "claude-sonnet-4",
    approvalRequired: true,
    maxRunsPerDay: 50,
    deployedAt: null,
    pausedAt: null,
    systemPromptOverride: null,
    updatedAt: new Date().toISOString(),
  };
}

// Minimal resource probe with all resources present. ARCHETYPE_REQUIREMENTS
// builder functions accept a ResourceProbe; we pass a fully-green probe so
// that item statuses reflect what an operator with everything installed sees.
const FULL_PROBE = {
  hasIntakeForm: true,
  intakeFormName: "Test Form",
  hasAppointmentType: true,
  appointmentTypeName: "Test Appt",
  hasResend: true,
  hasTwilio: true,
  hasGoogleCalendar: true,
};

// Minimal probe — nothing connected except the built-in CRM.
const BARE_PROBE = {
  hasIntakeForm: false,
  intakeFormName: null,
  hasAppointmentType: false,
  appointmentTypeName: null,
  hasResend: false,
  hasTwilio: false,
  hasGoogleCalendar: false,
};

// ── 1. ARCHETYPE_REQUIREMENTS contains missed-call-text-back ─────────────────

describe("setup-checklist — missed-call-text-back checklist entry", () => {
  test("ARCHETYPE_REQUIREMENTS has an entry for missed-call-text-back", () => {
    assert.ok(
      "missed-call-text-back" in ARCHETYPE_REQUIREMENTS,
      "missed-call-text-back must be present in ARCHETYPE_REQUIREMENTS; " +
        "without it the checklist defaults to [crmCheckItem()] which is always " +
        "met regardless of whether Twilio is connected",
    );
  });

  test("missed-call-text-back checklist includes an sms item (id='sms')", () => {
    const builder = ARCHETYPE_REQUIREMENTS["missed-call-text-back"];
    assert.ok(builder, "builder must exist after previous assertion");
    const items = builder(FULL_PROBE);
    const smsItem = items.find((item) => item.id === "sms");
    assert.ok(
      smsItem,
      `sms item must be in the checklist; got: ${items.map((i) => i.id).join(", ")}`,
    );
  });

  test("missed-call-text-back checklist sms item is 'met' when Twilio is connected", () => {
    const builder = ARCHETYPE_REQUIREMENTS["missed-call-text-back"];
    assert.ok(builder);
    const items = builder(FULL_PROBE);
    const smsItem = items.find((item) => item.id === "sms");
    assert.ok(smsItem);
    assert.equal(
      smsItem!.status,
      "met",
      "sms item must be met when hasTwilio=true",
    );
  });

  test("missed-call-text-back checklist sms item is 'unmet' when Twilio is NOT connected", () => {
    const builder = ARCHETYPE_REQUIREMENTS["missed-call-text-back"];
    assert.ok(builder);
    const items = builder(BARE_PROBE);
    const smsItem = items.find((item) => item.id === "sms");
    assert.ok(smsItem);
    assert.equal(
      smsItem!.status,
      "unmet",
      "sms item must be unmet when hasTwilio=false",
    );
  });

  test("missed-call-text-back checklist always includes crm item", () => {
    const builder = ARCHETYPE_REQUIREMENTS["missed-call-text-back"];
    assert.ok(builder);
    const items = builder(BARE_PROBE);
    const crmItem = items.find((item) => item.id === "crm");
    assert.ok(crmItem, "crm item must always be present in the checklist");
    assert.equal(crmItem!.status, "met", "crm item is always met (built-in)");
  });
});

// ── 2. Save-action validation contract via synthesizeAgentSpec ───────────────
//
// saveAgentConfigAction embeds the same "required user_input" validation loop
// as synthesizeAgentSpec. Both reject when a user_input placeholder is empty
// AND example is absent. Testing synthesizeAgentSpec is a clean proxy for
// the save-action contract without requiring DB access.

describe("missed-call-text-back — save validation contract (via synthesis)", () => {
  test("synthesis succeeds when both user_input placeholders are supplied", () => {
    const config = makeConfig({
      $delaySeconds: "30",
      $followupDelaySeconds: "14400",
    });
    const result = synthesizeAgentSpec(missedCallTextBackArchetype, config);
    assert.equal(
      result.ok,
      true,
      `synthesis must succeed with fully-supplied config; got: ${JSON.stringify(result)}`,
    );
  });

  test("synthesis succeeds with fallback-to-example when config placeholders are empty", () => {
    // Both $delaySeconds and $followupDelaySeconds declare non-empty examples
    // ("30" and "14400"). Synthesis must fall back to those rather than fail —
    // this covers existing deployed agents configured before the bug fix.
    const config = makeConfig({});
    const result = synthesizeAgentSpec(missedCallTextBackArchetype, config);
    assert.equal(
      result.ok,
      true,
      `synthesis must fall back to example values when config is empty; got: ${JSON.stringify(result)}`,
    );
    if (!result.ok) return;
    assert.equal(
      result.filled.$delaySeconds,
      "30",
      "$delaySeconds should fall back to example '30'",
    );
    assert.equal(
      result.filled.$followupDelaySeconds,
      "14400",
      "$followupDelaySeconds should fall back to example '14400'",
    );
  });

  test("synthesis fills $delaySeconds and $followupDelaySeconds into wait steps", () => {
    const config = makeConfig({
      $delaySeconds: "15",
      $followupDelaySeconds: "7200",
    });
    const result = synthesizeAgentSpec(missedCallTextBackArchetype, config);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const steps = (result.spec.steps as Array<Record<string, unknown>>) ?? [];
    const waitBeforeTextBack = steps.find((s) => s.id === "wait_before_text_back");
    assert.ok(waitBeforeTextBack, "wait_before_text_back step must be present");
    assert.equal(
      waitBeforeTextBack!.seconds,
      15,
      "wait_before_text_back.seconds must equal the numeric value of $delaySeconds",
    );
    const waitFollowup = steps.find((s) => s.id === "wait_followup_window");
    assert.ok(waitFollowup, "wait_followup_window step must be present");
    assert.equal(
      waitFollowup!.seconds,
      7200,
      "wait_followup_window.seconds must equal the numeric value of $followupDelaySeconds",
    );
  });

  test("synthesis populates $textBackBody from soul_copy example when operator has not overridden it", () => {
    const config = makeConfig({
      $delaySeconds: "30",
      $followupDelaySeconds: "14400",
    });
    const result = synthesizeAgentSpec(missedCallTextBackArchetype, config);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    // $textBackBody is soul_copy — synthesis should fill it from the archetype
    // example text. The archetype has a non-empty example, so unfilledSoulCopy
    // must be empty.
    assert.deepEqual(
      result.unfilledSoulCopy,
      [],
      `soul_copy placeholders should all be filled from examples; unfilled: ${result.unfilledSoulCopy.join(", ")}`,
    );
    assert.ok(
      "$textBackBody" in result.soulCopyDefaults,
      "$textBackBody must appear in soulCopyDefaults (filled from example)",
    );
  });

  test("synthesis trigger is call.missed", () => {
    const config = makeConfig({ $delaySeconds: "30", $followupDelaySeconds: "14400" });
    const result = synthesizeAgentSpec(missedCallTextBackArchetype, config);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const trigger = (result.spec.trigger as Record<string, unknown>) ?? {};
    assert.equal(
      trigger.event,
      "call.missed",
      "synthesized spec trigger must be call.missed",
    );
  });
});

// ── 3. Archetype shape invariants ────────────────────────────────────────────

describe("missed-call-text-back archetype — shape invariants", () => {
  test("archetype id matches the registry key", () => {
    assert.equal(missedCallTextBackArchetype.id, "missed-call-text-back");
  });

  test("requiresInstalled includes crm and sms", () => {
    const required = [...missedCallTextBackArchetype.requiresInstalled].sort();
    assert.ok(required.includes("crm"), "crm must be in requiresInstalled");
    assert.ok(required.includes("sms"), "sms must be in requiresInstalled");
  });

  test("both user_input placeholders have non-empty examples (enables smart defaults)", () => {
    // Non-empty examples are what allow synthesis to fall back gracefully
    // when an operator deploys without explicitly filling these fields.
    assert.ok(
      missedCallTextBackArchetype.placeholders.$delaySeconds.example?.trim(),
      "$delaySeconds must have a non-empty example for smart-default fallback",
    );
    assert.ok(
      missedCallTextBackArchetype.placeholders.$followupDelaySeconds.example?.trim(),
      "$followupDelaySeconds must have a non-empty example for smart-default fallback",
    );
  });

  test("$textBackBody is soul_copy (not user_input — must not be required by saveAgentConfigAction)", () => {
    assert.equal(
      missedCallTextBackArchetype.placeholders.$textBackBody.kind,
      "soul_copy",
      "$textBackBody must be soul_copy so the save-action validation loop skips it",
    );
  });
});
