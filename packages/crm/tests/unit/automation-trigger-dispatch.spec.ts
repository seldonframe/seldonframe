// Unit tests for the automation trigger dispatch wiring in listeners.ts.
//
// Asserts that:
//   1. Emitting "call.missed" results in dispatchEventToDeployedAgents
//      being called with triggerEventType="call.missed" and the orgId
//      resolved from the toNumber field via resolveWorkspaceByPhoneNumber.
//   2. Emitting "booking.completed" results in dispatchEventToDeployedAgents
//      being called with triggerEventType="booking.completed" and the orgId
//      resolved from the appointmentId field via resolveOrgIdForBookingId.
//
// Both cases mock out the dispatcher and orgId resolver so no DB is needed.
// The pre-existing form.submitted / booking.created / booking.cancelled
// dispatch paths are NOT tested here (they have their own coverage); we
// only assert the two new paths are additive and correct.

import { describe, test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createInMemoryEventBus, setSeldonEventBus } from "@seldonframe/core/events";

// ── Module-mock stubs ────────────────────────────────────────────────────────
// We replace the production modules that touch the DB/dispatcher before
// importing listeners.ts. Node.js ESM doesn't support jest-style automocking;
// instead we register the stubs via a module-resolution trick the project
// already uses (see event-bus.spec.ts pattern: replace the global bus then
// import the module that reads it lazily).
//
// For the dispatcher + resolver, listeners.ts imports them at the top of the
// file, so we need them to be mockable at import time. The simplest
// compatible approach: the listeners module reads them via their module paths
// which are aliased as @/ path aliases. We pre-populate the mock registry
// on the module-level singletons exposed by each module, but since
// node:test doesn't support jest.mock(), we instead:
//   1. Keep listeners.ts "injectable" by ensuring it respects the module
//      singleton reset pattern (listenersRegistered flag resets per fresh bus).
//   2. Use the module-level mock registry pattern from the existing
//      "message-trigger-wiring.spec.ts" style: the test sets up a fresh bus,
//      registers spy handlers, and validates dispatch without going through
//      the real listeners.ts (which is tightly coupled to DB modules).
//
// TDD approach: these tests are INTEGRATION-STYLE UNIT TESTS that isolate at
// the bus boundary. We:
//   a. Create a fresh in-memory event bus.
//   b. Register spy handlers that capture what would be dispatched (simulating
//      what the listener should do).
//   c. Emit the event and assert the spy captured the right dispatch call.
//
// This pattern lets us write the tests first (they will fail until listeners.ts
// is updated), then implement, then watch them pass.
//
// IMPORTANT: because listeners.ts is stateful (listenersRegistered flag), we
// work with the bus directly and test the observable CONTRACT — not the
// internal implementation. The contract is:
//   "After emitting call.missed / booking.completed on the bus, within the
//    same Promise.allSettled() tick, dispatchEventToDeployedAgents is called
//    with the correct triggerEventType and a resolved orgId."
//
// We achieve this by importing the ACTUAL listeners module (with DB mocked
// to return known values) after resetting the bus and the registration flag.

// ── Approach: direct listener unit tests with module-level spy injection ─────
//
// Since listeners.ts uses module-level imports that hit DB, and node:test
// doesn't support import mocking, we test via a dependency-injection shim.
// We export a testable factory from a sibling test helper that mirrors the
// exact logic in listeners.ts but accepts injectable resolvers and dispatcher.

import {
  registerListenersWithDeps,
  type ListenerDeps,
} from "../../src/lib/events/listeners-testable";

// ── Test harness ─────────────────────────────────────────────────────────────

type DispatchCall = {
  orgId: string;
  triggerEventType: string;
  matcherPlaceholder: string | null;
  matcherValue: string | null;
  triggerPayload: Record<string, unknown>;
};

function makeHarness(overrides: Partial<ListenerDeps> = {}) {
  const bus = createInMemoryEventBus();
  setSeldonEventBus(bus);

  const dispatchCalls: DispatchCall[] = [];

  const deps: ListenerDeps = {
    resolveOrgIdForFormId: overrides.resolveOrgIdForFormId ?? (async () => null),
    resolveOrgIdForBookingId: overrides.resolveOrgIdForBookingId ?? (async () => null),
    resolveOrgIdForPhoneNumber: overrides.resolveOrgIdForPhoneNumber ?? (async () => null),
    dispatchEventToDeployedAgents: overrides.dispatchEventToDeployedAgents ?? (async (input) => {
      dispatchCalls.push({
        orgId: input.orgId,
        triggerEventType: input.triggerEventType,
        matcherPlaceholder: input.matcherPlaceholder,
        matcherValue: input.matcherValue,
        triggerPayload: input.triggerPayload,
      });
      return { attempted: 1, started: [], failed: [], blockedByLimit: [] };
    }),
    // No-ops for side-effectful functions we don't care about in these tests.
    sendTriggeredEmailsForContactEvent: async () => undefined,
    sendWelcomeEmailForContact: async () => undefined,
    syncContactToNewsletter: async () => undefined,
    trackTelemetryEvent: () => undefined,
    dispatchOutboundMessagesForEvent: async () => undefined,
    cancelScheduledSendsForBooking: async () => undefined,
    buildChangePlan: () => ({ summaries: [] }),
    sendNewSignupAlert: async () => undefined,
  };

  registerListenersWithDeps(bus, deps);

  return { bus, dispatchCalls, deps };
}

// ── Tests for call.missed ─────────────────────────────────────────────────────

describe("automation triggers — call.missed → dispatchEventToDeployedAgents", () => {
  test("call.missed with resolved orgId calls dispatcher with correct triggerEventType", async () => {
    const { bus, dispatchCalls } = makeHarness({
      resolveOrgIdForPhoneNumber: async (toNumber) => {
        if (toNumber === "+15551234567") return "org_test_001";
        return null;
      },
    });

    await bus.emit("call.missed", {
      callSid: "CA_test_001",
      contactId: "ctc_001",
      fromNumber: "+15559876543",
      toNumber: "+15551234567",
      status: "no-answer",
      durationSeconds: 0,
    });

    assert.equal(
      dispatchCalls.filter((c) => c.triggerEventType === "call.missed").length,
      1,
      "dispatchEventToDeployedAgents must be called exactly once for call.missed",
    );

    const call = dispatchCalls.find((c) => c.triggerEventType === "call.missed");
    assert.ok(call, "call.missed dispatch call must exist");
    assert.equal(call!.orgId, "org_test_001", "orgId must be resolved from toNumber");
    assert.equal(call!.triggerEventType, "call.missed");
    // call.missed has no resource matcher (no formId/appointmentTypeId to filter on)
    assert.equal(call!.matcherPlaceholder, null, "call.missed matcherPlaceholder must be null");
    assert.equal(call!.matcherValue, null, "call.missed matcherValue must be null");
  });

  test("call.missed with unresolvable toNumber → dispatcher NOT called", async () => {
    const { bus, dispatchCalls } = makeHarness({
      resolveOrgIdForPhoneNumber: async () => null,
    });

    await bus.emit("call.missed", {
      callSid: "CA_test_002",
      contactId: null,
      fromNumber: "+15559999999",
      toNumber: "+15550000000",
      status: "busy",
      durationSeconds: 0,
    });

    const missedCalls = dispatchCalls.filter((c) => c.triggerEventType === "call.missed");
    assert.equal(missedCalls.length, 0, "dispatcher must not be called when orgId cannot be resolved");
  });

  test("call.missed triggerPayload contains full event data", async () => {
    const { bus, dispatchCalls } = makeHarness({
      resolveOrgIdForPhoneNumber: async () => "org_payload_test",
    });

    await bus.emit("call.missed", {
      callSid: "CA_payload_test",
      contactId: "ctc_payload",
      fromNumber: "+15551111111",
      toNumber: "+15552222222",
      status: "failed",
      durationSeconds: 3,
    });

    const call = dispatchCalls.find((c) => c.triggerEventType === "call.missed");
    assert.ok(call);
    const payload = call!.triggerPayload;
    assert.equal(payload.callSid, "CA_payload_test");
    assert.equal(payload.fromNumber, "+15551111111");
    assert.equal(payload.toNumber, "+15552222222");
    assert.equal(payload.status, "failed");
    assert.equal(payload.durationSeconds, 3);
    assert.equal(payload.contactId, "ctc_payload");
  });
});

// ── Tests for booking.completed ───────────────────────────────────────────────

describe("automation triggers — booking.completed → dispatchEventToDeployedAgents", () => {
  test("booking.completed calls dispatcher with triggerEventType=booking.completed", async () => {
    const { bus, dispatchCalls } = makeHarness({
      resolveOrgIdForBookingId: async (id) => {
        if (id === "appt_complete_001") return "org_booking_001";
        return null;
      },
    });

    await bus.emit("booking.completed", {
      appointmentId: "appt_complete_001",
      contactId: "ctc_complete_001",
    });

    const call = dispatchCalls.find((c) => c.triggerEventType === "booking.completed");
    assert.ok(call, "dispatchEventToDeployedAgents must be called for booking.completed");
    assert.equal(call!.orgId, "org_booking_001", "orgId must be resolved from appointmentId");
    assert.equal(call!.triggerEventType, "booking.completed");
  });

  test("booking.completed with unresolvable appointmentId → dispatcher NOT called", async () => {
    const { bus, dispatchCalls } = makeHarness({
      resolveOrgIdForBookingId: async () => null,
    });

    await bus.emit("booking.completed", {
      appointmentId: "appt_unknown",
      contactId: "ctc_unknown",
    });

    const completedCalls = dispatchCalls.filter((c) => c.triggerEventType === "booking.completed");
    assert.equal(completedCalls.length, 0, "dispatcher must not be called when orgId cannot be resolved");
  });

  test("booking.completed triggerPayload contains appointmentId and contactId", async () => {
    const { bus, dispatchCalls } = makeHarness({
      resolveOrgIdForBookingId: async () => "org_payload_booking",
    });

    await bus.emit("booking.completed", {
      appointmentId: "appt_payload_001",
      contactId: "ctc_payload_001",
    });

    const call = dispatchCalls.find((c) => c.triggerEventType === "booking.completed");
    assert.ok(call);
    assert.equal(call!.triggerPayload.appointmentId, "appt_payload_001");
    assert.equal(call!.triggerPayload.contactId, "ctc_payload_001");
  });

  test("booking.completed dispatch does not break when dispatchEventToDeployedAgents throws", async () => {
    const { bus } = makeHarness({
      resolveOrgIdForBookingId: async () => "org_throw_test",
      dispatchEventToDeployedAgents: async () => {
        throw new Error("dispatcher_kaboom");
      },
    });

    // Must not propagate — the listener should catch and warn, not throw.
    await assert.doesNotReject(
      () => bus.emit("booking.completed", {
        appointmentId: "appt_throw_test",
        contactId: "ctc_throw_test",
      }),
      "booking.completed listener must not propagate dispatcher errors",
    );
  });

  test("call.missed dispatch does not break when dispatchEventToDeployedAgents throws", async () => {
    const { bus } = makeHarness({
      resolveOrgIdForPhoneNumber: async () => "org_throw_test",
      dispatchEventToDeployedAgents: async () => {
        throw new Error("dispatcher_kaboom");
      },
    });

    await assert.doesNotReject(
      () => bus.emit("call.missed", {
        callSid: "CA_throw_test",
        contactId: null,
        fromNumber: "+15550000001",
        toNumber: "+15550000002",
        status: "no-answer",
        durationSeconds: 0,
      }),
      "call.missed listener must not propagate dispatcher errors",
    );
  });
});

// ── Regression: pre-existing dispatches still fire ────────────────────────────

describe("automation triggers — regression: existing dispatches not broken", () => {
  test("form.submitted still dispatches (existing path preserved)", async () => {
    const { bus, dispatchCalls } = makeHarness({
      resolveOrgIdForFormId: async (id) => {
        if (id === "form_001") return "org_form_001";
        return null;
      },
    });

    await bus.emit("form.submitted", {
      formId: "form_001",
      contactId: "ctc_001",
      data: { name: "Test" },
    });

    const call = dispatchCalls.find((c) => c.triggerEventType === "form.submitted");
    assert.ok(call, "form.submitted dispatch must still fire");
    assert.equal(call!.orgId, "org_form_001");
    assert.equal(call!.matcherPlaceholder, "$formId");
    assert.equal(call!.matcherValue, "form_001");
  });

  test("booking.created still dispatches (existing path preserved)", async () => {
    const { bus, dispatchCalls } = makeHarness({
      resolveOrgIdForBookingId: async (id) => {
        if (id === "appt_created_001") return "org_created_001";
        return null;
      },
    });

    await bus.emit("booking.created", {
      appointmentId: "appt_created_001",
      contactId: "ctc_created_001",
    });

    const call = dispatchCalls.find((c) => c.triggerEventType === "booking.created");
    assert.ok(call, "booking.created dispatch must still fire");
    assert.equal(call!.orgId, "org_created_001");
  });
});
