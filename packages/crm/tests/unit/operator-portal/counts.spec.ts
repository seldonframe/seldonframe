// Pure cores for the Today-screen glance counts. The Drizzle wrappers
// (countNewLeads / countUnreadInboundSms) feed rows into these; the
// reductions are where the logic lives, so they're what we pin.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  isWithinDays,
  unreadInboundCountFromRows,
} from "../../../src/lib/operator-portal/counts";

// NOTE: countNewLeads / countUnreadInboundSms hit the DB, so they are
// NOT unit-tested here (the runner has no DB + no module mocking — see
// the messaging-layer "tests use injected deps" convention). The PURE
// cores below ARE the logic; they're exported async (the module is
// "use server", which forbids non-async exports), so each assertion
// awaits.

describe("isWithinDays", () => {
  const now = new Date("2026-06-14T12:00:00Z");

  test("true for a date 3 days ago within a 7-day window", async () => {
    assert.equal(await isWithinDays(new Date("2026-06-11T12:00:00Z"), 7, now), true);
  });

  test("false for a date 8 days ago within a 7-day window", async () => {
    assert.equal(await isWithinDays(new Date("2026-06-06T11:59:00Z"), 7, now), false);
  });

  test("true for right now", async () => {
    assert.equal(await isWithinDays(now, 7, now), true);
  });
});

describe("unreadInboundCountFromRows", () => {
  // Rows are desc-by-createdAt, matching the conversations query.
  // Unread = inbound messages with NO outbound after them (walking
  // newest→oldest, once we hit an outbound for a contact the older
  // inbounds are considered read).
  test("counts a single trailing inbound as unread", async () => {
    const rows = [
      { contactId: "c1", direction: "inbound" as const },
    ];
    assert.equal(await unreadInboundCountFromRows(rows), 1);
  });

  test("inbound followed (newer) by outbound is read → zero", async () => {
    const rows = [
      { contactId: "c1", direction: "outbound" as const }, // newest
      { contactId: "c1", direction: "inbound" as const },
    ];
    assert.equal(await unreadInboundCountFromRows(rows), 0);
  });

  test("two unanswered inbounds from same contact count as two", async () => {
    const rows = [
      { contactId: "c1", direction: "inbound" as const },
      { contactId: "c1", direction: "inbound" as const },
    ];
    assert.equal(await unreadInboundCountFromRows(rows), 2);
  });

  test("sums unread across contacts", async () => {
    const rows = [
      { contactId: "c1", direction: "inbound" as const },
      { contactId: "c2", direction: "outbound" as const },
      { contactId: "c2", direction: "inbound" as const },
      { contactId: "c3", direction: "inbound" as const },
    ];
    // c1: 1 unread, c2: 0 (outbound newer than its inbound), c3: 1 → 2
    assert.equal(await unreadInboundCountFromRows(rows), 2);
  });

  test("ignores rows with no contactId", async () => {
    const rows = [
      { contactId: null, direction: "inbound" as const },
      { contactId: "c1", direction: "inbound" as const },
    ];
    assert.equal(await unreadInboundCountFromRows(rows), 1);
  });
});
