// tests/unit/operator-portal/messages.spec.ts
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  buildInboxThreads,
  type SmsRow,
  type ThreadNote,
} from "../../../src/lib/operator-portal/messages";

// buildInboxThreads is the PURE core of getInboxThreads, testable without DB.

const makeMsg = (
  contactId: string,
  direction: "inbound" | "outbound",
  readAt: Date | null,
  createdAt: Date,
  body = "msg"
): SmsRow => ({
  id: `msg-${Math.random()}`,
  contactId,
  direction,
  body,
  createdAt,
  readAt,
});

describe("buildInboxThreads", () => {
  test("single inbound with readAt=null → unreadCount=1", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "inbound", null, new Date("2026-06-15T10:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads.length, 1);
    assert.equal(threads[0]?.unreadCount, 1);
    assert.equal(threads[0]?.contactId, "c1");
  });

  test("inbound with readAt set → unreadCount=0", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "inbound", new Date("2026-06-15T10:01:00Z"), new Date("2026-06-15T10:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads[0]?.unreadCount, 0);
  });

  test("multiple contacts — each gets own thread", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "inbound", null, new Date("2026-06-15T10:00:00Z")),
      makeMsg("c2", "inbound", null, new Date("2026-06-15T09:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads.length, 2);
  });

  test("threads sorted most-recent first", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "inbound", null, new Date("2026-06-15T09:00:00Z")),
      makeMsg("c2", "inbound", null, new Date("2026-06-15T11:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads[0]?.contactId, "c2");
  });

  test("outbound-only contact does not appear as thread (no inbound)", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "outbound", null, new Date("2026-06-15T10:00:00Z")),
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads.length, 0);
  });

  test("mixed inbound+outbound: last message direction captured", () => {
    const rows: SmsRow[] = [
      makeMsg("c1", "outbound", null, new Date("2026-06-15T10:01:00Z"), "reply"),
      makeMsg("c1", "inbound", null, new Date("2026-06-15T10:00:00Z"), "question"),
    ];
    const threads = buildInboxThreads(rows);
    // Thread exists (has inbound), last message is the outbound (newer)
    assert.equal(threads.length, 1);
    assert.equal(threads[0]?.lastDirection, "outbound");
    assert.equal(threads[0]?.lastBody, "reply");
    // The inbound has readAt=null but there's a newer outbound, per readAt definition: unread still = 1
    // (readAt is the authoritative check, not outbound-after-inbound)
    assert.equal(threads[0]?.unreadCount, 1);
  });

  test("ignores rows with null contactId", () => {
    const rows: SmsRow[] = [
      { id: "x", contactId: null, direction: "inbound", body: "anon", createdAt: new Date(), readAt: null },
    ];
    const threads = buildInboxThreads(rows);
    assert.equal(threads.length, 0);
  });
});
