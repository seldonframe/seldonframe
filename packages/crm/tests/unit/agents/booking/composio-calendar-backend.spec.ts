import { test } from "node:test";
import assert from "node:assert/strict";
import { makeComposioCalendarBackend } from "../../../../src/lib/agents/booking/composio-calendar-backend";

test("createEvent calls GOOGLECALENDAR_CREATE_EVENT with mapped args + returns eventRef", async () => {
  const calls: any[] = [];
  const be = makeComposioCalendarBackend({
    provider: "googlecalendar", accountId: "ca_1", calendarId: "primary",
    callTool: async (slug, args) => { calls.push({ slug, args }); return { successful: true, data: { id: "evt_9" } }; },
  });
  const r = await be.createEvent({ startIso: "2026-07-01T16:00:00Z", durationMinutes: 30, timezone: "America/Chicago",
    title: "Service call", attendee: { name: "Pat", email: "pat@x.com" }, notes: "AC down" });
  assert.equal(calls[0].slug, "GOOGLECALENDAR_CREATE_EVENT");
  assert.equal(calls[0].args.calendar_id, "primary");
  assert.equal(calls[0].args.start_datetime, "2026-07-01T16:00:00Z");
  assert.equal(calls[0].args.event_duration_minutes, 30);
  assert.deepEqual(calls[0].args.attendees, ["pat@x.com"]);
  assert.deepEqual(r, { ok: true, eventRef: "evt_9" });
});

test("createEvent returns {ok:false} when callTool throws (→ native fallback)", async () => {
  const be = makeComposioCalendarBackend({ provider: "googlecalendar", accountId: "ca_1",
    callTool: async () => { throw new Error("composio 502"); } });
  const r = await be.createEvent({ startIso: "x", durationMinutes: 30, timezone: "UTC", title: "t", attendee: { name: "P" } });
  assert.equal(r.ok, false);
});

test("createEvent returns {ok:false} when result not successful", async () => {
  const be = makeComposioCalendarBackend({ provider: "googlecalendar", accountId: "ca_1",
    callTool: async () => ({ successful: false, error: "nope" }) });
  const r = await be.createEvent({ startIso: "x", durationMinutes: 30, timezone: "UTC", title: "t", attendee: { name: "P" } });
  assert.equal(r.ok, false);
});

test("outlook uses OUTLOOK_CALENDAR_CREATE_EVENT", async () => {
  const calls: any[] = [];
  const be = makeComposioCalendarBackend({ provider: "outlook", accountId: "ca_2",
    callTool: async (slug) => { calls.push(slug); return { successful: true, data: { id: "e" } }; } });
  await be.createEvent({ startIso: "x", durationMinutes: 30, timezone: "UTC", title: "t", attendee: { name: "P" } });
  assert.equal(calls[0], "OUTLOOK_CALENDAR_CREATE_EVENT");
});

test("findDayAvailability returns {slots:[]} on error (never throws)", async () => {
  const be = makeComposioCalendarBackend({ provider: "googlecalendar", accountId: "ca_1",
    callTool: async () => { throw new Error("boom"); } });
  const r = await be.findDayAvailability({ date: "2026-07-01", durationMinutes: 30, timezone: "UTC" });
  assert.deepEqual(r, { slots: [] });
});
