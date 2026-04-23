// Tests for SubscriptionEntrySchema + supporting schemas from
// lib/blocks/contract-v2.ts (SLICE 1 PR 1 M1).
//
// Covers: FullyQualifiedEventSchema, SubscriptionDeliveryStatusSchema,
// RetryPolicySchema, HandlerNameSchema, SubscriptionEntrySchema.
// Parser + cross-registry validation land in M2 / M3.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  FullyQualifiedEventSchema,
  HandlerNameSchema,
  RetryPolicySchema,
  SubscriptionDeliveryStatusSchema,
  SubscriptionEntrySchema,
} from "../../src/lib/blocks/contract-v2";

describe("FullyQualifiedEventSchema (G-1)", () => {
  test("accepts <block-slug>:<event.name>", () => {
    assert.ok(FullyQualifiedEventSchema.safeParse("caldiy-booking:booking.created").success);
    assert.ok(FullyQualifiedEventSchema.safeParse("crm:contact.created").success);
    assert.ok(FullyQualifiedEventSchema.safeParse("formbricks-intake:form.submitted").success);
  });

  test("accepts multi-segment event names", () => {
    assert.ok(
      FullyQualifiedEventSchema.safeParse("email:conversation.turn.received").success,
    );
  });

  test("rejects unqualified event names (no block-slug prefix)", () => {
    assert.ok(!FullyQualifiedEventSchema.safeParse("booking.created").success);
  });

  test("rejects missing colon separator", () => {
    assert.ok(!FullyQualifiedEventSchema.safeParse("caldiy-booking.booking.created").success);
  });

  test("rejects uppercase block-slug", () => {
    assert.ok(!FullyQualifiedEventSchema.safeParse("CaldiyBooking:booking.created").success);
  });

  test("rejects single-segment event name after the colon", () => {
    assert.ok(!FullyQualifiedEventSchema.safeParse("crm:created").success);
  });
});

describe("SubscriptionDeliveryStatusSchema (G-6)", () => {
  test("accepts all six states including 'filtered'", () => {
    for (const state of ["pending", "in_flight", "delivered", "failed", "filtered", "dead"]) {
      assert.ok(SubscriptionDeliveryStatusSchema.safeParse(state).success, `state=${state}`);
    }
  });

  test("'filtered' is a distinct terminal state, not collapsed", () => {
    // Compile-time guarantee via type: SubscriptionDeliveryStatus
    // union includes "filtered" and it's not "delivered"/"failed".
    // Runtime anchor:
    const filtered = SubscriptionDeliveryStatusSchema.parse("filtered");
    assert.equal(filtered, "filtered");
    assert.notEqual(filtered, "delivered");
    assert.notEqual(filtered, "failed");
  });

  test("rejects unknown states", () => {
    assert.ok(!SubscriptionDeliveryStatusSchema.safeParse("skipped").success);
    assert.ok(!SubscriptionDeliveryStatusSchema.safeParse("PENDING").success);
  });
});

describe("RetryPolicySchema", () => {
  test("accepts full policy with all fields", () => {
    const result = RetryPolicySchema.safeParse({
      max: 5,
      backoff: "linear",
      initial_delay_ms: 2000,
    });
    assert.ok(result.success);
    assert.equal(result.data?.max, 5);
    assert.equal(result.data?.backoff, "linear");
    assert.equal(result.data?.initial_delay_ms, 2000);
  });

  test("applies defaults when fields omitted", () => {
    const result = RetryPolicySchema.safeParse({});
    assert.ok(result.success);
    assert.equal(result.data?.max, 3);
    assert.equal(result.data?.backoff, "exponential");
    assert.equal(result.data?.initial_delay_ms, 1000);
  });

  test("rejects max above the ceiling of 10", () => {
    assert.ok(!RetryPolicySchema.safeParse({ max: 11 }).success);
    assert.ok(!RetryPolicySchema.safeParse({ max: 100 }).success);
  });

  test("rejects max = 0 or negative", () => {
    assert.ok(!RetryPolicySchema.safeParse({ max: 0 }).success);
    assert.ok(!RetryPolicySchema.safeParse({ max: -1 }).success);
  });

  test("rejects unknown backoff kind", () => {
    assert.ok(!RetryPolicySchema.safeParse({ backoff: "cubic" }).success);
  });
});

describe("HandlerNameSchema", () => {
  test("accepts lowerCamelCase identifiers", () => {
    assert.ok(HandlerNameSchema.safeParse("logActivityOnBookingCreate").success);
    assert.ok(HandlerNameSchema.safeParse("handleFormSubmit").success);
    assert.ok(HandlerNameSchema.safeParse("x").success);
  });

  test("rejects names starting with uppercase", () => {
    assert.ok(!HandlerNameSchema.safeParse("LogActivity").success);
  });

  test("rejects names with hyphens or dots", () => {
    assert.ok(!HandlerNameSchema.safeParse("log-activity").success);
    assert.ok(!HandlerNameSchema.safeParse("log.activity").success);
  });

  test("rejects names starting with a digit", () => {
    assert.ok(!HandlerNameSchema.safeParse("1handler").success);
  });
});

describe("SubscriptionEntrySchema — composition (G-1 + G-3)", () => {
  test("accepts minimal valid entry; applies idempotency + retry defaults", () => {
    const result = SubscriptionEntrySchema.safeParse({
      event: "caldiy-booking:booking.created",
      handler: "onBookingCreate",
    });
    assert.ok(result.success, JSON.stringify(result));
    assert.equal(result.data?.idempotency_key, "{{id}}", "G-3 default applied");
    assert.equal(result.data?.retry.max, 3);
    assert.equal(result.data?.retry.backoff, "exponential");
    assert.equal(result.data?.retry.initial_delay_ms, 1000);
  });

  test("accepts full entry with custom idempotency_key + retry + filter", () => {
    const result = SubscriptionEntrySchema.safeParse({
      event: "formbricks-intake:form.submitted",
      handler: "createContactFromForm",
      idempotency_key: "{{data.contactId}}:{{data.formId}}",
      retry: { max: 5, backoff: "exponential", initial_delay_ms: 2000 },
      filter: { kind: "field_exists", field: "data.contactId" },
    });
    assert.ok(result.success);
    assert.equal(result.data?.idempotency_key, "{{data.contactId}}:{{data.formId}}");
    assert.equal(result.data?.retry.max, 5);
    // Filter kept as-is (unknown); M3 validator parses it against
    // PredicateSchema.
    assert.deepEqual(result.data?.filter, { kind: "field_exists", field: "data.contactId" });
  });

  test("rejects entry missing event", () => {
    assert.ok(
      !SubscriptionEntrySchema.safeParse({ handler: "onSomething" }).success,
    );
  });

  test("rejects entry missing handler", () => {
    assert.ok(
      !SubscriptionEntrySchema.safeParse({ event: "crm:contact.created" }).success,
    );
  });

  test("rejects unqualified event (G-1)", () => {
    assert.ok(
      !SubscriptionEntrySchema.safeParse({
        event: "booking.created", // no block-slug prefix
        handler: "onBookingCreate",
      }).success,
    );
  });

  test("empty idempotency_key is rejected (G-3 no silent non-idempotent)", () => {
    const result = SubscriptionEntrySchema.safeParse({
      event: "crm:contact.created",
      handler: "onContactCreate",
      idempotency_key: "",
    });
    assert.ok(!result.success);
  });

  test("partial retry applies per-field defaults", () => {
    const result = SubscriptionEntrySchema.safeParse({
      event: "crm:contact.created",
      handler: "onContactCreate",
      retry: { max: 5 },
    });
    assert.ok(result.success);
    assert.equal(result.data?.retry.max, 5);
    assert.equal(result.data?.retry.backoff, "exponential");
    assert.equal(result.data?.retry.initial_delay_ms, 1000);
  });
});
