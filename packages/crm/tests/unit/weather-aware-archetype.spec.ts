// Tests for the weather-aware-booking archetype.
// SLICE 6 PR 2 C5 per audit §11.1.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { archetypes, getArchetype } from "../../src/lib/agents/archetypes";
import { weatherAwareBookingArchetype } from "../../src/lib/agents/archetypes/weather-aware-booking";

describe("weather-aware-booking archetype — registry integration", () => {
  test("discoverable by id", () => {
    const a = getArchetype("weather-aware-booking");
    assert.ok(a);
    assert.equal(a!.id, "weather-aware-booking");
  });

  test("archetype count now 5", () => {
    assert.equal(Object.keys(archetypes).length, 5);
  });

  test("all existing archetypes still present (baseline streak invariant)", () => {
    for (const id of ["speed-to-lead", "win-back", "review-requester", "daily-digest"]) {
      assert.ok(getArchetype(id), `missing ${id}`);
    }
  });
});

describe("weather-aware-booking — shape", () => {
  test("trigger is event-based on booking.requested", () => {
    const trigger = (weatherAwareBookingArchetype.specTemplate as { trigger: { type: string; event: string } }).trigger;
    assert.equal(trigger.type, "event");
    assert.equal(trigger.event, "booking.requested");
  });

  test("has a branch step at the head of the flow", () => {
    const steps = (weatherAwareBookingArchetype.specTemplate as { steps: Array<{ type: string }> }).steps;
    const branchStep = steps.find((s) => s.type === "branch");
    assert.ok(branchStep);
  });

  test("branch condition is external_state type", () => {
    const steps = (weatherAwareBookingArchetype.specTemplate as { steps: Array<{ type: string; condition?: { type: string } }> }).steps;
    const branchStep = steps.find((s) => s.type === "branch") as { condition: { type: string } } | undefined;
    assert.ok(branchStep);
    assert.equal(branchStep!.condition.type, "external_state");
  });

  test("branch uses bearer auth with secret_name placeholder", () => {
    const steps = (weatherAwareBookingArchetype.specTemplate as { steps: Array<unknown> }).steps;
    const branchStep = steps[0] as {
      condition: { http: { auth: { type: string; secret_name: string } } };
    };
    assert.equal(branchStep.condition.http.auth.type, "bearer");
    assert.equal(branchStep.condition.http.auth.secret_name, "$weatherApiSecretName");
  });

  test("on_match_next → reschedule SMS; on_no_match_next → confirm booking", () => {
    const steps = (weatherAwareBookingArchetype.specTemplate as { steps: Array<unknown> }).steps;
    const branchStep = steps[0] as {
      on_match_next: string;
      on_no_match_next: string;
    };
    assert.equal(branchStep.on_match_next, "offer_reschedule");
    assert.equal(branchStep.on_no_match_next, "confirm_booking");
  });

  test("all $placeholder tokens declared", () => {
    const json = JSON.stringify(weatherAwareBookingArchetype.specTemplate);
    const used = new Set(json.match(/\$[a-zA-Z][a-zA-Z0-9_]*/g) ?? []);
    for (const token of used) {
      assert.ok(
        token in weatherAwareBookingArchetype.placeholders,
        `spec template references ${token} but not declared`,
      );
    }
  });

  test("requiresInstalled covers crm + caldiy-booking + sms + email", () => {
    const required = new Set(weatherAwareBookingArchetype.requiresInstalled);
    for (const block of ["crm", "caldiy-booking", "sms", "email"]) {
      assert.ok(required.has(block), `missing required block ${block}`);
    }
  });
});
