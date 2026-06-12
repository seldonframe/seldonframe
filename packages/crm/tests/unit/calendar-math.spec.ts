import { test } from "node:test";
import assert from "node:assert/strict";
import {
  yToSnappedMinutes, minutesToClock, computeRescheduledEnd, intervalsOverlap,
  HOUR_HEIGHT_PX, SNAP_MINUTES,
} from "@/lib/bookings/calendar-math";

test("yToSnappedMinutes snaps to 15-min and clamps to the grid", () => {
  assert.equal(yToSnappedMinutes(0), 0);
  assert.equal(yToSnappedMinutes(HOUR_HEIGHT_PX), 60);
  assert.equal(yToSnappedMinutes(HOUR_HEIGHT_PX / 4 + 3), SNAP_MINUTES);
  assert.equal(yToSnappedMinutes(-50), 0);
  assert.ok(yToSnappedMinutes(100000) <= (20 - 8) * 60 - SNAP_MINUTES);
});

test("minutesToClock offsets from the 8:00 grid start", () => {
  assert.deepEqual(minutesToClock(0), { hours: 8, minutes: 0 });
  assert.deepEqual(minutesToClock(90), { hours: 9, minutes: 30 });
});

test("computeRescheduledEnd preserves the original duration", () => {
  const start = new Date("2026-06-12T13:30:00Z");
  const end = new Date("2026-06-12T14:00:00Z");
  const newStart = new Date("2026-06-13T09:15:00Z");
  assert.equal(
    computeRescheduledEnd(start, end, newStart).toISOString(),
    "2026-06-13T09:45:00.000Z",
  );
});

test("intervalsOverlap is true on overlap, false on adjacency", () => {
  const a0 = new Date("2026-06-12T10:00:00Z"), a1 = new Date("2026-06-12T11:00:00Z");
  assert.equal(intervalsOverlap(a0, a1, new Date("2026-06-12T10:30:00Z"), new Date("2026-06-12T11:30:00Z")), true);
  assert.equal(intervalsOverlap(a0, a1, a1, new Date("2026-06-12T12:00:00Z")), false);
});
