// Tests for evaluatePredicate — the wait-resume matcher.
//
// History: a regression on 2026-05-18 caused the speed-to-lead
// conversation step to never resume. The conversation dispatcher
// persisted matchPredicate={contactId: "<uuid>"} (a plain object —
// ergonomic key/value shape). When the sms.replied event arrived,
// evaluatePredicate received this object but its switch only handled
// the {kind: ..., ...} envelope shape, fell through, and returned
// undefined → the resume scan treated every wait as no-match → the
// conversation never advanced. Operator visible bug: "Tuesday 2pm"
// reply went unanswered for hours.
//
// These tests pin both shapes (envelope + plain object) so the bug
// can never come back. Cover all six predicate kinds plus the
// short-circuits (null / undefined / unknown kinds).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { evaluatePredicate } from "../../../src/lib/workflow/predicate-eval";

describe("evaluatePredicate", () => {
  describe("null / undefined predicate", () => {
    test("null → unconditional match (true)", () => {
      assert.equal(evaluatePredicate(null, { contactId: "x" }), true);
    });

    test("undefined → unconditional match (true)", () => {
      assert.equal(evaluatePredicate(undefined, { contactId: "x" }), true);
    });

    test("empty plain object → unconditional match (no entries to check)", () => {
      assert.equal(evaluatePredicate({}, { contactId: "x" }), true);
    });
  });

  describe("plain-object shape (ergonomic key/value)", () => {
    test("matches when single key/value equals the event payload", () => {
      const matchPredicate = { contactId: "cc59fea8-5f4a-414b-8046-0f818b85585d" };
      const eventPayload = {
        smsMessageId: "sms_1",
        contactId: "cc59fea8-5f4a-414b-8046-0f818b85585d",
        conversationId: null,
      };
      assert.equal(evaluatePredicate(matchPredicate, eventPayload), true);
    });

    test("rejects when single key/value mismatches", () => {
      const matchPredicate = { contactId: "expected" };
      const eventPayload = { contactId: "different" };
      assert.equal(evaluatePredicate(matchPredicate, eventPayload), false);
    });

    test("rejects when key is missing from event payload", () => {
      const matchPredicate = { contactId: "x" };
      const eventPayload = { somethingElse: "y" };
      assert.equal(evaluatePredicate(matchPredicate, eventPayload), false);
    });

    test("matches when all keys equal (multi-key AND semantics)", () => {
      const matchPredicate = { contactId: "x", channel: "sms" };
      const eventPayload = { contactId: "x", channel: "sms", extra: "ignored" };
      assert.equal(evaluatePredicate(matchPredicate, eventPayload), true);
    });

    test("rejects when one of many keys mismatches", () => {
      const matchPredicate = { contactId: "x", channel: "sms" };
      const eventPayload = { contactId: "x", channel: "email" };
      assert.equal(evaluatePredicate(matchPredicate, eventPayload), false);
    });

    test("rejects when expected is undefined and event key is undefined too (strict equality on values)", () => {
      // This guards against {} accidentally matching everything. The
      // empty-object branch returns true (no entries to check), but a
      // predicate with an undefined value should fail loudly.
      const matchPredicate = { contactId: undefined as unknown as string };
      const eventPayload = { contactId: "x" };
      // `undefined !== "x"` → false. Confirms we don't coerce.
      assert.equal(evaluatePredicate(matchPredicate, eventPayload), false);
    });

    test("matches a null expected against a null event value", () => {
      const matchPredicate = { conversationId: null as unknown as string };
      const eventPayload = { conversationId: null };
      assert.equal(evaluatePredicate(matchPredicate, eventPayload), true);
    });
  });

  // Field path semantics: `data.X` fields strip the "data." prefix
  // and look up X on the eventPayload TOP LEVEL. The caller in
  // events/bus.ts passes the event's payload directly (not the full
  // event envelope), so the payload IS the data. This is non-obvious
  // — these tests pin it explicitly.
  describe("envelope shape: field_equals", () => {
    test("matches on data.<field> path (looked up at payload top level)", () => {
      const predicate = { kind: "field_equals" as const, field: "data.formId", value: "f-123" };
      const eventPayload = { formId: "f-123", contactId: "c-1" };
      assert.equal(evaluatePredicate(predicate, eventPayload), true);
    });

    test("rejects when data.<field> value differs", () => {
      const predicate = { kind: "field_equals" as const, field: "data.formId", value: "f-123" };
      const eventPayload = { formId: "f-other" };
      assert.equal(evaluatePredicate(predicate, eventPayload), false);
    });

    test("rejects when field path doesn't start with data.", () => {
      // Documented behavior: only data.* paths dereference. A bare
      // "contactId" returns not-found from readFieldPath → false.
      // (Plain-object shape covers the "I want to match top-level
      // payload keys" use case.)
      const predicate = { kind: "field_equals" as const, field: "contactId", value: "x" };
      const eventPayload = { contactId: "x" };
      assert.equal(evaluatePredicate(predicate, eventPayload), false);
    });

    test("matches on nested data path (data.a.b)", () => {
      const predicate = { kind: "field_equals" as const, field: "data.inner.deep", value: 42 };
      const eventPayload = { inner: { deep: 42 } };
      assert.equal(evaluatePredicate(predicate, eventPayload), true);
    });

    test("rejects when intermediate path segment missing", () => {
      const predicate = { kind: "field_equals" as const, field: "data.inner.deep", value: 42 };
      const eventPayload = { otherKey: "x" };
      assert.equal(evaluatePredicate(predicate, eventPayload), false);
    });
  });

  describe("envelope shape: field_contains", () => {
    test("matches when string field contains substring", () => {
      const predicate = { kind: "field_contains" as const, field: "data.body", substring: "appointment" };
      const eventPayload = { body: "Confirm appointment for Tuesday" };
      assert.equal(evaluatePredicate(predicate, eventPayload), true);
    });

    test("rejects when substring not present", () => {
      const predicate = { kind: "field_contains" as const, field: "data.body", substring: "cancel" };
      const eventPayload = { body: "Confirm appointment" };
      assert.equal(evaluatePredicate(predicate, eventPayload), false);
    });

    test("rejects when field value is not a string", () => {
      const predicate = { kind: "field_contains" as const, field: "data.count", substring: "5" };
      const eventPayload = { count: 5 };
      // Documented: only string values match field_contains.
      assert.equal(evaluatePredicate(predicate, eventPayload), false);
    });
  });

  describe("envelope shape: field_exists", () => {
    test("matches when field present and non-null", () => {
      const predicate = { kind: "field_exists" as const, field: "data.contactId" };
      const eventPayload = { contactId: "c-1" };
      assert.equal(evaluatePredicate(predicate, eventPayload), true);
    });

    test("rejects when field is null", () => {
      const predicate = { kind: "field_exists" as const, field: "data.contactId" };
      const eventPayload = { contactId: null };
      assert.equal(evaluatePredicate(predicate, eventPayload), false);
    });

    test("rejects when field is missing", () => {
      const predicate = { kind: "field_exists" as const, field: "data.contactId" };
      const eventPayload = {};
      assert.equal(evaluatePredicate(predicate, eventPayload), false);
    });

    test("matches falsy non-null values (empty string, zero, false)", () => {
      // field_exists = "is it there at all", not "is it truthy"
      assert.equal(
        evaluatePredicate({ kind: "field_exists", field: "data.s" }, { s: "" }),
        true,
      );
      assert.equal(
        evaluatePredicate({ kind: "field_exists", field: "data.n" }, { n: 0 }),
        true,
      );
      assert.equal(
        evaluatePredicate({ kind: "field_exists", field: "data.b" }, { b: false }),
        true,
      );
    });
  });

  describe("envelope shape: event_emitted", () => {
    test("always true at runtime (eventType filtering happens upstream)", () => {
      const predicate = { kind: "event_emitted" as const, eventType: "anything" };
      assert.equal(evaluatePredicate(predicate, {}), true);
      assert.equal(evaluatePredicate(predicate, { data: {} }), true);
    });
  });

  describe("composite: all", () => {
    test("matches when every child matches", () => {
      const predicate = {
        kind: "all" as const,
        of: [
          { kind: "field_equals" as const, field: "data.formId", value: "f-1" },
          { kind: "field_exists" as const, field: "data.contactId" },
        ],
      };
      const eventPayload = { formId: "f-1", contactId: "c-1" };
      assert.equal(evaluatePredicate(predicate, eventPayload), true);
    });

    test("rejects when any child fails", () => {
      const predicate = {
        kind: "all" as const,
        of: [
          { kind: "field_equals" as const, field: "data.formId", value: "f-1" },
          { kind: "field_equals" as const, field: "data.channel", value: "sms" },
        ],
      };
      const eventPayload = { formId: "f-1", channel: "email" };
      assert.equal(evaluatePredicate(predicate, eventPayload), false);
    });

    test("empty all → vacuously true", () => {
      const predicate = { kind: "all" as const, of: [] };
      assert.equal(evaluatePredicate(predicate, {}), true);
    });
  });

  describe("composite: any", () => {
    test("matches when at least one child matches", () => {
      const predicate = {
        kind: "any" as const,
        of: [
          { kind: "field_equals" as const, field: "data.channel", value: "sms" },
          { kind: "field_equals" as const, field: "data.channel", value: "email" },
        ],
      };
      const eventPayload = { channel: "email" };
      assert.equal(evaluatePredicate(predicate, eventPayload), true);
    });

    test("rejects when no child matches", () => {
      const predicate = {
        kind: "any" as const,
        of: [
          { kind: "field_equals" as const, field: "data.channel", value: "sms" },
          { kind: "field_equals" as const, field: "data.channel", value: "voice" },
        ],
      };
      const eventPayload = { channel: "email" };
      assert.equal(evaluatePredicate(predicate, eventPayload), false);
    });

    test("empty any → vacuously false", () => {
      const predicate = { kind: "any" as const, of: [] };
      assert.equal(evaluatePredicate(predicate, {}), false);
    });
  });

  describe("regression: the conversation-step wait shape (THE bug)", () => {
    // This is the exact bug from 2026-05-18 dogfood. The conversation
    // dispatcher in step-dispatchers/conversation.ts persists
    // matchPredicate={contactId: triggerInfo.contactId} (plain object).
    // The sms.replied event payload from emitSeldonEvent in the Twilio
    // webhook has shape {smsMessageId, contactId, conversationId} at
    // the top level. If this test ever regresses, the speed-to-lead
    // pipeline silently breaks again.
    test("conversation step wait predicate matches sms.replied event payload", () => {
      const conversationWaitPredicate = {
        contactId: "cc59fea8-5f4a-414b-8046-0f818b85585d",
      };
      const smsRepliedEventPayload = {
        smsMessageId: "sms_xyz",
        contactId: "cc59fea8-5f4a-414b-8046-0f818b85585d",
        conversationId: null,
      };
      assert.equal(
        evaluatePredicate(conversationWaitPredicate, smsRepliedEventPayload),
        true,
        "BUG: speed-to-lead conversation step never resumes on customer reply",
      );
    });

    test("conversation step wait predicate rejects reply from a different contact", () => {
      const conversationWaitPredicate = { contactId: "expected-contact" };
      const smsRepliedEventPayload = {
        smsMessageId: "sms_xyz",
        contactId: "different-contact",
        conversationId: null,
      };
      assert.equal(
        evaluatePredicate(conversationWaitPredicate, smsRepliedEventPayload),
        false,
        "Cross-contact bleed: one customer's reply waking another customer's conversation",
      );
    });
  });
});
