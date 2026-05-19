// Tests for parseInWorkspaceTimezone — parses a naive ISO string
// (no TZ suffix) as wall-clock time in the workspace timezone.
//
// Used by the agent's create_booking handler to interpret LLM-emitted
// preferred_start values correctly. Without this, "2026-05-20T13:00:00"
// gets parsed as UTC on Vercel (server in UTC) and a "1pm CDT" booking
// lands at 8 AM CDT — visible bug from 2026-05-19 dogfood.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { parseInWorkspaceTimezone } from "../../../src/lib/workflow/parse-in-workspace-tz";

describe("parseInWorkspaceTimezone", () => {
  test("naive 1pm in America/Chicago (CDT) = 18:00 UTC", () => {
    // CDT (May, DST) is UTC-5
    const d = parseInWorkspaceTimezone("2026-05-20T13:00:00", "America/Chicago");
    assert.equal(d.toISOString(), "2026-05-20T18:00:00.000Z");
  });

  test("naive 9am in America/Los_Angeles (PDT) = 16:00 UTC", () => {
    // PDT (May, DST) is UTC-7
    const d = parseInWorkspaceTimezone("2026-05-20T09:00:00", "America/Los_Angeles");
    assert.equal(d.toISOString(), "2026-05-20T16:00:00.000Z");
  });

  test("naive 14:00 in Asia/Tokyo = 05:00 UTC same day", () => {
    // Tokyo is UTC+9
    const d = parseInWorkspaceTimezone("2026-05-20T14:00:00", "Asia/Tokyo");
    assert.equal(d.toISOString(), "2026-05-20T05:00:00.000Z");
  });

  test("naive ISO that already has Z is parsed as UTC (passthrough)", () => {
    const d = parseInWorkspaceTimezone("2026-05-20T13:00:00Z", "America/Chicago");
    assert.equal(d.toISOString(), "2026-05-20T13:00:00.000Z");
  });

  test("naive ISO with explicit offset is parsed as that offset (passthrough)", () => {
    const d = parseInWorkspaceTimezone("2026-05-20T13:00:00-05:00", "America/Chicago");
    assert.equal(d.toISOString(), "2026-05-20T18:00:00.000Z");
  });

  test("invalid tz falls back to UTC", () => {
    const d = parseInWorkspaceTimezone("2026-05-20T13:00:00", "Not/AReal/Timezone");
    assert.equal(d.toISOString(), "2026-05-20T13:00:00.000Z");
  });

  test("invalid ISO returns Invalid Date", () => {
    const d = parseInWorkspaceTimezone("not-a-date", "America/Chicago");
    assert.ok(Number.isNaN(d.getTime()));
  });
});
