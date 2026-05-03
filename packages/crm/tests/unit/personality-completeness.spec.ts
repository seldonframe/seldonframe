// v1.1.9 — Build-time personality completeness gate.
//
// CI fails if any personality in PERSONALITIES is missing a required
// field. Adding a new niche means filling every field; forgetting one
// breaks this test → no half-defined personalities ever ship.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  checkAllPersonalitiesCompleteness,
  checkPersonalityCompleteness,
  formatCompletenessErrors,
} from "@/lib/crm/personality-completeness";
import { PERSONALITIES } from "@/lib/crm/personality";

describe("personality completeness — every PERSONALITY entry", () => {
  test("every personality in the registry passes the completeness check", () => {
    const errors = checkAllPersonalitiesCompleteness();
    if (errors.length > 0) {
      // Fail with a multi-line message that names exactly what's missing.
      assert.fail(formatCompletenessErrors(errors));
    }
  });

  // Per-vertical regression test so a future regression on a specific
  // personality lights up that personality's test row.
  for (const [key, personality] of Object.entries(PERSONALITIES)) {
    test(`personality.${key} has zero completeness errors`, () => {
      const errors = checkPersonalityCompleteness(personality);
      assert.equal(
        errors.length,
        0,
        formatCompletenessErrors(errors),
      );
    });
  }
});

describe("personality completeness — checker behavior", () => {
  test("returns errors for a personality missing intake.title", () => {
    const broken = JSON.parse(JSON.stringify(PERSONALITIES.medspa));
    delete broken.intake;
    const errors = checkPersonalityCompleteness(broken);
    assert.ok(errors.some((e) => e.field === "intake.title"));
  });

  test("returns errors for a personality with <4 trust badges", () => {
    const broken = JSON.parse(JSON.stringify(PERSONALITIES.dental));
    broken.content_templates.trust_badges = ["only one"];
    const errors = checkPersonalityCompleteness(broken);
    assert.ok(
      errors.some(
        (e) =>
          e.field === "content_templates.trust_badges" &&
          /must be exactly 4/.test(e.message),
      ),
    );
  });

  test("returns errors for a personality with <3 dashboard metrics", () => {
    const broken = JSON.parse(JSON.stringify(PERSONALITIES.hvac));
    broken.dashboard.primaryMetrics = [];
    const errors = checkPersonalityCompleteness(broken);
    assert.ok(
      errors.some((e) => e.field === "dashboard.primaryMetrics"),
    );
  });

  test("returns errors for a personality without an email intake field", () => {
    const broken = JSON.parse(JSON.stringify(PERSONALITIES.legal));
    broken.intakeFields = broken.intakeFields.filter(
      (f: { key: string }) => f.key !== "email",
    );
    const errors = checkPersonalityCompleteness(broken);
    assert.ok(errors.some((e) => e.field === "intakeFields[].email"));
  });

  test("formatCompletenessErrors groups errors by vertical", () => {
    const errors = [
      { vertical: "medspa", field: "intake.title", message: "missing" },
      {
        vertical: "medspa",
        field: "content_templates.faqs",
        message: "minimum 3 FAQs (got 0)",
      },
      { vertical: "hvac", field: "intake.title", message: "missing" },
    ];
    const formatted = formatCompletenessErrors(errors);
    assert.match(formatted, /\[medspa\]/);
    assert.match(formatted, /\[hvac\]/);
    assert.match(formatted, /3 personality completeness error/);
  });

  test("formatCompletenessErrors returns empty string for empty input", () => {
    assert.equal(formatCompletenessErrors([]), "");
  });
});
