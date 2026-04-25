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

describe("emitSeldonEvent — in-memory dispatch (preserved across SLICE 1-a)", () => {
  test("fires registered listeners when called with required orgId", async () => {
    withFreshBus();
    const received: Array<{ type: string; data: unknown }> = [];
    const bus = getSeldonEventBus();
    bus.on("contact.created", (event) => {
      received.push(event);
    });

    await emitSeldonEvent(
      "contact.created",
      { contactId: "ctc_123" },
      { orgId: "00000000-0000-0000-0000-000000000000" },
    );

    assert.equal(received.length, 1);
    assert.equal(received[0].type, "contact.created");
    assert.equal((received[0].data as { contactId: string }).contactId, "ctc_123");
  });

  test("orgId being required is a compile-time invariant (SLICE 1-a G-1a-1)", async () => {
    // SLICE 1-a (2026-04-22) made `options: { orgId }` required. A
    // caller passing only (type, data) now fails typecheck — the
    // green bar catches the bug the 2c optional shape hid from L-22.
    // This test is a runtime anchor for the invariant; the real
    // enforcement is `pnpm typecheck`.
    withFreshBus();
    await emitSeldonEvent(
      "form.submitted",
      { formId: "f_intake", contactId: "ctc_123", data: {} },
      { orgId: "00000000-0000-0000-0000-000000000000" },
    );
    assert.ok(true, "3-arg signature resolves without throwing");
  });
});

describe("emitSeldonEvent — durable write (best-effort per audit §4.3)", () => {
  test("does not throw when DB is unreachable", async () => {
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
});
