// ICP-3 Task 6 — the calendar binding is threaded onto the chat/SMS/email
// context exactly like voice.
//
// Two seams are covered without touching Postgres/Anthropic:
//   1. bindingToCtxBooking (pure) — the mapper executeTurn uses to build
//      `ctx.booking`. Driving it with a book_external binding yields a
//      ctx.booking whose binding.mode is "book_external"; with no binding it
//      returns undefined (so workspace/operator agents keep ctx.booking
//      undefined → the byte-for-byte native default). This is the smallest seam
//      that produces what a tool's `execute(input, ctx)` actually receives.
//   2. runChannelTurn (DI form) — the inbound chat/SMS/email orchestrator
//      threads a deployment's binding all the way into executeTurn. We inject a
//      fake executeTurn that captures its input and assert the bookingBinding it
//      received, proving the resolve→thread→execute wiring end-to-end.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { bindingToCtxBooking } from "../../../src/lib/agents/booking/binding-ctx";
import type { CalendarBinding } from "../../../src/lib/agents/booking/calendar-backend";
import {
  resolveBookingPolicy,
  type BookingPolicy,
} from "../../../src/lib/agents/booking/booking-policy";
import {
  runChannelTurn,
  type RunChannelTurnDeps,
} from "../../../src/lib/agents/channels/run-channel-turn";

describe("bindingToCtxBooking — pure binding → ctx.booking mapper", () => {
  test("book_external binding → ctx.booking.binding.mode is book_external", () => {
    const binding: CalendarBinding = {
      mode: "book_external",
      calendarRef: { provider: "googlecalendar", accountId: "ca_1" },
    };
    const booking = bindingToCtxBooking(binding);
    assert.ok(booking, "expected a ctx.booking slice");
    // The seam the booking tools read: ctx.booking.binding drives the
    // CalendarBackend resolution.
    assert.equal(booking.binding?.mode, "book_external");
    assert.equal(booking.binding?.calendarRef?.accountId, "ca_1");
    // Legacy handoff selector: book_external is NOT a handoff mode → "native".
    assert.equal(booking.mode, "native");
  });

  test("external_link binding → legacy mode external_link + url carried", () => {
    const binding: CalendarBinding = { mode: "external_link", externalUrl: "https://cal.com/x" };
    const booking = bindingToCtxBooking(binding);
    assert.ok(booking);
    assert.equal(booking.mode, "external_link");
    assert.equal(booking.externalUrl, "https://cal.com/x");
    assert.equal(booking.binding?.mode, "external_link");
  });

  test("no binding → ctx.booking is undefined (workspace/native default)", () => {
    assert.equal(bindingToCtxBooking(undefined), undefined);
  });

  test("a resolved policy is attached to ctx.booking.policy", () => {
    const binding: CalendarBinding = {
      mode: "book_external",
      calendarRef: { provider: "googlecalendar", accountId: "ca_1" },
    };
    const policy: BookingPolicy = resolveBookingPolicy(
      {
        durationMinutes: 60,
        hours: { 2: { start: "09:00", end: "17:00" } },
        requiredFields: ["name", "phone", "address"],
      },
      null,
      "UTC",
    );
    const booking = bindingToCtxBooking(binding, policy);
    assert.ok(booking, "expected a ctx.booking slice");
    // The per-client policy rides on ctx.booking.policy for the booking tools.
    assert.equal(booking.policy?.durationMinutes, 60);
    assert.deepEqual(booking.policy?.hours, { 2: { start: "09:00", end: "17:00" } });
    assert.deepEqual(booking.policy?.requiredFields, ["name", "phone", "address"]);
    // The binding mapping is unchanged by the added policy arg.
    assert.equal(booking.binding?.mode, "book_external");
    assert.equal(booking.mode, "native");
  });

  test("no policy arg → ctx.booking.policy is absent (binding mapping unchanged)", () => {
    const binding: CalendarBinding = { mode: "external_link", externalUrl: "https://cal.com/x" };
    const booking = bindingToCtxBooking(binding);
    assert.ok(booking);
    assert.equal(booking.policy, undefined);
    assert.equal(booking.mode, "external_link");
    assert.equal(booking.externalUrl, "https://cal.com/x");
  });
});

describe("runChannelTurn — threads the deployment binding into executeTurn", () => {
  /** A minimal inbound chat/SMS message. */
  const inbound = {
    channel: "sms" as const,
    toHandle: "+18335550100",
    fromHandle: "+15125550111",
    text: "what times are open friday?",
    contactId: null,
    metadata: undefined,
  };
  const noopAdapter = { sendReply: async () => {} };

  test("deployment-resolved agent → executeTurn receives the bookingBinding", async () => {
    const binding: CalendarBinding = {
      mode: "book_external",
      calendarRef: { provider: "googlecalendar", accountId: "ca_1" },
    };
    const calls: Array<{ conversationId: string; userMessage: string; bookingBinding?: CalendarBinding }> = [];
    const deps: RunChannelTurnDeps = {
      // Resolved via the deployment-first path → carries the binding.
      resolveInboundAgent: async () => ({ agentId: "ag_1", orgId: "org_1", bookingBinding: binding }),
      getOrCreateConversation: async () => "conv_1",
      executeTurn: async (input) => {
        calls.push(input);
        return { ok: true, assistantMessage: "Friday at 9am works." };
      },
    };

    const result = await runChannelTurn(deps, inbound, noopAdapter);
    assert.deepEqual(result, { handled: true, conversationId: "conv_1" });
    assert.equal(calls.length, 1, "executeTurn should have been called once");
    assert.equal(calls[0].bookingBinding?.mode, "book_external");
    assert.equal(calls[0].bookingBinding?.calendarRef?.accountId, "ca_1");
  });

  test("workspace-resolved agent (no binding) → executeTurn gets bookingBinding undefined", async () => {
    const calls: Array<{ bookingBinding?: CalendarBinding }> = [];
    const deps: RunChannelTurnDeps = {
      // Workspace fall-through → no binding on the resolved agent.
      resolveInboundAgent: async () => ({ agentId: "ag_2", orgId: "org_2" }),
      getOrCreateConversation: async () => "conv_2",
      executeTurn: async (input) => {
        calls.push(input);
        return { ok: true, assistantMessage: "hi" };
      },
    };

    await runChannelTurn(deps, inbound, noopAdapter);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].bookingBinding, undefined);
  });
});
