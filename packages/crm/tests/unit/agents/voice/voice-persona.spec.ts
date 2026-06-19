// Task A5 — TDD tests for composeVoicePersona.
//
// Fixed now = 2026-06-01T17:00:00Z, timezone = America/Los_Angeles.
// That resolves to 10:00 AM PDT on Monday, June 1, 2026.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { OrgSoul } from "../../../../src/lib/soul/types";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";
import type { BookingIntakeField } from "../../../../src/lib/bookings/actions";
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

// ───────────────────────────────────────────────────────────────────────────
// Voice R1 — per-workspace booking fields injected into the persona.
// The plumber workspace declares intakeFields; the persona must tell the model
// exactly what to collect and to pass them to book_appointment as
// intakeResponses keyed by field id. With no intakeFields → name + email.
// ───────────────────────────────────────────────────────────────────────────

const PLUMBER_FIELDS: BookingIntakeField[] = [
  { id: "phone", type: "tel", label: "Phone number", required: true },
  { id: "address", type: "text", label: "Service address", required: true },
  { id: "service", type: "text", label: "Service needed", required: true },
  { id: "notes", type: "textarea", label: "Anything else?", required: false },
];

describe("composeVoicePersona — per-workspace booking fields", () => {
  test("lists the workspace's intake fields to collect, marking required ones", () => {
    const result = composeVoicePersona({
      soul: SOUL,
      blueprint: BLUEPRINT,
      timezone: TIMEZONE,
      now: NOW,
      intakeFields: PLUMBER_FIELDS,
    });

    // A deterministic "collect" instruction is present.
    assert.match(
      result,
      /to book[\s\S]*collect/i,
      "persona must instruct what to collect before booking",
    );
    // Each field's human label is named.
    assert.match(result, /Phone number/);
    assert.match(result, /Service address/);
    assert.match(result, /Service needed/);
    // Required vs optional is conveyed.
    assert.match(result, /required/i, "required fields are marked required");
    assert.match(result, /optional/i, "optional fields are marked optional");
    // The model is told to pass them to book_appointment as intakeResponses
    // keyed by field id, with the actual ids enumerated.
    assert.match(result, /intakeResponses/);
    assert.match(result, /\bphone\b/);
    assert.match(result, /\baddress\b/);
    assert.match(result, /\bservice\b/);
  });

  test("does NOT hardcode email when the workspace collects phone instead", () => {
    const result = composeVoicePersona({
      soul: SOUL,
      blueprint: BLUEPRINT,
      timezone: TIMEZONE,
      now: NOW,
      intakeFields: PLUMBER_FIELDS,
    });
    // The collect-instruction block must not demand an email for a phone-only
    // workspace. (We scope the check to the collect line to avoid matching an
    // unrelated mention elsewhere.)
    const collectLine =
      result.split("\n").find((l) => /to book/i.test(l) && /collect/i.test(l)) ?? "";
    assert.ok(collectLine.length > 0, "expected a 'To book, collect…' line");
    assert.ok(
      !/email/i.test(collectLine),
      "phone-only workspace's collect line must not ask for email",
    );
  });

  test("falls back to name + email when there are NO custom intake fields", () => {
    const result = composeVoicePersona({
      soul: SOUL,
      blueprint: BLUEPRINT,
      timezone: TIMEZONE,
      now: NOW,
      intakeFields: [],
    });
    assert.match(
      result,
      /to book[\s\S]*collect[\s\S]*full name[\s\S]*email/i,
      "with no custom fields, collect full name and email",
    );
  });

  test("omitting intakeFields entirely also falls back to name + email", () => {
    const result = composeVoicePersona({
      soul: SOUL,
      blueprint: BLUEPRINT,
      timezone: TIMEZONE,
      now: NOW,
    });
    assert.match(result, /to book[\s\S]*collect[\s\S]*full name[\s\S]*email/i);
  });

  test("stays pure — same inputs yield identical output", () => {
    const a = composeVoicePersona({
      soul: SOUL,
      blueprint: BLUEPRINT,
      timezone: TIMEZONE,
      now: NOW,
      intakeFields: PLUMBER_FIELDS,
    });
    const b = composeVoicePersona({
      soul: SOUL,
      blueprint: BLUEPRINT,
      timezone: TIMEZONE,
      now: NOW,
      intakeFields: PLUMBER_FIELDS,
    });
    assert.equal(a, b);
  });
});
