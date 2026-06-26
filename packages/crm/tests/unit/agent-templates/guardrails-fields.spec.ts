// Outbound-UX F5 — TDD for the editor's pure "Guardrails & quality" helpers.
//
// The editor card is a thin React form over these pure functions; the load-bearing
// logic is buildGuardrailsVerifyPatch's OMIT/CLEAR contract: "Use smart defaults"
// ON must NOT write an empty/partial object (so the per-skill runtime default
// applies), and flipping it back ON must CLEAR a prior override (send `null`, which
// mergeTemplateBlueprint deletes). These tests pin that contract + the field
// round-trip + the skill mapping, with no React/DOM.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildGuardrailsVerifyPatch,
  describeGuardrailsDefault,
  describeVerifyDefault,
  guardrailFieldsFrom,
  skillForTriggerEvent,
  verifyFieldsFrom,
  type GuardrailFields,
  type VerifyFields,
} from "@/app/(dashboard)/studio/agents/[id]/guardrails-fields";

// Blank field buffers (what an unset agent's card starts from).
const BLANK_G: GuardrailFields = {
  enabled: true,
  maxPerDay: "",
  minHoursBetween: "",
  quietStartHour: "",
  quietEndHour: "",
  quietTz: "",
};
const BLANK_V: VerifyFields = { mustInclude: [], maxLength: "" };

describe("skillForTriggerEvent", () => {
  test("maps the two outbound events to their skills", () => {
    assert.equal(skillForTriggerEvent("booking.completed"), "review-requester");
    assert.equal(skillForTriggerEvent("lead.created"), "speed-to-lead");
  });
  test("unknown / inbound events have no per-skill default", () => {
    assert.equal(skillForTriggerEvent("call.inbound"), null);
    assert.equal(skillForTriggerEvent(""), null);
  });
});

describe("buildGuardrailsVerifyPatch — omit/clear contract", () => {
  test("defaults ON + nothing previously saved → OMITS both keys (no empty object)", () => {
    const patch = buildGuardrailsVerifyPatch({
      guardrailsDefaultsOn: true,
      verifyDefaultsOn: true,
      guardrails: BLANK_G,
      verify: BLANK_V,
      hadGuardrails: false,
      hadVerify: false,
    });
    assert.equal("guardrails" in patch, false, "guardrails key must be absent");
    assert.equal("verify" in patch, false, "verify key must be absent");
  });

  test("defaults ON but an override WAS saved → sends null to CLEAR it", () => {
    const patch = buildGuardrailsVerifyPatch({
      guardrailsDefaultsOn: true,
      verifyDefaultsOn: true,
      guardrails: BLANK_G,
      verify: BLANK_V,
      hadGuardrails: true,
      hadVerify: true,
    });
    assert.equal(patch.guardrails, null);
    assert.equal(patch.verify, null);
  });

  test("guardrails OFF → builds the override (hours→minutes, quiet window, caps)", () => {
    const patch = buildGuardrailsVerifyPatch({
      guardrailsDefaultsOn: false,
      verifyDefaultsOn: true,
      guardrails: {
        enabled: true,
        maxPerDay: "150",
        minHoursBetween: "24", // 24h → 1440 min
        quietStartHour: "21",
        quietEndHour: "8",
        quietTz: "America/New_York",
      },
      verify: BLANK_V,
      hadGuardrails: false,
      hadVerify: false,
    });
    assert.deepEqual(patch.guardrails, {
      enabled: true,
      maxPerDayPerAgent: 150,
      minMinutesBetweenPerContact: 1440,
      quietHours: { startHour: 21, endHour: 8, tz: "America/New_York" },
    });
  });

  test("guardrails OFF kill switch → enabled:false is carried", () => {
    const patch = buildGuardrailsVerifyPatch({
      guardrailsDefaultsOn: false,
      verifyDefaultsOn: true,
      guardrails: { ...BLANK_G, enabled: false },
      verify: BLANK_V,
      hadGuardrails: false,
      hadVerify: false,
    });
    assert.equal(patch.guardrails?.enabled, false);
    // Blank numeric fields are omitted, not zeroed.
    assert.equal(patch.guardrails?.maxPerDayPerAgent, undefined);
    assert.equal(patch.guardrails?.quietHours, undefined);
  });

  test("guardrails OFF with a degenerate quiet window (start === end) drops quietHours", () => {
    const patch = buildGuardrailsVerifyPatch({
      guardrailsDefaultsOn: false,
      verifyDefaultsOn: true,
      guardrails: { ...BLANK_G, quietStartHour: "9", quietEndHour: "9", quietTz: "UTC" },
      verify: BLANK_V,
      hadGuardrails: false,
      hadVerify: false,
    });
    assert.equal(patch.guardrails?.quietHours, undefined);
  });

  test("guardrails OFF with an out-of-range hour drops quietHours (no crash)", () => {
    const patch = buildGuardrailsVerifyPatch({
      guardrailsDefaultsOn: false,
      verifyDefaultsOn: true,
      guardrails: { ...BLANK_G, quietStartHour: "99", quietEndHour: "8", quietTz: "UTC" },
      verify: BLANK_V,
      hadGuardrails: false,
      hadVerify: false,
    });
    assert.equal(patch.guardrails?.quietHours, undefined);
  });

  test("verify OFF → builds a rubric of must_include rows + one max_length", () => {
    const patch = buildGuardrailsVerifyPatch({
      guardrailsDefaultsOn: true,
      verifyDefaultsOn: false,
      guardrails: BLANK_G,
      verify: { mustInclude: ["g.page/abc", "  ", "Acme"], maxLength: "320" },
      hadGuardrails: false,
      hadVerify: false,
    });
    // Blank/whitespace must_include rows are dropped.
    assert.deepEqual(patch.verify, {
      checks: [
        { kind: "must_include", value: "g.page/abc" },
        { kind: "must_include", value: "Acme" },
        { kind: "max_length", max: 320 },
      ],
    });
  });

  test("verify OFF with everything blank → empty checks array (an explicit 'no checks' override)", () => {
    const patch = buildGuardrailsVerifyPatch({
      guardrailsDefaultsOn: true,
      verifyDefaultsOn: false,
      guardrails: BLANK_G,
      verify: BLANK_V,
      hadGuardrails: false,
      hadVerify: false,
    });
    assert.deepEqual(patch.verify, { checks: [] });
  });
});

describe("field seeding round-trip", () => {
  test("guardrailFieldsFrom(null) → all blank, enabled defaults ON", () => {
    assert.deepEqual(guardrailFieldsFrom(null), BLANK_G);
  });

  test("guardrailFieldsFrom seeds minutes back to HOURS for the input", () => {
    const f = guardrailFieldsFrom({
      enabled: true,
      maxPerDayPerAgent: 200,
      minMinutesBetweenPerContact: 43200, // 30 days
      quietHours: { startHour: 21, endHour: 8, tz: "UTC" },
    });
    assert.equal(f.maxPerDay, "200");
    assert.equal(f.minHoursBetween, "720"); // 43200 / 60
    assert.equal(f.quietStartHour, "21");
    assert.equal(f.quietEndHour, "8");
    assert.equal(f.quietTz, "UTC");
  });

  test("verifyFieldsFrom extracts must_include rows + max_length only", () => {
    const f = verifyFieldsFrom({
      checks: [
        { kind: "must_include", value: "link", label: "review link" },
        { kind: "must_not_include", value: "{" }, // ignored by the simple editor
        { kind: "max_length", max: 280 },
      ],
    });
    assert.deepEqual(f.mustInclude, ["link"]);
    assert.equal(f.maxLength, "280");
  });
});

describe("hint copy", () => {
  test("review-requester guardrails hint mentions the cap + quiet hours + per-contact gap", () => {
    const hint = describeGuardrailsDefault("review-requester");
    assert.ok(hint, "expected a hint string");
    assert.match(hint!, /200\/day/);
    assert.match(hint!, /9pm.*8am/);
    assert.match(hint!, /30 days/);
  });

  test("an event with no per-skill default returns null (card shows the 'no default' copy)", () => {
    assert.equal(describeGuardrailsDefault(null), null);
    assert.equal(describeVerifyDefault(null, "sms"), null);
  });

  test("review-requester verify hint mentions a length cap", () => {
    const hint = describeVerifyDefault("review-requester", "sms");
    assert.ok(hint, "expected a hint string");
    assert.match(hint!, /320 chars/);
  });
});
