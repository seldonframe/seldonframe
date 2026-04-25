// Tests for the heat-advisory-outreach HVAC archetype.
// SLICE 9 PR 2 C2 per scenario doc + audit §4.3.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { archetypes } from "../../src/lib/agents/archetypes";
import {
  hvacArchetypes,
  getHvacArchetype,
} from "../../src/lib/hvac/archetypes";
import { heatAdvisoryArchetype } from "../../src/lib/hvac/archetypes/heat-advisory";

describe("heat-advisory archetype — registry isolation (G-9-7)", () => {
  test("appears in HVAC workspace-scoped registry", () => {
    const a = getHvacArchetype("hvac-heat-advisory-outreach");
    assert.ok(a);
    assert.equal(a!.id, "hvac-heat-advisory-outreach");
  });

  test("does NOT appear in global archetype registry", () => {
    assert.equal(archetypes["hvac-heat-advisory-outreach"], undefined);
  });

  test("global archetype count remains 6 (SLICE 9 isolation invariant)", () => {
    assert.equal(Object.keys(archetypes).length, 6);
  });

  test("hvac-archetypes registry has 3 (pre-season + emergency + heat-advisory)", () => {
    assert.equal(Object.keys(hvacArchetypes).length, 3);
  });
});

describe("heat-advisory archetype — shape", () => {
  test("requires crm + sms + hvac-equipment (no service-calls block)", () => {
    assert.deepEqual(
      [...heatAdvisoryArchetype.requiresInstalled].sort(),
      ["crm", "hvac-equipment", "sms"].sort(),
    );
  });

  test("trigger is schedule with 5am Phoenix cron (before EMERGENCY traffic begins)", () => {
    const t = heatAdvisoryArchetype.specTemplate as {
      trigger: { type: string; cron: string; timezone: string };
    };
    assert.equal(t.trigger.type, "schedule");
    assert.equal(t.trigger.cron, "0 5 * * *");
    assert.equal(t.trigger.timezone, "America/Phoenix");
  });

  test("5 steps: weather → vulnerability → branch → send → log", () => {
    const steps = (heatAdvisoryArchetype.specTemplate as {
      steps: Array<{ id: string; type: string }>;
    }).steps;
    assert.equal(steps.length, 5);
    const ids = steps.map((s) => s.id);
    assert.deepEqual(ids, [
      "check_heat_threshold",
      "scan_vulnerable",
      "check_any_vulnerable",
      "send_advisory",
      "log_outreach",
    ]);
  });

  test("weather check uses external_state branch with 110°F threshold + false_on_timeout", () => {
    const steps = (heatAdvisoryArchetype.specTemplate as {
      steps: Array<{ id: string; type: string; condition?: { type: string; expected?: number; timeout_behavior?: string; http?: { url: string } } }>;
    }).steps;
    const weather = steps.find((s) => s.id === "check_heat_threshold");
    assert.equal(weather!.type, "branch");
    assert.equal(weather!.condition!.type, "external_state");
    assert.equal(weather!.condition!.expected, 110);
    assert.equal(weather!.condition!.timeout_behavior, "false_on_timeout");
    assert.match(weather!.condition!.http!.url, /api\.weather\.gov/);
  });

  test("weather branch ends run on no_match (normal-temperature day)", () => {
    const steps = (heatAdvisoryArchetype.specTemplate as {
      steps: Array<{ id: string; on_no_match_next?: string | null }>;
    }).steps;
    const weather = steps.find((s) => s.id === "check_heat_threshold");
    assert.equal(weather!.on_no_match_next, null);
  });

  test("vulnerable scan filters residential + multi-criterion", () => {
    const steps = (heatAdvisoryArchetype.specTemplate as {
      steps: Array<{ id: string; args?: Record<string, unknown> }>;
    }).steps;
    const scan = steps.find((s) => s.id === "scan_vulnerable");
    assert.equal(scan!.args!.tier, "residential");
    assert.equal(scan!.args!.equipment_age_threshold_years, 12);
    assert.equal(scan!.args!.last_service_threshold_days, 365);
    assert.deepEqual(scan!.args!.tag_flags, ["elderly", "infant", "medical-equip"]);
  });

  test("empty-vulnerability branch ends run quietly", () => {
    const steps = (heatAdvisoryArchetype.specTemplate as {
      steps: Array<{ id: string; on_no_match_next?: string | null }>;
    }).steps;
    const branch = steps.find((s) => s.id === "check_any_vulnerable");
    assert.equal(branch!.on_no_match_next, null);
  });

  test("send_advisory uses brand voice copy from DESERT_COOL_HVAC_COPY.heatAdvisory", () => {
    const steps = (heatAdvisoryArchetype.specTemplate as {
      steps: Array<{ id: string; args?: Record<string, unknown> }>;
    }).steps;
    const send = steps.find((s) => s.id === "send_advisory");
    assert.equal(send!.args!.customer_ids, "{{vulnerable.customers}}");
    assert.match(String(send!.args!.message_template), /110°/);
    assert.match(String(send!.args!.message_template), /Reply YES/);
  });

  test("write_state log uses today date as key + records dispatch metadata", () => {
    const steps = (heatAdvisoryArchetype.specTemplate as {
      steps: Array<{ id: string; type: string; path?: string; value?: Record<string, unknown> }>;
    }).steps;
    const log = steps.find((s) => s.id === "log_outreach");
    assert.equal(log!.type, "write_state");
    assert.equal(log!.path, "workspace.soul.outreach_log.heat_advisory.{{today}}");
    assert.ok("customers_contacted" in log!.value!);
    assert.ok("dispatched_at" in log!.value!);
  });

  test("primitive coverage — schedule + external_state + read + branch + write", () => {
    const steps = (heatAdvisoryArchetype.specTemplate as {
      steps: Array<{ type: string; condition?: { type: string } }>;
    }).steps;
    const types = new Set(steps.map((s) => s.type));
    assert.ok(types.has("branch"));
    assert.ok(types.has("mcp_tool_call"));
    assert.ok(types.has("write_state"));
    // Two branch types (external_state + predicate)
    const conditionTypes = new Set(
      steps.filter((s) => s.type === "branch").map((s) => s.condition!.type),
    );
    assert.ok(conditionTypes.has("external_state"));
    assert.ok(conditionTypes.has("predicate"));
  });
});
