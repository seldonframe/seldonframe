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

// T11 reconcile: the real createMcpClient.callTool THROWS on failure and returns
// the MCP { content, isError } shape on success — so a non-throwing return MUST
// be treated as success, with the event id extracted from the content JSON.
test("createEvent treats a returned MCP {content,isError:false} as success + extracts id", async () => {
  const be = makeComposioCalendarBackend({ provider: "googlecalendar", accountId: "ca_1",
    callTool: async () => ({ content: [{ type: "text", text: JSON.stringify({ id: "evt_mcp" }) }], isError: false }) });
  const r = await be.createEvent({ startIso: "x", durationMinutes: 30, timezone: "UTC", title: "t", attendee: { name: "P" } });
  assert.deepEqual(r, { ok: true, eventRef: "evt_mcp" });
});

test("createEvent succeeds with empty eventRef when the MCP content has no id (event still created)", async () => {
  const be = makeComposioCalendarBackend({ provider: "googlecalendar", accountId: "ca_1",
    callTool: async () => ({ content: [{ type: "text", text: "Event created" }] }) });
  const r = await be.createEvent({ startIso: "x", durationMinutes: 30, timezone: "UTC", title: "t", attendee: { name: "P" } });
  assert.deepEqual(r, { ok: true, eventRef: "" });
});

// The REAL GOOGLECALENDAR_FIND_FREE_SLOTS shape (confirmed live via the SDK):
// { successful, data: { calendars: { <calendarId>: { busy:[…], free:[{start,end}] } } } }
test("findDayAvailability parses data.calendars.<id>.free into quantized slots", async () => {
  const be = makeComposioCalendarBackend({
    provider: "googlecalendar", accountId: "ca_1", calendarId: "primary",
    callTool: async () => ({
      successful: true,
      data: {
        calendars: {
          primary: {
            busy: [{ start: "2026-07-01T14:00:00Z", end: "2026-07-01T14:30:00Z" }],
            free: [{ start: "2026-07-01T15:00:00Z", end: "2026-07-01T17:00:00Z" }],
          },
        },
      },
    }),
  });
  const r = await be.findDayAvailability({ date: "2026-07-01", durationMinutes: 30, timezone: "UTC" });
  // 2h free window @ 30-min slots → 15:00, 15:30, 16:00, 16:30
  assert.equal(r.slots.length, 4);
  assert.equal(r.slots[0].iso, "2026-07-01T15:00:00.000Z");
  assert.ok(r.slots[0].label.length > 0);
});
