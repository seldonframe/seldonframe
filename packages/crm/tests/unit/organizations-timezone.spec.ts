// Tests for organizations.timezone column + helper.
// SLICE 5 PR 1 C3 per audit §3.4.
//
// Additive column (default "UTC") + a tiny resolution helper that
// falls back to workspace tz or UTC when a trigger doesn't specify
// its own timezone (per G-5-1 gate resolution: workspace default +
// per-trigger override, both optional, UTC final fallback).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveScheduleTimezone } from "../../src/lib/agents/schedule-timezone";

// ---------------------------------------------------------------------
// Schema-shape pin (Drizzle column must exist + default to UTC)
// ---------------------------------------------------------------------

describe("organizations.timezone column — schema surface", () => {
  test("organizations schema exports a timezone column", async () => {
    const schema = await import("../../src/db/schema/organizations");
    // Drizzle pgTable columns surface on the table; pin that `timezone`
    // is among the columns.
    assert.ok(
      "timezone" in schema.organizations,
      "organizations table must declare a timezone column",
    );
  });
});

// ---------------------------------------------------------------------
// resolveScheduleTimezone — per-trigger override + workspace fallback + UTC final
// ---------------------------------------------------------------------

describe("resolveScheduleTimezone — fallback chain", () => {
  test("per-trigger timezone wins when valid IANA", () => {
    const tz = resolveScheduleTimezone({
      triggerTimezone: "Europe/London",
      workspaceTimezone: "America/New_York",
    });
    assert.equal(tz, "Europe/London");
  });

  test("falls back to workspace timezone when trigger unset", () => {
    const tz = resolveScheduleTimezone({
      triggerTimezone: undefined,
      workspaceTimezone: "America/New_York",
    });
    assert.equal(tz, "America/New_York");
  });

  test("falls back to workspace when trigger is an empty string", () => {
    const tz = resolveScheduleTimezone({
      triggerTimezone: "",
      workspaceTimezone: "Asia/Tokyo",
    });
    assert.equal(tz, "Asia/Tokyo");
  });

  test("falls back to UTC when both unset", () => {
    const tz = resolveScheduleTimezone({
      triggerTimezone: undefined,
      workspaceTimezone: undefined,
    });
    assert.equal(tz, "UTC");
  });

  test("falls back to UTC when both are invalid IANA", () => {
    const tz = resolveScheduleTimezone({
      triggerTimezone: "Mars/Olympus",
      workspaceTimezone: "Not/A/Zone",
    });
    assert.equal(tz, "UTC");
  });

  test("skips invalid trigger tz and uses workspace tz", () => {
    const tz = resolveScheduleTimezone({
      triggerTimezone: "Mars/Olympus",
      workspaceTimezone: "Europe/Paris",
    });
    assert.equal(tz, "Europe/Paris");
  });

  test("UTC explicitly is a valid zone", () => {
    const tz = resolveScheduleTimezone({
      triggerTimezone: "UTC",
      workspaceTimezone: "America/New_York",
    });
    assert.equal(tz, "UTC");
  });
});
