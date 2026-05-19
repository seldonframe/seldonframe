// Phase 2 Task 2.5 — pin operator-editable placeholder extraction.
//
// The archetype must expose $maxTurns (user_input, integer-y default)
// and $forbiddenPhrases (soul_copy, comma-list of phrases the agent
// must never emit). Future changes that drop or rename these would
// silently regress the operator's ability to tune the agent without
// code changes — this test catches that at CI.
//
// Background: thin harness + fat SKILL.md + antifragility. Operators
// edit prose at /automations/speed-to-lead/configure. When Claude
// N+1 ships, the same placeholders get smarter results — no code
// change required. See docs/superpowers/specs/2026-05-19-runcontext-
// architecture-design.md "Thin harness + fat SKILL.md" section.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { speedToLeadArchetype } from "../../../src/lib/agents/archetypes/speed-to-lead";

describe("speed-to-lead archetype operator-editable placeholders", () => {
  test("exposes $maxTurns as user_input with a numeric default", () => {
    const p = speedToLeadArchetype.placeholders.$maxTurns;
    assert.ok(p, "$maxTurns placeholder missing");
    assert.equal(p.kind, "user_input");
    assert.match(p.example ?? "", /^\d+$/);
  });

  test("exposes $forbiddenPhrases as soul_copy with the canonical system-error phrases", () => {
    const p = speedToLeadArchetype.placeholders.$forbiddenPhrases;
    assert.ok(p, "$forbiddenPhrases placeholder missing");
    assert.equal(p.kind, "soul_copy");
    assert.ok(
      (p.example ?? "").includes("we couldn't find your appointment"),
      "default $forbiddenPhrases must include the canonical bad phrase from dogfood",
    );
  });

  test("preserves the existing user-input + soul-copy placeholders (regression guard)", () => {
    const ps = speedToLeadArchetype.placeholders;
    assert.ok(ps.$formId, "$formId still exists");
    assert.ok(ps.$appointmentTypeId, "$appointmentTypeId still exists");
    assert.ok(ps.$waitSeconds, "$waitSeconds still exists");
    assert.ok(ps.$openingMessage, "$openingMessage still exists");
    assert.ok(ps.$qualificationCriteria, "$qualificationCriteria still exists");
  });
});
