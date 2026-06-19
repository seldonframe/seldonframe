// Voice Round-1 tool-layer tests (TDD).
//
// Covers the three tool-layer features added for the voice receptionist:
//   1. take_message — the safe exit for out-of-scope / unsure / after-hours.
//      Upserts a contact, writes a "Callback requested" CRM activity, AND
//      fires an operator SMS notification. Asserts all three side effects
//      via injected deps (no DB, no Twilio).
//   2. get_quote_range — pricing as a RANGE, never a firm number. Returns the
//      configured range for a service, or { hasRange:false } when none is
//      configured so the model defers to a technician.
//   3. confirmation read-back gate — book/reschedule/cancel REJECT a write
//      unless confirmed===true, returning the exact spoken read-back summary;
//      with confirmed:true they perform the write. The email-match guard on
//      reschedule/cancel still holds.
//
// PATTERN: this codebase prefers dependency-injection over node:test
// mock.module (tsx's CJS interop makes module mocking unreliable — see
// realtime-tools.spec.ts, find-next-available-slots.spec.ts). So the
// side-effecting tool logic is extracted into exported `run*` cores that take
// an injected deps bag; `execute` wraps them with the real deps. These tests
// drive the cores directly with fakes, and additionally drive the tools'
// `execute` through their Zod schemas (the read-back gate) so the wire
// contract is exercised end-to-end without touching the database.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  // take_message
  takeMessage,
  runTakeMessage,
  type TakeMessageDeps,
  // get_quote_range
  getQuoteRange,
  resolveQuoteRange,
  runGetQuoteRange,
  type GetQuoteRangeDeps,
  type QuoteRange,
  // confirmation read-back gate
  bookAppointment,
  rescheduleAppointment,
  cancelAppointment,
  buildBookingReadBack,
  type ToolExecuteContext,
} from "../../../../src/lib/agents/tools";

import { VOICE_TOOLS } from "../../../../src/lib/agents/voice/openai-realtime";
import voiceSdr from "../../../../src/lib/agents/skills/voice-receptionist/sdr";
import hardRules from "../../../../src/lib/agents/skills/website-chatbot/hard-rules";

const CTX: ToolExecuteContext = {
  orgId: "org-1",
  orgSlug: "acme",
  agentId: "agt-1",
  conversationId: "conv-1",
  testMode: false,
};

// ───────────────────────────────────────────────────────────────────────────
// 0. wiring — the new tools are exposed on voice; the skills teach them
// ───────────────────────────────────────────────────────────────────────────

describe("voice R1 wiring", () => {
  test("take_message and get_quote_range are exposed in VOICE_TOOLS", () => {
    const names = VOICE_TOOLS.map((t) => t.name);
    assert.ok(names.includes("take_message"), "take_message exposed on voice");
    assert.ok(names.includes("get_quote_range"), "get_quote_range exposed on voice");
  });

  test("the voice SDR skill instructs take_message, get_quote_range, and read-back", () => {
    assert.match(voiceSdr, /take_message/);
    assert.match(voiceSdr, /get_quote_range/);
    assert.match(voiceSdr, /confirmed:true/);
  });

  test("hard-rules forbid firm prices and require the read-back", () => {
    assert.match(hardRules, /NEVER state a firm price|never quote/i);
    assert.match(hardRules, /confirmed:true/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 1. take_message
// ───────────────────────────────────────────────────────────────────────────

describe("take_message — registry shape", () => {
  test("is a workspace-scoped AgentTool exposing the 3 inputs", () => {
    assert.equal(takeMessage.name, "take_message");
    const props = (takeMessage.jsonSchema as { properties?: Record<string, unknown> }).properties;
    assert.ok(props?.caller_name, "exposes caller_name");
    assert.ok(props?.caller_phone, "exposes caller_phone");
    assert.ok(props?.message, "exposes message");
  });

  test("input schema accepts a full message and rejects an empty one", () => {
    assert.equal(
      takeMessage.inputSchema.safeParse({
        caller_name: "Jane Doe",
        caller_phone: "+15551234567",
        message: "My furnace is making a noise, please call me back.",
      }).success,
      true,
    );
    assert.equal(
      takeMessage.inputSchema.safeParse({
        caller_name: "Jane Doe",
        caller_phone: "+15551234567",
        message: "",
      }).success,
      false,
      "empty message rejected",
    );
  });
});

describe("take_message — runTakeMessage side effects (mocked db + sms)", () => {
  function makeDeps() {
    const calls = {
      upsert: [] as Array<{ orgId: string; name: string; phone: string }>,
      activity: [] as Array<{ orgId: string; contactId: string | null; subject: string; body: string }>,
      notify: [] as Array<{ orgId: string; body: string }>,
    };
    const deps: TakeMessageDeps = {
      upsertContact: async (args) => {
        calls.upsert.push({ orgId: args.orgId, name: args.fullName, phone: args.phone ?? "" });
        return { id: "contact-123" };
      },
      writeCallbackActivity: async (args) => {
        calls.activity.push({
          orgId: args.orgId,
          contactId: args.contactId,
          subject: args.subject,
          body: args.body,
        });
      },
      notifyOperator: async (args) => {
        calls.notify.push({ orgId: args.orgId, body: args.body });
      },
    };
    return { deps, calls };
  }

  test("upserts the contact, writes the activity, AND notifies the operator", async () => {
    const { deps, calls } = makeDeps();
    const out = await runTakeMessage(
      {
        caller_name: "Jane Doe",
        caller_phone: "+15551234567",
        message: "Furnace making noise — please call back.",
      },
      CTX,
      deps,
    );

    // contact upsert — scoped to the call's org, carries name + phone
    assert.equal(calls.upsert.length, 1, "exactly one contact upsert");
    assert.equal(calls.upsert[0]!.orgId, "org-1");
    assert.equal(calls.upsert[0]!.name, "Jane Doe");
    assert.equal(calls.upsert[0]!.phone, "+15551234567");

    // activity — "Callback requested", threaded onto the upserted contact
    assert.equal(calls.activity.length, 1, "exactly one activity written");
    assert.equal(calls.activity[0]!.orgId, "org-1");
    assert.equal(calls.activity[0]!.contactId, "contact-123");
    assert.match(calls.activity[0]!.subject, /callback requested/i);
    assert.match(calls.activity[0]!.body, /Furnace making noise/);

    // operator SMS notification — fired, scoped to the org, mentions the caller
    assert.equal(calls.notify.length, 1, "exactly one operator notification");
    assert.equal(calls.notify[0]!.orgId, "org-1");
    assert.match(calls.notify[0]!.body, /Jane Doe/);
    assert.match(calls.notify[0]!.body, /\+15551234567/);

    // spoken confirmation back to the caller
    assert.equal(out.ok, true);
    assert.match(out.spoken, /pass(ed)? your message|call you (right )?back/i);
  });

  test("a failed operator notify never fails the message (best-effort)", async () => {
    const { deps, calls } = makeDeps();
    deps.notifyOperator = async () => {
      throw new Error("twilio down");
    };
    const out = await runTakeMessage(
      { caller_name: "Bob", caller_phone: "+15550000000", message: "call me" },
      CTX,
      deps,
    );
    // The contact + activity still landed; the tool still returns ok with a
    // spoken confirmation — a flaky SMS gateway must not break the call.
    assert.equal(calls.upsert.length, 1);
    assert.equal(calls.activity.length, 1);
    assert.equal(out.ok, true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. get_quote_range
// ───────────────────────────────────────────────────────────────────────────

describe("resolveQuoteRange — pure service matching", () => {
  const ranges: QuoteRange[] = [
    { service: "Furnace repair", low: 150, high: 400 },
    { service: "AC Tune-Up", low: 89, high: 129 },
  ];

  test("matches case-insensitively and trims", () => {
    assert.deepEqual(resolveQuoteRange("furnace repair", ranges), ranges[0]);
    assert.deepEqual(resolveQuoteRange("  AC TUNE-UP  ", ranges), ranges[1]);
  });

  test("returns null when no service matches", () => {
    assert.equal(resolveQuoteRange("duct cleaning", ranges), null);
  });

  test("returns null for an empty range list", () => {
    assert.equal(resolveQuoteRange("furnace repair", []), null);
  });
});

describe("get_quote_range — runGetQuoteRange against configured ranges", () => {
  const configured: QuoteRange[] = [{ service: "Furnace repair", low: 150, high: 400 }];

  function depsWith(ranges: QuoteRange[]): GetQuoteRangeDeps {
    return { loadQuoteRanges: async () => ranges };
  }

  test("returns the configured range plus the on-site-confirm note", async () => {
    const out = await runGetQuoteRange({ service: "furnace repair" }, CTX, depsWith(configured));
    assert.equal(out.hasRange, true);
    if (out.hasRange) {
      assert.equal(out.low, 150);
      assert.equal(out.high, 400);
      assert.match(out.note, /technician|on-site|confirm/i);
    }
  });

  test("hasRange:false when the service has no configured range", async () => {
    const out = await runGetQuoteRange({ service: "duct cleaning" }, CTX, depsWith(configured));
    assert.equal(out.hasRange, false);
  });

  test("hasRange:false when the workspace has no ranges at all", async () => {
    const out = await runGetQuoteRange({ service: "furnace repair" }, CTX, depsWith([]));
    assert.equal(out.hasRange, false);
  });

  test("is exposed as a workspace-scoped AgentTool taking { service }", () => {
    assert.equal(getQuoteRange.name, "get_quote_range");
    const props = (getQuoteRange.jsonSchema as { properties?: Record<string, unknown> }).properties;
    assert.ok(props?.service, "exposes service");
    assert.equal(getQuoteRange.inputSchema.safeParse({ service: "Furnace repair" }).success, true);
    assert.equal(getQuoteRange.inputSchema.safeParse({}).success, false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. confirmation read-back gate
// ───────────────────────────────────────────────────────────────────────────

describe("buildBookingReadBack — spoken summary", () => {
  test("includes the name and reads back the slot, ending in a confirm question", () => {
    const text = buildBookingReadBack({
      fullName: "Jane Doe",
      slotIso: "2026-06-02T17:00:00Z",
      service: "Furnace repair",
    });
    assert.match(text, /Jane Doe/);
    assert.match(text, /correct\?\s*$/i, "ends by asking the caller to confirm");
  });
});

describe("book_appointment — confirmation gate", () => {
  test("WITHOUT confirmed: no write, returns a read-back + ask-to-confirm instruction", async () => {
    const out = (await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        email: "jane@acme.co",
        slotIso: "2026-06-02T17:00:00Z",
      },
      CTX,
    )) as { ok: boolean; needsConfirmation?: boolean; readBack?: string };

    assert.equal(out.ok, false, "must NOT write without confirmation");
    assert.equal(out.needsConfirmation, true);
    assert.match(out.readBack ?? "", /Jane Doe/);
    assert.match(out.readBack ?? "", /correct\?\s*$/i);
  });

  test("confirmed:true in testMode performs the (synthetic) write", async () => {
    const out = (await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        email: "jane@acme.co",
        slotIso: "2026-06-02T17:00:00Z",
        confirmed: true,
      },
      { ...CTX, testMode: true },
    )) as { ok: boolean; testMode?: boolean };
    assert.equal(out.ok, true);
    assert.equal(out.testMode, true);
  });

  test("the schema accepts an optional confirmed boolean", () => {
    assert.equal(
      bookAppointment.inputSchema.safeParse({
        fullName: "Jane Doe",
        email: "jane@acme.co",
        slotIso: "2026-06-02T17:00:00Z",
        confirmed: true,
      }).success,
      true,
    );
  });
});

describe("reschedule_appointment — confirmation gate + email guard", () => {
  const BOOKING_ID = "11111111-1111-1111-1111-111111111111";

  test("WITHOUT confirmed: no DB call, returns read-back", async () => {
    const out = (await rescheduleAppointment.execute(
      {
        booking_id: BOOKING_ID,
        new_starts_at_iso: "2026-06-10T16:00:00.000Z",
        customer_email: "jane@acme.co",
      },
      CTX,
      // Inject a fake db whose use would fail the test if reached.
      {
        loadBooking: async () => {
          throw new Error("must not read the DB before confirmation");
        },
        updateBookingStart: async () => {
          throw new Error("must not write before confirmation");
        },
      },
    )) as { ok: boolean; needsConfirmation?: boolean; readBack?: string };

    assert.equal(out.ok, false);
    assert.equal(out.needsConfirmation, true);
    assert.match(out.readBack ?? "", /correct\?\s*$/i);
  });

  test("confirmed:true with a matching email writes the new start", async () => {
    const reads: Array<{ id: string; email: string; orgId: string }> = [];
    const writes: Array<{ id: string; startsAt: Date }> = [];
    const out = (await rescheduleAppointment.execute(
      {
        booking_id: BOOKING_ID,
        new_starts_at_iso: "2026-06-10T16:00:00.000Z",
        customer_email: "jane@acme.co",
        confirmed: true,
      },
      CTX,
      {
        loadBooking: async (args) => {
          reads.push(args);
          // booking exists with a 30-min duration
          return {
            id: BOOKING_ID,
            startsAt: new Date("2026-06-02T17:00:00.000Z"),
            endsAt: new Date("2026-06-02T17:30:00.000Z"),
          };
        },
        updateBookingStart: async (args) => {
          writes.push({ id: args.bookingId, startsAt: args.startsAt });
          return { id: BOOKING_ID };
        },
      },
    )) as { ok: boolean; bookingId?: string; newStartsAt?: string };

    // The email-match guard is honored: the load is scoped by org + email.
    assert.equal(reads.length, 1);
    assert.equal(reads[0]!.email, "jane@acme.co");
    assert.equal(reads[0]!.orgId, "org-1");
    // The write happened with the new start time.
    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.startsAt.toISOString(), "2026-06-10T16:00:00.000Z");
    assert.equal(out.ok, true);
    assert.equal(out.bookingId, BOOKING_ID);
  });

  test("confirmed:true but email/booking mismatch → no write, reason surfaced", async () => {
    const writes: unknown[] = [];
    const out = (await rescheduleAppointment.execute(
      {
        booking_id: BOOKING_ID,
        new_starts_at_iso: "2026-06-10T16:00:00.000Z",
        customer_email: "wrong@acme.co",
        confirmed: true,
      },
      CTX,
      {
        loadBooking: async () => null, // WHERE (org, id, email) matched nothing
        updateBookingStart: async (args) => {
          writes.push(args);
          return { id: BOOKING_ID };
        },
      },
    )) as { ok: boolean; reason?: string };

    assert.equal(out.ok, false);
    assert.equal(writes.length, 0, "no write on email mismatch");
    assert.match(out.reason ?? "", /not_found|mismatch/);
  });
});

describe("cancel_appointment — confirmation gate + email guard", () => {
  const BOOKING_ID = "22222222-2222-2222-2222-222222222222";

  test("WITHOUT confirmed: no DB call, returns read-back", async () => {
    const out = (await cancelAppointment.execute(
      { booking_id: BOOKING_ID, customer_email: "jane@acme.co" },
      CTX,
      {
        cancelBooking: async () => {
          throw new Error("must not write before confirmation");
        },
      },
    )) as { ok: boolean; needsConfirmation?: boolean; readBack?: string };
    assert.equal(out.ok, false);
    assert.equal(out.needsConfirmation, true);
    assert.match(out.readBack ?? "", /cancel/i);
  });

  test("confirmed:true with matching email cancels; reason flows through", async () => {
    const writes: Array<{ id: string; email: string; orgId: string }> = [];
    const out = (await cancelAppointment.execute(
      {
        booking_id: BOOKING_ID,
        customer_email: "jane@acme.co",
        reason: "double-booked",
        confirmed: true,
      },
      CTX,
      {
        cancelBooking: async (args) => {
          writes.push({ id: args.bookingId, email: args.email, orgId: args.orgId });
          return { id: BOOKING_ID };
        },
      },
    )) as { ok: boolean; bookingId?: string };
    assert.equal(writes.length, 1);
    assert.equal(writes[0]!.email, "jane@acme.co");
    assert.equal(writes[0]!.orgId, "org-1");
    assert.equal(out.ok, true);
    assert.equal(out.bookingId, BOOKING_ID);
  });

  test("confirmed:true but email mismatch → no cancel", async () => {
    const out = (await cancelAppointment.execute(
      { booking_id: BOOKING_ID, customer_email: "nope@acme.co", confirmed: true },
      CTX,
      { cancelBooking: async () => null },
    )) as { ok: boolean; reason?: string };
    assert.equal(out.ok, false);
    assert.match(out.reason ?? "", /not_found|mismatch/);
  });
});
