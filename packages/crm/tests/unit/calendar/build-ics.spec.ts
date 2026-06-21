import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBookingICS } from "../../../src/lib/calendar/build-ics.ts";

const base = {
  uid: "booking-abc123@seldonframe.com",
  start: new Date("2026-07-01T15:00:00Z"),
  end: new Date("2026-07-01T15:30:00Z"),
  summary: "Drain cleaning — Acme Plumbing",
  description: "Booked via phone.\nNotes: gate code 4242",
  location: "123 Main St, Austin TX",
  organizerName: "Acme Plumbing",
  organizerEmail: "hello@acme.test",
  attendeeName: "Pat Lee",
  attendeeEmail: "pat@example.test",
  now: new Date("2026-06-21T12:00:00Z"),
};

test("emits a valid VCALENDAR/VEVENT with REQUEST method", () => {
  const ics = buildBookingICS(base);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /VERSION:2\.0\r\n/);
  assert.match(ics, /METHOD:REQUEST\r\n/);
  assert.match(ics, /BEGIN:VEVENT\r\n/);
  assert.match(ics, /UID:booking-abc123@seldonframe\.com\r\n/);
  assert.match(ics, /DTSTART:20260701T150000Z\r\n/);
  assert.match(ics, /DTEND:20260701T153000Z\r\n/);
  assert.match(ics, /DTSTAMP:20260621T120000Z\r\n/);
  assert.match(ics, /SEQUENCE:0\r\n/);
  assert.match(ics, /STATUS:CONFIRMED\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n?$/);
});

test("escapes ; , \\ and newlines in text fields", () => {
  const ics = buildBookingICS({ ...base, summary: "A; B, C\\D", description: "line1\nline2" });
  assert.match(ics, /SUMMARY:A\\; B\\, C\\\\D\r\n/);
  assert.match(ics, /DESCRIPTION:line1\\nline2/);
});

test("organizer + attendee present", () => {
  const ics = buildBookingICS(base);
  assert.match(ics, /ORGANIZER;CN=Acme Plumbing:mailto:hello@acme\.test\r\n/);
  assert.match(ics, /ATTENDEE;CN=Pat Lee[^\r\n]*:mailto:pat@example\.test\r\n/);
});

test("CANCEL method + bumped sequence for cancellations", () => {
  const ics = buildBookingICS({ ...base, method: "CANCEL", sequence: 1 });
  assert.match(ics, /METHOD:CANCEL\r\n/);
  assert.match(ics, /SEQUENCE:1\r\n/);
  assert.match(ics, /STATUS:CANCELLED\r\n/);
});

test("all lines use CRLF and none exceeds 75 octets unfolded", () => {
  const ics = buildBookingICS({ ...base, description: "x".repeat(200) });
  for (const line of ics.split("\r\n")) assert.ok(line.length <= 75, `line too long: ${line.slice(0,40)}…`);
});
