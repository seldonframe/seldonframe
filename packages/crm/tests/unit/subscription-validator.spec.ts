// Tests for validateSubscriptions — SLICE 1 PR 1 M3 cross-registry
// validator (audit §3.5 + §5.3 + G-1/G-3/G-4).
//
// Covers:
//   - Event reference resolves in SeldonEvent registry (bare name)
//     after stripping the <block-slug>: prefix from G-1 events.
//   - Handler reference resolves against provided handlerExports set.
//   - idempotency_key template references walk event envelope /
//     event payload fields (G-3 "no silent non-idempotent": every
//     {{path}} must resolve at validation time).
//   - filter parses against PredicateSchema (reused, NOT extended).
//   - Retry ceiling is schema-enforced (M1 tested) — not re-asserted
//     here; we focus on cross-registry concerns M3 owns.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { SubscriptionEntry } from "../../src/lib/blocks/contract-v2";
import {
  validateSubscriptions,
  type EventRegistry,
  type SubscriptionValidationContext,
} from "../../src/lib/blocks/subscription-validator";

// A tiny registry fixture mirroring packages/core/src/events/event-registry.json
// shape — enough variety to cover the four cases (bare name match,
// missing, data-field-walk, envelope-reserved-field).
const FIXTURE_EVENT_REGISTRY: EventRegistry = {
  events: [
    {
      type: "booking.created",
      fields: {
        appointmentId: { rawType: "string", nullable: false },
        contactId: { rawType: "string", nullable: false },
      },
    },
    {
      type: "contact.created",
      fields: {
        contactId: { rawType: "string", nullable: false },
      },
    },
    {
      type: "form.submitted",
      fields: {
        formId: { rawType: "string", nullable: false },
        contactId: { rawType: "string", nullable: false },
        data: { rawType: "Record<string, unknown>", nullable: false },
      },
    },
  ],
};

const FIXTURE_HANDLERS = new Set([
  "onBookingCreate",
  "onContactCreate",
  "onFormSubmitted",
  "logActivity",
]);

function ctx(overrides: Partial<SubscriptionValidationContext> = {}): SubscriptionValidationContext {
  return {
    eventRegistry: FIXTURE_EVENT_REGISTRY,
    handlerExports: FIXTURE_HANDLERS,
    ...overrides,
  };
}

// Schema-built SubscriptionEntry stand-ins — we feed the validator
// the shape the parser produces (idempotency_key + retry defaulted).
function sub(partial: Partial<SubscriptionEntry> & { event: string; handler: string }): SubscriptionEntry {
  return {
    idempotency_key: "{{id}}",
    retry: { max: 3, backoff: "exponential", initial_delay_ms: 1000 },
    ...partial,
  } as SubscriptionEntry;
}

describe("validateSubscriptions — undefined / empty", () => {
  test("undefined subscriptions produces no issues", () => {
    const issues = validateSubscriptions(undefined, ctx());
    assert.deepEqual(issues, []);
  });

  test("empty subscriptions array produces no issues", () => {
    const issues = validateSubscriptions([], ctx());
    assert.deepEqual(issues, []);
  });
});

describe("validateSubscriptions — G-1 event resolution", () => {
  test("known event (after stripping block-slug prefix) produces no issue", () => {
    const issues = validateSubscriptions(
      [sub({ event: "caldiy-booking:booking.created", handler: "onBookingCreate" })],
      ctx(),
    );
    assert.deepEqual(issues, []);
  });

  test("unknown bare event emits unknown_event", () => {
    const issues = validateSubscriptions(
      [sub({ event: "caldiy-booking:booking.nonexistent", handler: "onBookingCreate" })],
      ctx(),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "unknown_event");
    assert.equal(issues[0].index, 0);
    assert.equal(issues[0].path, "event");
  });

  test("multi-segment bare event resolves (conversation.turn.received-style)", () => {
    const registry: EventRegistry = {
      events: [
        {
          type: "conversation.turn.received",
          fields: { conversationId: { rawType: "string", nullable: false } },
        },
      ],
    };
    const issues = validateSubscriptions(
      [sub({ event: "email:conversation.turn.received", handler: "logActivity" })],
      ctx({ eventRegistry: registry }),
    );
    assert.deepEqual(issues, []);
  });
});

describe("validateSubscriptions — handler resolution", () => {
  test("handler in handlerExports produces no issue", () => {
    const issues = validateSubscriptions(
      [sub({ event: "crm:contact.created", handler: "onContactCreate" })],
      ctx(),
    );
    assert.deepEqual(issues, []);
  });

  test("handler NOT in handlerExports emits unknown_handler", () => {
    const issues = validateSubscriptions(
      [sub({ event: "crm:contact.created", handler: "doesNotExist" })],
      ctx(),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "unknown_handler");
    assert.equal(issues[0].path, "handler");
  });

  test("when handlerExports is undefined, handler resolution is skipped (PR 2 will enforce)", () => {
    const issues = validateSubscriptions(
      [sub({ event: "crm:contact.created", handler: "doesNotExistAnywhere" })],
      ctx({ handlerExports: undefined }),
    );
    assert.deepEqual(issues, []);
  });
});

describe("validateSubscriptions — G-3 idempotency key resolution", () => {
  test("default {{id}} is always valid (envelope-reserved)", () => {
    const issues = validateSubscriptions(
      [sub({ event: "crm:contact.created", handler: "onContactCreate" })],
      ctx(),
    );
    assert.deepEqual(issues, []);
  });

  test("envelope-reserved fields ({{id}}, {{eventType}}, {{emittedAt}}, {{orgId}}) all resolve", () => {
    const issues = validateSubscriptions(
      [
        sub({
          event: "crm:contact.created",
          handler: "onContactCreate",
          idempotency_key: "{{eventType}}:{{emittedAt}}:{{orgId}}:{{id}}",
        }),
      ],
      ctx(),
    );
    assert.deepEqual(issues, []);
  });

  test("{{data.<field>}} resolves when field is on event payload", () => {
    const issues = validateSubscriptions(
      [
        sub({
          event: "caldiy-booking:booking.created",
          handler: "onBookingCreate",
          idempotency_key: "{{data.contactId}}:{{data.appointmentId}}",
        }),
      ],
      ctx(),
    );
    assert.deepEqual(issues, []);
  });

  test("{{data.<unknown>}} emits bad_idempotency_key", () => {
    const issues = validateSubscriptions(
      [
        sub({
          event: "caldiy-booking:booking.created",
          handler: "onBookingCreate",
          idempotency_key: "{{data.nope}}",
        }),
      ],
      ctx(),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "bad_idempotency_key");
    assert.equal(issues[0].path, "idempotency_key");
    assert.ok(issues[0].message.includes("nope"));
  });

  test("Record<string,unknown> event-payload nested key passes (opaque shape)", () => {
    // form.submitted.data is Record<string, unknown> — can't type-check
    // nested keys, validator must pass `{{data.data.contactId}}` rather
    // than false-positive.
    const issues = validateSubscriptions(
      [
        sub({
          event: "formbricks-intake:form.submitted",
          handler: "onFormSubmitted",
          idempotency_key: "{{data.data.contactId}}",
        }),
      ],
      ctx(),
    );
    assert.deepEqual(issues, []);
  });

  test("unrecognized top-level ref (not envelope or data.) emits bad_idempotency_key", () => {
    const issues = validateSubscriptions(
      [
        sub({
          event: "crm:contact.created",
          handler: "onContactCreate",
          idempotency_key: "{{workspace.slug}}",
        }),
      ],
      ctx(),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "bad_idempotency_key");
  });
});

describe("validateSubscriptions — filter is Predicate (reuse, not extend)", () => {
  test("valid field_exists predicate produces no issue", () => {
    const issues = validateSubscriptions(
      [
        sub({
          event: "formbricks-intake:form.submitted",
          handler: "onFormSubmitted",
          filter: { kind: "field_exists", field: "data.contactId" },
        }),
      ],
      ctx(),
    );
    assert.deepEqual(issues, []);
  });

  test("valid all-composite predicate produces no issue", () => {
    const issues = validateSubscriptions(
      [
        sub({
          event: "formbricks-intake:form.submitted",
          handler: "onFormSubmitted",
          filter: {
            kind: "all",
            of: [
              { kind: "field_exists", field: "data.contactId" },
              { kind: "field_equals", field: "data.formId", value: "form-1" },
            ],
          },
        }),
      ],
      ctx(),
    );
    assert.deepEqual(issues, []);
  });

  test("malformed predicate (unknown kind) emits bad_filter_predicate", () => {
    const issues = validateSubscriptions(
      [
        sub({
          event: "crm:contact.created",
          handler: "onContactCreate",
          filter: { kind: "not_a_real_kind", field: "x" } as unknown,
        }),
      ],
      ctx(),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "bad_filter_predicate");
    assert.equal(issues[0].path, "filter");
  });

  test("malformed predicate (missing required field) emits bad_filter_predicate", () => {
    const issues = validateSubscriptions(
      [
        sub({
          event: "crm:contact.created",
          handler: "onContactCreate",
          filter: { kind: "field_equals", field: "x" } as unknown, // missing value
        }),
      ],
      ctx(),
    );
    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, "bad_filter_predicate");
  });
});

describe("validateSubscriptions — multiple independent issues per call", () => {
  test("one subscription with multiple independent issues surfaces them all", () => {
    const issues = validateSubscriptions(
      [
        sub({
          event: "crm:fake.event",
          handler: "notExported",
          // Unrecognized root (not envelope, not `data.`) — fires
          // regardless of whether the event is known. The `data.*`
          // walk is intentionally skipped for unknown events to
          // avoid cascading false positives.
          idempotency_key: "{{random.root}}",
          filter: { kind: "weird_kind" } as unknown,
        }),
      ],
      ctx(),
    );
    const codes = issues.map((i) => i.code).sort();
    assert.deepEqual(codes, [
      "bad_filter_predicate",
      "bad_idempotency_key",
      "unknown_event",
      "unknown_handler",
    ]);
    // All issues carry index=0 (same subscription).
    assert.ok(issues.every((i) => i.index === 0));
  });

  test("two subscriptions, each flagged independently, carry correct indexes", () => {
    const issues = validateSubscriptions(
      [
        sub({ event: "crm:fake.a", handler: "onContactCreate" }), // unknown_event
        sub({ event: "crm:contact.created", handler: "nope" }), // unknown_handler
      ],
      ctx(),
    );
    assert.equal(issues.length, 2);
    const firstIdx = issues.find((i) => i.code === "unknown_event");
    const secondIdx = issues.find((i) => i.code === "unknown_handler");
    assert.equal(firstIdx?.index, 0);
    assert.equal(secondIdx?.index, 1);
  });
});
