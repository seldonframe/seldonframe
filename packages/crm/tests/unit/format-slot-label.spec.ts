// 2026-06-01 — voice/chatbot timezone bug: the agent spoke appointment
// times in UTC instead of the workspace's local timezone.
//
// Empirical bug (spark-heating-cooling, tz = America/Los_Angeles): the
// caller booked a slot stored as 2026-06-01T17:00:00Z. That is 10:00 AM
// PDT — a real, valid business-hours slot — and the calendar correctly
// shows 10:00 AM. But the voice agent TOLD the caller "5pm": it read the
// raw "T17:00:00Z" and spoke the UTC hour (17:00 → 5pm) because
// look_up_availability handed it a bare UTC ISO string and nothing in the
// persona converts to local time. (The chatbot's temporal-reasoning skill
// even warns the LLM not to do this arithmetic itself.)
//
// Fix: format the spoken label SERVER-SIDE in the workspace timezone, so
// the agent reads a ready-made "Monday, June 1 at 10:00 AM PDT" and only
// the machine `iso` is passed to book_appointment. These tests pin the
// pure formatter that does the conversion.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { formatSlotLabel, labelSlots } from "../../src/lib/agents/tools";

describe("formatSlotLabel — workspace-local spoken labels", () => {
  test("renders 17:00Z as 10:00 AM PDT for America/Los_Angeles (the bug)", () => {
    const label = formatSlotLabel("2026-06-01T17:00:00Z", "America/Los_Angeles");
    assert.match(label, /10:00\s*AM/i, `expected 10:00 AM, got "${label}"`);
    assert.match(label, /PDT/, `expected PDT abbreviation, got "${label}"`);
    assert.match(label, /Monday/, `expected weekday, got "${label}"`);
    assert.match(label, /June\s*1\b/, `expected calendar date, got "${label}"`);
    // Regression guard: the agent must NOT speak the raw UTC hour "5:00 PM".
    assert.doesNotMatch(label, /5:00\s*PM/i, `must not surface the UTC hour: "${label}"`);
  });

  test("renders the same moment as 1:00 PM EDT for America/New_York", () => {
    const label = formatSlotLabel("2026-06-01T17:00:00Z", "America/New_York");
    assert.match(label, /1:00\s*PM/i, `expected 1:00 PM, got "${label}"`);
    assert.match(label, /EDT/, `expected EDT abbreviation, got "${label}"`);
  });

  test("a UTC workspace labels the hour honestly (5:00 PM UTC)", () => {
    const label = formatSlotLabel("2026-06-01T17:00:00Z", "UTC");
    assert.match(label, /5:00\s*PM/i, `expected 5:00 PM, got "${label}"`);
    assert.match(label, /UTC/, `expected UTC abbreviation, got "${label}"`);
  });

  test("a malformed iso echoes back unchanged (never crashes the call)", () => {
    assert.equal(formatSlotLabel("not-a-real-date", "America/Los_Angeles"), "not-a-real-date");
  });

  test("an unknown timezone falls back to UTC rather than throwing", () => {
    const label = formatSlotLabel("2026-06-01T17:00:00Z", "Not/AZone");
    assert.match(label, /5:00\s*PM/i, `expected UTC fallback 5:00 PM, got "${label}"`);
  });
});

describe("labelSlots — pair each ISO with its local label", () => {
  test("maps raw ISO slots to {iso,label} pairs in workspace TZ", () => {
    const out = labelSlots(
      ["2026-06-01T17:00:00Z", "2026-06-01T18:00:00Z"],
      "America/Los_Angeles",
    );
    assert.equal(out.length, 2);
    // iso is preserved VERBATIM (book_appointment depends on it).
    assert.equal(out[0]!.iso, "2026-06-01T17:00:00Z");
    assert.match(out[0]!.label, /10:00\s*AM/i);
    assert.equal(out[1]!.iso, "2026-06-01T18:00:00Z");
    assert.match(out[1]!.label, /11:00\s*AM/i);
  });

  test("returns an empty array for no slots", () => {
    assert.deepEqual(labelSlots([], "America/Los_Angeles"), []);
  });
});
