// Tests for resolveIdempotencyTemplate — the delivery-time template
// resolver. Mirrors the envelope-reserved names the M3 parser-side
// validator recognized (id / eventType / emittedAt / orgId) and the
// data.<field> path resolution against the actual event payload.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveIdempotencyTemplate } from "../../../src/lib/subscriptions/idempotency";

const ENVELOPE = {
  id: "evt-123",
  eventType: "booking.created",
  emittedAt: "2026-04-23T12:00:00.000Z",
  orgId: "org-1",
};

describe("resolveIdempotencyTemplate — envelope-reserved names", () => {
  test("{{id}} resolves to event log row id", () => {
    const key = resolveIdempotencyTemplate("{{id}}", {}, ENVELOPE);
    assert.equal(key, "evt-123");
  });

  test("composite envelope template resolves all four fields", () => {
    const key = resolveIdempotencyTemplate(
      "{{eventType}}:{{emittedAt}}:{{orgId}}:{{id}}",
      {},
      ENVELOPE,
    );
    assert.equal(key, "booking.created:2026-04-23T12:00:00.000Z:org-1:evt-123");
  });
});

describe("resolveIdempotencyTemplate — data payload fields", () => {
  test("{{data.<field>}} resolves to the payload field", () => {
    const key = resolveIdempotencyTemplate(
      "{{data.contactId}}:{{data.appointmentId}}",
      { contactId: "contact-1", appointmentId: "appt-9" },
      ENVELOPE,
    );
    assert.equal(key, "contact-1:appt-9");
  });

  test("missing payload field renders as the literal {{placeholder}}", () => {
    // Defensive: runtime resolver doesn't crash on missing data; it
    // leaves the placeholder in so the dispatcher's uniqueness check
    // still dedupes deterministically even on unexpected shapes.
    const key = resolveIdempotencyTemplate(
      "{{data.nope}}",
      { contactId: "c-1" },
      ENVELOPE,
    );
    assert.equal(key, "{{data.nope}}");
  });

  test("nested path resolves via dotted keys on payload", () => {
    const key = resolveIdempotencyTemplate(
      "{{data.inner.key}}",
      { inner: { key: "nested-value" } },
      ENVELOPE,
    );
    assert.equal(key, "nested-value");
  });
});

describe("resolveIdempotencyTemplate — mixed literals + refs", () => {
  test("literal text between interpolations is preserved", () => {
    const key = resolveIdempotencyTemplate(
      "sub:{{data.contactId}}/evt:{{id}}",
      { contactId: "c-1" },
      ENVELOPE,
    );
    assert.equal(key, "sub:c-1/evt:evt-123");
  });

  test("whitespace inside interpolation braces is tolerated", () => {
    const key = resolveIdempotencyTemplate("{{  id  }}", {}, ENVELOPE);
    assert.equal(key, "evt-123");
  });
});
