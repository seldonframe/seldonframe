// Tests for the pre-season-maintenance HVAC archetype.
// SLICE 9 PR 1 C6 per scenario doc + gate G-9-7.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { archetypes } from "../../src/lib/agents/archetypes";
import {
  hvacArchetypes,
  getHvacArchetype,
} from "../../src/lib/hvac/archetypes";
import { preSeasonMaintenanceArchetype } from "../../src/lib/hvac/archetypes/pre-season-maintenance";

describe("pre-season-maintenance archetype — registry isolation (G-9-7)", () => {
  test("appears in HVAC workspace-scoped registry", () => {
    const a = getHvacArchetype("hvac-pre-season-maintenance");
    assert.ok(a, "must be in hvac-archetypes registry");
    assert.equal(a!.id, "hvac-pre-season-maintenance");
  });

  test("does NOT appear in global archetype registry (G-9-7 critical)", () => {
    assert.equal(
      archetypes["hvac-pre-season-maintenance"],
      undefined,
      "HVAC archetype MUST NOT leak into global registry — would pollute synthesis baseline + break 27-streak",
    );
  });

  test("global registry still has the 6 baseline archetypes (count unchanged by SLICE 9)", () => {
    assert.equal(
      Object.keys(archetypes).length,
      6,
      "SLICE 9 must preserve the 6 global baselines — speed-to-lead, win-back, review-requester, daily-digest, weather-aware-booking, appointment-confirm-sms",
    );
  });

  test("hvac-archetypes registry grows as archetypes ship (>= 1 in PR 1; PR 2 adds 2 more)", () => {
    assert.ok(Object.keys(hvacArchetypes).length >= 1);
    assert.ok(hvacArchetypes["hvac-pre-season-maintenance"]);
  });
});

describe("pre-season-maintenance archetype — shape", () => {
  test("id matches filename convention", () => {
    assert.equal(preSeasonMaintenanceArchetype.id, "hvac-pre-season-maintenance");
  });

  test("requires crm + sms + hvac-equipment blocks", () => {
    assert.deepEqual(
      [...preSeasonMaintenanceArchetype.requiresInstalled].sort(),
      ["crm", "hvac-equipment", "sms"].sort(),
    );
  });

  test("placeholder-free (v1 design — no per-workspace customization)", () => {
    assert.deepEqual(preSeasonMaintenanceArchetype.placeholders, {});
  });

  test("trigger is schedule with 6am Phoenix cron", () => {
    const t = preSeasonMaintenanceArchetype.specTemplate as {
      trigger: { type: string; cron: string; timezone: string };
    };
    assert.equal(t.trigger.type, "schedule");
    assert.equal(t.trigger.cron, "0 6 * * *");
    assert.equal(t.trigger.timezone, "America/Phoenix");
  });

  test("3 steps: scan → branch → outreach", () => {
    const steps = (preSeasonMaintenanceArchetype.specTemplate as {
      steps: Array<{ id: string; type: string }>;
    }).steps;
    assert.equal(steps.length, 3);
    assert.equal(steps[0].id, "scan_due_customers");
    assert.equal(steps[0].type, "mcp_tool_call");
    assert.equal(steps[1].id, "check_any_due");
    assert.equal(steps[1].type, "branch");
    assert.equal(steps[2].id, "send_outreach");
    assert.equal(steps[2].type, "mcp_tool_call");
  });

  test("scan step filters to residential tier with 180-day threshold", () => {
    const steps = (preSeasonMaintenanceArchetype.specTemplate as {
      steps: Array<{ id: string; args?: Record<string, unknown> }>;
    }).steps;
    const scan = steps.find((s) => s.id === "scan_due_customers");
    assert.ok(scan);
    assert.equal(scan!.args!.tier, "residential");
    assert.equal(scan!.args!.last_service_threshold_days, 180);
  });

  test("branch terminates run on no due customers (quiet day)", () => {
    const steps = (preSeasonMaintenanceArchetype.specTemplate as {
      steps: Array<{ id: string; on_no_match_next?: string | null }>;
    }).steps;
    const branch = steps.find((s) => s.id === "check_any_due");
    assert.equal(branch!.on_no_match_next, null);
  });

  test("outreach step interpolates from `due` capture + brand-voice copy", () => {
    const steps = (preSeasonMaintenanceArchetype.specTemplate as {
      steps: Array<{ id: string; args?: Record<string, unknown> }>;
    }).steps;
    const send = steps.find((s) => s.id === "send_outreach");
    assert.equal(send!.args!.customer_ids, "{{due.customers}}");
    assert.match(String(send!.args!.message_template), /Phoenix summer/);
    assert.match(String(send!.args!.message_template), /\{\{firstName\}\}/);
  });
});
