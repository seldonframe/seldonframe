// Tests for the appointment-confirm-sms archetype template.
// SLICE 7 PR 2 C3.
//
// Validates the archetype:
//   1. Exports cleanly from the archetype registry
//   2. Declares a message trigger with the correct shape
//   3. Has zero placeholders (v1 design — see archetype comment)
//   4. Spec template is consistent with how other archetypes declare

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { archetypes, getArchetype } from "../../src/lib/agents/archetypes";
import { appointmentConfirmSmsArchetype } from "../../src/lib/agents/archetypes/appointment-confirm-sms";

describe("appointment-confirm-sms archetype — registry integration", () => {
  test("archetype is discoverable by id", () => {
    const a = getArchetype("appointment-confirm-sms");
    assert.ok(a, "appointment-confirm-sms must be in the archetype registry");
    assert.equal(a!.id, "appointment-confirm-sms");
  });

  test("appointment-confirm-sms in registry (count grows as new archetypes ship)", () => {
    assert.ok(Object.keys(archetypes).length >= 6);
    assert.ok(archetypes["appointment-confirm-sms"]);
  });

  test("all 5 prior archetypes still present (streak invariant)", () => {
    assert.ok(getArchetype("speed-to-lead"));
    assert.ok(getArchetype("win-back"));
    assert.ok(getArchetype("review-requester"));
    assert.ok(getArchetype("daily-digest"));
    assert.ok(getArchetype("weather-aware-booking"));
    assert.ok(getArchetype("appointment-confirm-sms"));
  });
});

describe("appointment-confirm-sms archetype — shape", () => {
  test("id matches filename convention", () => {
    assert.equal(appointmentConfirmSmsArchetype.id, "appointment-confirm-sms");
  });

  test("requires crm + sms blocks", () => {
    assert.deepEqual(
      [...appointmentConfirmSmsArchetype.requiresInstalled].sort(),
      ["crm", "sms"].sort(),
    );
  });

  test("placeholder-free archetype (v1 design)", () => {
    assert.deepEqual(appointmentConfirmSmsArchetype.placeholders, {});
  });

  test("spec template declares a message trigger", () => {
    const trigger = (appointmentConfirmSmsArchetype.specTemplate as { trigger: { type: string } }).trigger;
    assert.equal(trigger.type, "message");
  });

  test("message trigger pattern is exact + case-insensitive on CONFIRM", () => {
    const trigger = (appointmentConfirmSmsArchetype.specTemplate as {
      trigger: { pattern: { kind: string; value: string; caseSensitive?: boolean } };
    }).trigger;
    assert.equal(trigger.pattern.kind, "exact");
    assert.equal(trigger.pattern.value, "CONFIRM");
    assert.equal(trigger.pattern.caseSensitive, false);
  });

  test("message trigger channel is sms with binding kind any", () => {
    const trigger = (appointmentConfirmSmsArchetype.specTemplate as {
      trigger: { channel: string; channelBinding: { kind: string } };
    }).trigger;
    assert.equal(trigger.channel, "sms");
    assert.equal(trigger.channelBinding.kind, "any");
  });

  test("spec template has 5 steps in expected order", () => {
    const steps = (appointmentConfirmSmsArchetype.specTemplate as {
      steps: Array<{ id: string; type: string }>;
    }).steps;
    assert.equal(steps.length, 5);
    assert.equal(steps[0].id, "load_appointment");
    assert.equal(steps[0].type, "read_state");
    assert.equal(steps[1].id, "check_appointment_exists");
    assert.equal(steps[1].type, "branch");
    assert.equal(steps[2].id, "mark_confirmed");
    assert.equal(steps[2].type, "write_state");
    assert.equal(steps[3].id, "reply_confirmed");
    assert.equal(steps[3].type, "mcp_tool_call");
    assert.equal(steps[4].id, "reply_no_appointment");
    assert.equal(steps[4].type, "mcp_tool_call");
  });

  test("branch step uses predicate condition with field_exists", () => {
    const steps = (appointmentConfirmSmsArchetype.specTemplate as {
      steps: Array<{ id: string; condition?: { type: string; predicate?: { kind: string; field: string } } }>;
    }).steps;
    const branch = steps.find((s) => s.id === "check_appointment_exists");
    assert.ok(branch);
    assert.equal(branch!.condition!.type, "predicate");
    assert.equal(branch!.condition!.predicate!.kind, "field_exists");
    assert.equal(branch!.condition!.predicate!.field, "appointment.startsAt");
  });

  test("both reply steps use send_sms with contact_id + to + body", () => {
    const steps = (appointmentConfirmSmsArchetype.specTemplate as {
      steps: Array<{ id: string; tool?: string; args?: Record<string, unknown> }>;
    }).steps;
    for (const stepId of ["reply_confirmed", "reply_no_appointment"]) {
      const step = steps.find((s) => s.id === stepId);
      assert.ok(step);
      assert.equal(step!.tool, "send_sms");
      assert.ok("contact_id" in (step!.args ?? {}));
      assert.ok("to" in (step!.args ?? {}));
      assert.ok("body" in (step!.args ?? {}));
    }
  });

  test("write_state step targets workspace.soul appointment status", () => {
    const steps = (appointmentConfirmSmsArchetype.specTemplate as {
      steps: Array<{ id: string; path?: string; value?: string }>;
    }).steps;
    const ws = steps.find((s) => s.id === "mark_confirmed");
    assert.ok(ws);
    assert.match(ws!.path!, /^workspace\.soul\.appointments\.upcoming\./);
    assert.equal(ws!.value, "confirmed");
  });
});
