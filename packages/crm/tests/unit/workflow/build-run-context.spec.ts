// resolveCustomer tests — the function takes the triggerPayload + a
// minimal db handle (we mock it with a stub) and produces the
// canonical RunContextCustomer.
//
// Rules:
// - Prefer trigger payload's name fields over contact row's stale
//   firstName.
// - Phone normalized to E.164.
// - Email lowercased + trimmed.
// - When data is nested under `data` (form.submitted shape), look there.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveCustomerFromTriggerPayload } from "../../../src/lib/workflow/build-run-context";

describe("resolveCustomerFromTriggerPayload", () => {
  test("uses fullName from data.fullName + contactId from data.contactId", () => {
    const payload = {
      data: { fullName: "Alice Liddell", email: "alice@example.com", phone: "4505161803" },
      contactId: "c-1",
    };
    const c = resolveCustomerFromTriggerPayload(payload);
    assert.equal(c.firstName, "Alice");
    assert.equal(c.lastName, "Liddell");
    assert.equal(c.email, "alice@example.com");
    assert.equal(c.phone, "+14505161803");
    assert.equal(c.contactId, "c-1");
  });

  test("uses top-level contactId when present", () => {
    const payload = { data: { fullName: "Bob" }, contactId: "c-top" };
    const c = resolveCustomerFromTriggerPayload(payload);
    assert.equal(c.contactId, "c-top");
  });

  test("falls back to data.contactId when top-level absent", () => {
    const payload = { data: { fullName: "Bob", contactId: "c-nested" } };
    const c = resolveCustomerFromTriggerPayload(payload);
    assert.equal(c.contactId, "c-nested");
  });

  test("normalizes phone to E.164 (assumes US for 10-digit)", () => {
    const c = resolveCustomerFromTriggerPayload({
      data: { fullName: "Carol", phone: "4505161803" },
      contactId: "c-3",
    });
    assert.equal(c.phone, "+14505161803");
  });

  test("preserves already-E164 phone", () => {
    const c = resolveCustomerFromTriggerPayload({
      data: { fullName: "Dave", phone: "+14505161803" },
      contactId: "c-4",
    });
    assert.equal(c.phone, "+14505161803");
  });

  test("splits multi-word fullName into firstName + lastName", () => {
    const c = resolveCustomerFromTriggerPayload({
      data: { fullName: "Anne-Marie de la Cruz" },
      contactId: "c-5",
    });
    assert.equal(c.firstName, "Anne-Marie");
    assert.equal(c.lastName, "de la Cruz");
  });

  test("uses firstName directly if no fullName", () => {
    const c = resolveCustomerFromTriggerPayload({
      data: { firstName: "Eve" },
      contactId: "c-6",
    });
    assert.equal(c.firstName, "Eve");
    assert.equal(c.lastName, null);
  });

  test("empty payload returns empty-string firstName + null lastName", () => {
    const c = resolveCustomerFromTriggerPayload({ contactId: "c-7" });
    assert.equal(c.firstName, "");
    assert.equal(c.lastName, null);
    assert.equal(c.email, null);
  });
});
