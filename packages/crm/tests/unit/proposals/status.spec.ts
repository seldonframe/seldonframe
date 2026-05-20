// packages/crm/tests/unit/proposals/status.spec.ts
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, assertTransition } from "@/lib/proposals/status";

describe("canTransition", () => {
  test("allows draft → sent", () => {
    assert.equal(canTransition("draft", "sent"), true);
  });

  test("allows sent → viewed", () => {
    assert.equal(canTransition("sent", "viewed"), true);
  });

  test("allows viewed → accepted", () => {
    assert.equal(canTransition("viewed", "accepted"), true);
  });

  test("allows viewed → declined", () => {
    assert.equal(canTransition("viewed", "declined"), true);
  });

  test("allows sent → expired", () => {
    assert.equal(canTransition("sent", "expired"), true);
  });

  test("forbids draft → accepted (must be sent first)", () => {
    assert.equal(canTransition("draft", "accepted"), false);
  });

  test("forbids accepted → declined (terminal)", () => {
    assert.equal(canTransition("accepted", "declined"), false);
  });

  test("forbids same-state transition", () => {
    assert.equal(canTransition("sent", "sent"), false);
  });
});

describe("assertTransition", () => {
  test("throws on invalid transition", () => {
    assert.throws(
      () => assertTransition("accepted", "declined"),
      { message: "Invalid proposal status transition: accepted → declined" },
    );
  });

  test("does not throw on valid transition", () => {
    assert.doesNotThrow(() => assertTransition("draft", "sent"));
  });
});
