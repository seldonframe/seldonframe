// Tests for the emergency-triage HVAC archetype.
// SLICE 9 PR 1 C7 per scenario doc + audit §4.1.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { archetypes } from "../../src/lib/agents/archetypes";
import {
  hvacArchetypes,
  getHvacArchetype,
} from "../../src/lib/hvac/archetypes";
import { emergencyTriageArchetype } from "../../src/lib/hvac/archetypes/emergency-triage";

describe("emergency-triage archetype — registry isolation (G-9-7)", () => {
  test("appears in HVAC workspace-scoped registry", () => {
    const a = getHvacArchetype("hvac-emergency-triage");
    assert.ok(a);
    assert.equal(a!.id, "hvac-emergency-triage");
  });

  test("does NOT appear in global archetype registry", () => {
    assert.equal(archetypes["hvac-emergency-triage"], undefined);
  });

  test("global archetype count remains 6 (SLICE 9 isolation invariant)", () => {
    assert.equal(Object.keys(archetypes).length, 6);
  });

  test("hvac-archetypes registry now has 2 (pre-season + emergency-triage)", () => {
    assert.equal(Object.keys(hvacArchetypes).length, 2);
  });
});

describe("emergency-triage archetype — shape", () => {
  test("requires crm + sms + hvac-equipment + hvac-service-calls", () => {
    assert.deepEqual(
      [...emergencyTriageArchetype.requiresInstalled].sort(),
      ["crm", "hvac-equipment", "hvac-service-calls", "sms"].sort(),
    );
  });

  test("trigger is message with regex pattern matching EMERGENCY/URGENT", () => {
    const t = emergencyTriageArchetype.specTemplate as {
      trigger: { type: string; channel: string; pattern: { kind: string; value: string } };
    };
    assert.equal(t.trigger.type, "message");
    assert.equal(t.trigger.channel, "sms");
    assert.equal(t.trigger.pattern.kind, "regex");
    assert.match(t.trigger.pattern.value, /EMERGENCY/);
    assert.match(t.trigger.pattern.value, /URGENT/);
  });

  test("8 steps: weather → load → tier → ack (priority|standard) → await → log (high|auto)", () => {
    const steps = (emergencyTriageArchetype.specTemplate as {
      steps: Array<{ id: string; type: string }>;
    }).steps;
    assert.equal(steps.length, 8);
    const ids = steps.map((s) => s.id);
    assert.deepEqual(ids, [
      "check_heat_advisory",
      "load_customer",
      "check_tier",
      "ack_priority",
      "ack_standard",
      "await_confirm",
      "log_high_priority",
      "log_auto_dispatch",
    ]);
  });

  test("weather check uses external_state branch with NWS Phoenix endpoint + false_on_timeout", () => {
    const steps = (emergencyTriageArchetype.specTemplate as {
      steps: Array<{ id: string; type: string; condition?: { type: string; http?: { url: string }; timeout_behavior?: string } }>;
    }).steps;
    const weather = steps.find((s) => s.id === "check_heat_advisory");
    assert.equal(weather!.type, "branch");
    assert.equal(weather!.condition!.type, "external_state");
    assert.match(weather!.condition!.http!.url, /api\.weather\.gov/);
    assert.match(weather!.condition!.http!.url, /PSR/); // PSR = Phoenix forecast office
    assert.equal(weather!.condition!.timeout_behavior, "false_on_timeout");
  });

  test("tier branch uses predicate field_equals on customer.tier", () => {
    const steps = (emergencyTriageArchetype.specTemplate as {
      steps: Array<{ id: string; condition?: { type: string; predicate?: { kind: string; field: string } } }>;
    }).steps;
    const tier = steps.find((s) => s.id === "check_tier");
    assert.equal(tier!.condition!.type, "predicate");
    assert.equal(tier!.condition!.predicate!.kind, "field_equals");
    assert.equal(tier!.condition!.predicate!.field, "customer.tier");
  });

  test("priority + standard ack messages differ on SLA promise (2hr vs 4hr)", () => {
    const steps = (emergencyTriageArchetype.specTemplate as {
      steps: Array<{ id: string; args?: Record<string, unknown> }>;
    }).steps;
    const priority = steps.find((s) => s.id === "ack_priority");
    const standard = steps.find((s) => s.id === "ack_standard");
    assert.match(String(priority!.args!.body), /2 hours/);
    assert.match(String(standard!.args!.body), /4 hours/);
  });

  test("await_event has 1-hour timeout + on_resume + on_timeout paths", () => {
    const steps = (emergencyTriageArchetype.specTemplate as {
      steps: Array<{ id: string; type: string; timeout?: { ms: number }; on_resume?: { next: string }; on_timeout?: { next: string } }>;
    }).steps;
    const await_ = steps.find((s) => s.id === "await_confirm");
    assert.equal(await_!.type, "await_event");
    assert.equal(await_!.timeout!.ms, 3600000); // 1 hour in ms
    assert.equal(await_!.on_resume!.next, "log_high_priority");
    assert.equal(await_!.on_timeout!.next, "log_auto_dispatch");
  });

  test("emit_event steps fire HVAC-specific event names", () => {
    const steps = (emergencyTriageArchetype.specTemplate as {
      steps: Array<{ id: string; type: string; event?: string }>;
    }).steps;
    const high = steps.find((s) => s.id === "log_high_priority");
    const auto = steps.find((s) => s.id === "log_auto_dispatch");
    assert.equal(high!.event, "hvac.emergency.confirmed");
    assert.equal(auto!.event, "hvac.emergency.auto_dispatch");
  });

  test("primitive coverage — all 4 archetype primitive types exercised", () => {
    const steps = (emergencyTriageArchetype.specTemplate as {
      steps: Array<{ type: string }>;
    }).steps;
    const types = new Set(steps.map((s) => s.type));
    assert.ok(types.has("branch"), "branch (external_state + predicate)");
    assert.ok(types.has("read_state"));
    assert.ok(types.has("mcp_tool_call"));
    assert.ok(types.has("await_event"));
    assert.ok(types.has("emit_event"));
  });
});
