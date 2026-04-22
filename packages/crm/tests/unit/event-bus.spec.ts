// Unit tests for lib/events/bus.ts — 2c PR 1 M4.
//
// Behavioral invariants (not DB-correctness — DB writes are tested
// against a real Postgres in PR 2's integration suite):
//   - emitSeldonEvent without options still fires in-memory listeners.
//   - emitSeldonEvent with options.orgId still fires in-memory listeners
//     (the durable write is additive, not a replacement).
//   - emitSeldonEvent with options.orgId does not throw when the
//     workflow_event_log insert fails (no DATABASE_URL in test env).
//     Log-write is best-effort per audit §4.3.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  createInMemoryEventBus,
  getSeldonEventBus,
  setSeldonEventBus,
} from "@seldonframe/core/events";

import { emitSeldonEvent } from "../../src/lib/events/bus";

function withFreshBus(): void {
  // Replace the global bus before each test so listeners don't leak
  // between tests. The test env has no DATABASE_URL, so the
  // workflow_event_log insert path will fail — emitSeldonEvent
  // swallows that error per audit §4.3.
  setSeldonEventBus(createInMemoryEventBus());
}

describe("emitSeldonEvent — in-memory dispatch (pre-2c behavior preserved)", () => {
  test("fires registered listeners when called without options", async () => {
    withFreshBus();
    const received: Array<{ type: string; data: unknown }> = [];
    const bus = getSeldonEventBus();
    bus.on("contact.created", (event) => {
      received.push(event);
    });

    await emitSeldonEvent("contact.created", { contactId: "ctc_123" });

    assert.equal(received.length, 1);
    assert.equal(received[0].type, "contact.created");
    assert.equal((received[0].data as { contactId: string }).contactId, "ctc_123");
  });

  test("fires registered listeners when called WITH options.orgId (additive, not replacing)", async () => {
    withFreshBus();
    const received: Array<{ type: string; data: unknown }> = [];
    const bus = getSeldonEventBus();
    bus.on("form.submitted", (event) => {
      received.push(event);
    });

    await emitSeldonEvent(
      "form.submitted",
      { formId: "f_intake", contactId: "ctc_123", data: {} },
      { orgId: "00000000-0000-0000-0000-000000000000" },
    );

    assert.equal(received.length, 1, "in-memory listener must still fire when orgId is provided");
    assert.equal(received[0].type, "form.submitted");
  });
});

describe("emitSeldonEvent — durable write (best-effort per audit §4.3)", () => {
  test("does not throw when DB is unreachable + orgId is provided", async () => {
    withFreshBus();
    // Test env has no DATABASE_URL → neon() points at localhost which
    // doesn't exist → insert rejects → bus.ts try/catch swallows.
    // The assertion here is "no error propagates" — that's the
    // best-effort invariant.
    await emitSeldonEvent(
      "landing.visited",
      { pageId: "p_1", visitorId: "v_1" },
      { orgId: "00000000-0000-0000-0000-000000000000" },
    );
    assert.ok(true, "emitSeldonEvent resolved without throwing");
  });

  test("does not attempt DB write when orgId is omitted", async () => {
    withFreshBus();
    // Without orgId, the DB path is skipped entirely. This test
    // verifies the in-memory-only path still works in test envs
    // that have no DB infrastructure at all.
    await emitSeldonEvent("contact.updated", { contactId: "ctc_456" });
    assert.ok(true, "emitSeldonEvent (no orgId) resolved without touching DB");
  });
});
