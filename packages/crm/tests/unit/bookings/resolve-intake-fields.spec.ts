// Tests for the lazy booking intake-field resolver — soul-first
// classification (2026-07-16).
//
// Live-confirmed bug class (flow-tech-air-conditioning): an explicit
// AESTHETIC pick ("Technical" look → theme.aestheticArchetype =
// "technical-restrained", set via the ready-page design picker / copilot
// update_design) drove B2B consulting booking questions (Company / Role /
// Team size / Budget) onto an HVAC company whose soul/settings correctly
// said vertical=hvac + emergency_service=true. The design picker is a
// SURFACE choice; it must never drive intake SEMANTICS when the soul says
// what the business does.
//
// Run: node --test --import tsx packages/crm/tests/unit/bookings/resolve-intake-fields.spec.ts

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveIntakeFieldsFromSoul } from "@/lib/bookings/resolve-intake-fields";

function fieldIds(fields: Array<{ id: string }>): string[] {
  return fields.map((f) => f.id);
}

describe("resolveIntakeFieldsFromSoul — soul signals beat the visual archetype", () => {
  test("HVAC soul + technical-restrained theme → bold-urgency dispatch fields (Flow-Tech repro)", () => {
    const fields = resolveIntakeFieldsFromSoul(
      // The explicit design pick — an AESTHETIC choice, plausible for a
      // company literally named "Flow-Tech", but not a semantics signal.
      { aestheticArchetype: "technical-restrained", aestheticArchetypeChoice: "technical-restrained" },
      { emergency_service: true },
      { crmPersonality: { vertical: "hvac" } },
      "Flow-Tech Air Conditioning",
      "Service Call",
    );
    const ids = fieldIds(fields);
    // Dispatch questions, not B2B consulting questions.
    assert.ok(ids.includes("issue_type"), `expected bold-urgency issue_type, got: ${ids.join(", ")}`);
    assert.ok(ids.includes("urgency"), `expected bold-urgency urgency, got: ${ids.join(", ")}`);
    assert.ok(!ids.includes("company"), "B2B 'company' field must not appear for an HVAC soul");
    assert.ok(!ids.includes("team_size"), "B2B 'team_size' field must not appear for an HVAC soul");
  });

  test("soul.personality_vertical alone (no settings) also wins over the theme", () => {
    const fields = resolveIntakeFieldsFromSoul(
      { aestheticArchetype: "technical-restrained" },
      { personality_vertical: "hvac", emergency_service: true },
      null,
      "Flow-Tech Air Conditioning",
      null,
    );
    const ids = fieldIds(fields);
    assert.ok(ids.includes("issue_type"));
    assert.ok(!ids.includes("company"));
  });

  test("agency soul on a bold-urgency look → technical-restrained fields (soul-first cuts both ways)", () => {
    const fields = resolveIntakeFieldsFromSoul(
      { aestheticArchetype: "bold-urgency" },
      null,
      { crmPersonality: { vertical: "marketing agency" } },
      "Northbound Collective",
      "Intro Call",
    );
    const ids = fieldIds(fields);
    assert.ok(ids.includes("company"), `expected B2B company field, got: ${ids.join(", ")}`);
    assert.ok(!ids.includes("urgency"), "dispatch 'urgency' field must not appear for an agency soul");
  });
});

describe("resolveIntakeFieldsFromSoul — the 'general' default vertical is not a business signal", () => {
  test("general vertical + roofing name hints → bold-urgency via blended hints (Roofs by Shiloh)", () => {
    // "general" is the registry default for unmatched businesses — it must
    // not short-circuit into the classifier catch-all and defeat the
    // name/title hint classification (the 2026-05-18 Roofs-by-Shiloh fix).
    const fields = resolveIntakeFieldsFromSoul(
      null,
      null,
      { crmPersonality: { vertical: "general" } },
      "Roofs by Shiloh",
      "Free Roof Inspection",
    );
    const ids = fieldIds(fields);
    assert.ok(ids.includes("issue_type"), `expected bold-urgency via name hints, got: ${ids.join(", ")}`);
  });

  test("general vertical + explicit archetype → theme still reachable", () => {
    const fields = resolveIntakeFieldsFromSoul(
      { aestheticArchetype: "technical-restrained" },
      null,
      { crmPersonality: { vertical: "general" } },
      "Acme",
      null,
    );
    const ids = fieldIds(fields);
    assert.ok(ids.includes("company"), `expected technical-restrained via theme, got: ${ids.join(", ")}`);
  });
});

describe("resolveIntakeFieldsFromSoul — back-compat when soul gives no vertical", () => {
  test("empty soul + explicit archetype → archetype fields", () => {
    const fields = resolveIntakeFieldsFromSoul(
      { aestheticArchetype: "technical-restrained" },
      null,
      null,
      "Acme",
      null,
    );
    const ids = fieldIds(fields);
    assert.ok(ids.includes("company"), `expected technical-restrained fields, got: ${ids.join(", ")}`);
    assert.ok(ids.includes("team_size"));
  });

  test("empty soul + empty theme → editorial-warm baseline via the classifier catch-all", () => {
    const fields = resolveIntakeFieldsFromSoul(null, null, null, "Acme", null);
    const ids = fieldIds(fields);
    assert.ok(ids.includes("scope"), `expected editorial-warm baseline, got: ${ids.join(", ")}`);
    assert.ok(ids.includes("notes"), "universal trailer must always be present");
  });

  test("no vertical but hvac workspace name → blended-hints classification still fires", () => {
    const fields = resolveIntakeFieldsFromSoul(
      null,
      null,
      null,
      "Roadrunner HVAC & Air",
      "Emergency AC Repair",
    );
    const ids = fieldIds(fields);
    assert.ok(ids.includes("issue_type"), `expected bold-urgency via name hints, got: ${ids.join(", ")}`);
  });
});

describe("resolveIntakeFieldsFromSoul — step-0 health override keeps precedence", () => {
  test("physio workspace name on any look → clinical intake", () => {
    const fields = resolveIntakeFieldsFromSoul(
      { aestheticArchetype: "editorial-warm" },
      null,
      null,
      "Round Rock Physiotherapy",
      "Initial Assessment",
    );
    const ids = fieldIds(fields);
    assert.ok(ids.includes("concern"), `expected clinical-trust fields, got: ${ids.join(", ")}`);
    assert.ok(ids.includes("insurance"));
    assert.ok(!ids.includes("budget_range"), "contractor budget question must not appear for a physio");
  });

  test("health vertical carried ONLY in settings.crmPersonality → clinical intake (hints include the vertical)", () => {
    // Regression guard for the new soul-first step: "physiotherapy" matches
    // no archetype-classifier regex (catch-all editorial-warm), so without
    // the vertical flowing into the health-override hints this would serve
    // contractor questions — the original physio bug through a new path.
    const fields = resolveIntakeFieldsFromSoul(
      { aestheticArchetype: "editorial-warm" },
      null,
      { crmPersonality: { vertical: "physiotherapy" } },
      "Align Studio",
      "Initial Assessment",
    );
    const ids = fieldIds(fields);
    assert.ok(ids.includes("concern"), `expected clinical-trust fields, got: ${ids.join(", ")}`);
    assert.ok(!ids.includes("budget_range"));
  });
});
