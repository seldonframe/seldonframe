// Task A5 — TDD tests for composeVoicePersona.
//
// Fixed now = 2026-06-01T17:00:00Z, timezone = America/Los_Angeles.
// That resolves to 10:00 AM PDT on Monday, June 1, 2026.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { OrgSoul } from "../../../../src/lib/soul/types";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";
import { composeVoicePersona } from "../../../../src/lib/agents/voice/persona";

const NOW = new Date("2026-06-01T17:00:00Z");
const TIMEZONE = "America/Los_Angeles";

const SOUL: OrgSoul = {
  businessName: "Spark Heating & Cooling",
  businessDescription: "HVAC service and repair for residential clients.",
  industry: "HVAC",
  offerType: "service",
  entityLabels: {
    contact: { singular: "Client", plural: "Clients" },
    deal: { singular: "Job", plural: "Jobs" },
    activity: { singular: "Activity", plural: "Activities" },
    pipeline: { singular: "Pipeline", plural: "Pipelines" },
    intakeForm: { singular: "Intake Form", plural: "Intake Forms" },
  },
  pipeline: { name: "HVAC Jobs", stages: [] },
  suggestedFields: { contact: [], deal: [] },
  contactStatuses: [],
  voice: {
    style: "warm and direct",
    vocabulary: [],
    avoidWords: [],
    samplePhrases: ["We'll get you comfortable again."],
  },
  priorities: [],
  aiContext: "",
  suggestedIntakeForm: { name: "", fields: [] },
  branding: { primaryColor: "#0055FF", accentColor: "#FF5500", mood: "professional" },
  rawInput: { processDescription: "", painPoint: "", clientDescription: "" },
};

const BLUEPRINT: AgentBlueprint = {};

describe("composeVoicePersona", () => {
  test("output includes the business name from soul", () => {
    const result = composeVoicePersona({ soul: SOUL, blueprint: BLUEPRINT, timezone: TIMEZONE, now: NOW });
    assert.ok(
      result.includes("Spark Heating & Cooling"),
      "Output must contain the business name from the soul",
    );
  });

  test("temporal anchor present and {{timezone}} placeholder is resolved", () => {
    const result = composeVoicePersona({ soul: SOUL, blueprint: BLUEPRINT, timezone: TIMEZONE, now: NOW });
    assert.ok(
      result.includes("America/Los_Angeles"),
      "Output must include the resolved timezone string",
    );
    assert.ok(
      !result.includes("{{timezone}}"),
      "Output must NOT contain the literal {{timezone}} placeholder",
    );
  });

  test("output contains voice-sdr prose (look_up_availability)", () => {
    const result = composeVoicePersona({ soul: SOUL, blueprint: BLUEPRINT, timezone: TIMEZONE, now: NOW });
    assert.ok(
      /look_up_availability/.test(result),
      "Output must include voice-sdr skill prose (look_up_availability)",
    );
  });

  test("customSkillMd replaces composed skill body when non-empty", () => {
    const customMd = "## Custom override\nThis is the operator's custom playbook.";
    const blueprintWithCustom: AgentBlueprint = { customSkillMd: customMd };
    const result = composeVoicePersona({
      soul: SOUL,
      blueprint: blueprintWithCustom,
      timezone: TIMEZONE,
      now: NOW,
    });
    assert.ok(
      result.includes(customMd),
      "Output must include the customSkillMd verbatim",
    );
    assert.ok(
      !/look_up_availability/.test(result),
      "Output must NOT contain default voice-sdr prose when customSkillMd is set",
    );
  });
});
