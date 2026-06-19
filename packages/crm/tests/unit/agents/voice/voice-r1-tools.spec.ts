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
  type BookAppointmentDeps,
  type SubmitPublicBookingArgs,
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

// ───────────────────────────────────────────────────────────────────────────
// 4. book_appointment — per-workspace fields (email optional, phone +
//    intakeResponses passthrough). Voice R1: a plumber workspace needs
//    name + phone + address + service (NO email); the agency needs email.
// ───────────────────────────────────────────────────────────────────────────

describe("book_appointment — input schema: email optional, intakeResponses", () => {
  test("accepts a booking with phone but NO email", () => {
    assert.equal(
      bookAppointment.inputSchema.safeParse({
        fullName: "Jane Doe",
        phone: "+15551234567",
        slotIso: "2026-06-02T17:00:00Z",
        intakeResponses: { address: "1234 Main St", service: "Leak repair" },
      }).success,
      true,
      "phone-only booking is valid (no email required)",
    );
  });

  test("accepts a booking with email and no phone (agency path unchanged)", () => {
    assert.equal(
      bookAppointment.inputSchema.safeParse({
        fullName: "Jane Doe",
        email: "jane@acme.co",
        slotIso: "2026-06-02T17:00:00Z",
      }).success,
      true,
    );
  });

  test("REJECTS a booking with neither email nor phone", () => {
    assert.equal(
      bookAppointment.inputSchema.safeParse({
        fullName: "Jane Doe",
        slotIso: "2026-06-02T17:00:00Z",
      }).success,
      false,
      "a booking with no contact method (no email AND no phone) is invalid",
    );
  });

  test("intakeResponses must be a string->string record", () => {
    assert.equal(
      bookAppointment.inputSchema.safeParse({
        fullName: "Jane Doe",
        phone: "+15551234567",
        slotIso: "2026-06-02T17:00:00Z",
        intakeResponses: { address: 123 },
      }).success,
      false,
      "non-string intake values are rejected",
    );
  });
});

describe("book_appointment — jsonSchema (what the model sees)", () => {
  const schema = bookAppointment.jsonSchema as {
    properties?: Record<string, { type?: string; description?: string }>;
    required?: string[];
  };

  test("required no longer includes email — only fullName + slotIso", () => {
    assert.deepEqual(schema.required, ["fullName", "slotIso"]);
  });

  test("exposes an intakeResponses object property documented for the model", () => {
    assert.ok(schema.properties?.intakeResponses, "intakeResponses property present");
    assert.equal(schema.properties!.intakeResponses!.type, "object");
    assert.match(
      schema.properties!.intakeResponses!.description ?? "",
      /field id|keyed|phone|address/i,
      "description tells the model to key by field id",
    );
  });

  test("email + phone properties carry guidance about when each is needed", () => {
    assert.ok(schema.properties?.email, "email still offered");
    assert.ok(schema.properties?.phone, "phone offered");
  });
});

describe("book_appointment — execute passes phone + intakeResponses through (DI)", () => {
  // Capture the args the tool would hand submitPublicBookingAction, via the
  // injectable deps seam (mirrors RescheduleDeps/CancelDeps — no DB).
  function makeDeps() {
    const calls: SubmitPublicBookingArgs[] = [];
    const deps: BookAppointmentDeps = {
      submitBooking: async (args) => {
        calls.push(args);
        return { success: true };
      },
    };
    return { deps, calls };
  }

  test("UNCONFIRMED phone-only booking → read-back first, no submit", async () => {
    const { deps, calls } = makeDeps();
    const out = (await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        phone: "+15551234567",
        slotIso: "2026-06-02T17:00:00Z",
        intakeResponses: { address: "1234 Main St", service: "Leak repair" },
      },
      CTX,
      deps,
    )) as { ok: boolean; needsConfirmation?: boolean; readBack?: string };

    assert.equal(out.ok, false, "no write without confirmation");
    assert.equal(out.needsConfirmation, true);
    assert.match(out.readBack ?? "", /Jane Doe/);
    assert.equal(calls.length, 0, "submit must NOT be called before confirmation");
  });

  test("CONFIRMED phone-only booking → submit called with email '' and intakeResponses incl. phone", async () => {
    const { deps, calls } = makeDeps();
    const out = (await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        phone: "+15551234567",
        slotIso: "2026-06-02T17:00:00Z",
        intakeResponses: { address: "1234 Main St", service: "Leak repair" },
        confirmed: true,
      },
      CTX,
      deps,
    )) as { ok: boolean };

    assert.equal(out.ok, true);
    assert.equal(calls.length, 1, "exactly one submit");
    const arg = calls[0]!;
    assert.equal(arg.orgSlug, "acme");
    assert.equal(arg.fullName, "Jane Doe");
    assert.equal(arg.startsAt, "2026-06-02T17:00:00Z");
    // Email absent → passed as empty string (submitPublicBookingAction treats
    // empty as "resolve contact by phone").
    assert.equal(arg.email, "");
    // Phone is folded INTO intakeResponses.phone (submit derives contact phone
    // from there) — not jammed into notes.
    assert.equal(arg.intakeResponses?.phone, "+15551234567");
    assert.equal(arg.intakeResponses?.address, "1234 Main St");
    assert.equal(arg.intakeResponses?.service, "Leak repair");
    // No "Phone: ..." stop-gap in notes anymore.
    assert.ok(
      !/Phone:/.test(arg.notes ?? ""),
      "phone is not jammed into notes",
    );
  });

  test("CONFIRMED email booking (agency) → submit gets the email, phone omitted", async () => {
    const { deps, calls } = makeDeps();
    const out = (await bookAppointment.execute(
      {
        fullName: "Acme Lead",
        email: "lead@acme.co",
        slotIso: "2026-06-02T17:00:00Z",
        confirmed: true,
      },
      CTX,
      deps,
    )) as { ok: boolean };

    assert.equal(out.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.email, "lead@acme.co");
    // No phone collected → intakeResponses has no phone key.
    assert.equal(calls[0]!.intakeResponses?.phone, undefined);
  });

  test("explicit intakeResponses.phone is NOT overwritten by the phone arg", async () => {
    const { deps, calls } = makeDeps();
    await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        phone: "+15550000000",
        slotIso: "2026-06-02T17:00:00Z",
        // Model already put a (different) phone in intakeResponses — keep it.
        intakeResponses: { phone: "+15559999999", address: "1 Main" },
        confirmed: true,
      },
      CTX,
      deps,
    );
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.intakeResponses?.phone,
      "+15559999999",
      "an explicit intakeResponses.phone wins over the loose phone arg",
    );
  });

  test("confirmed:true in testMode still short-circuits to synthetic success (no submit)", async () => {
    const { deps, calls } = makeDeps();
    const out = (await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        phone: "+15551234567",
        slotIso: "2026-06-02T17:00:00Z",
        confirmed: true,
      },
      { ...CTX, testMode: true },
      deps,
    )) as { ok: boolean; testMode?: boolean };
    assert.equal(out.ok, true);
    assert.equal(out.testMode, true);
    assert.equal(calls.length, 0, "testMode never hits submit");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. caller-ID auto-fill (voice R1+) — the inbound call carries the caller's
//    number. The webhook stamps it onto ctx.callerPhone, and book_appointment
//    defaults intakeResponses.phone to it WHEN the model supplied no phone of
//    its own. A model-supplied phone (top-level or in intakeResponses) wins.
//    This captures the caller's number even when the agent forgets to ask.
// ───────────────────────────────────────────────────────────────────────────

describe("book_appointment — caller-ID auto-fill from ctx.callerPhone", () => {
  function makeDeps() {
    const calls: SubmitPublicBookingArgs[] = [];
    const deps: BookAppointmentDeps = {
      submitBooking: async (args) => {
        calls.push(args);
        return { success: true };
      },
    };
    return { deps, calls };
  }

  test("no model phone but ctx.callerPhone set → submits with intakeResponses.phone === ctx.callerPhone", async () => {
    const { deps, calls } = makeDeps();
    const out = (await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        // No top-level phone, no email — the agent forgot to ask. The address
        // alone would normally fail the contact-method refine, BUT the model
        // can still pass it; here we rely on ctx.callerPhone to be the contact
        // method. The schema refine fires on the INPUT only, so we include a
        // throwaway intakeResponses to satisfy the model's typical shape.
        slotIso: "2026-06-02T17:00:00Z",
        intakeResponses: { address: "1234 Main St", service: "Leak repair", phone: "" },
        confirmed: true,
      },
      { ...CTX, callerPhone: "+15557654321" },
      deps,
    )) as { ok: boolean };

    assert.equal(out.ok, true);
    assert.equal(calls.length, 1, "exactly one submit");
    assert.equal(
      calls[0]!.intakeResponses?.phone,
      "+15557654321",
      "caller ID is auto-filled into intakeResponses.phone when the model gave none",
    );
  });

  test("model-supplied top-level phone WINS over ctx.callerPhone", async () => {
    const { deps, calls } = makeDeps();
    await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        phone: "+15550000000", // the model collected a different number
        slotIso: "2026-06-02T17:00:00Z",
        confirmed: true,
      },
      { ...CTX, callerPhone: "+15557654321" },
      deps,
    );
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.intakeResponses?.phone,
      "+15550000000",
      "a model-supplied phone overrides the caller-ID default",
    );
  });

  test("model-supplied intakeResponses.phone WINS over ctx.callerPhone", async () => {
    const { deps, calls } = makeDeps();
    await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        slotIso: "2026-06-02T17:00:00Z",
        intakeResponses: { phone: "+15559999999", address: "1 Main" },
        confirmed: true,
      },
      { ...CTX, callerPhone: "+15557654321" },
      deps,
    );
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0]!.intakeResponses?.phone,
      "+15559999999",
      "an explicit intakeResponses.phone wins over the caller-ID default",
    );
  });

  test("no ctx.callerPhone (anonymous caller) + email present → behaves exactly as before", async () => {
    const { deps, calls } = makeDeps();
    const out = (await bookAppointment.execute(
      {
        fullName: "Acme Lead",
        email: "lead@acme.co",
        slotIso: "2026-06-02T17:00:00Z",
        confirmed: true,
      },
      // ctx.callerPhone undefined — anonymous / blocked caller.
      CTX,
      deps,
    )) as { ok: boolean };
    assert.equal(out.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.email, "lead@acme.co");
    // No phone anywhere → intakeResponses.phone stays unset (no auto-fill).
    assert.equal(
      calls[0]!.intakeResponses?.phone,
      undefined,
      "anonymous caller with no phone gets no synthetic phone",
    );
  });

  test("ctx.callerPhone does NOT clobber an intakeResponses with a non-empty phone", async () => {
    const { deps, calls } = makeDeps();
    await bookAppointment.execute(
      {
        fullName: "Jane Doe",
        slotIso: "2026-06-02T17:00:00Z",
        intakeResponses: { phone: "+15551112222", address: "1 Main" },
        confirmed: true,
      },
      { ...CTX, callerPhone: "+15557654321" },
      deps,
    );
    assert.equal(calls[0]!.intakeResponses?.phone, "+15551112222");
  });
});
