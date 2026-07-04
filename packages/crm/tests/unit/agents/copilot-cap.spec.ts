// Pure surface test for the copilot cap module (TDD, win-ladder P0/Task 3).
// No DB, no network — capResponse() and COPILOT_PERSONA are pure.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { capResponse, COPILOT_PERSONA } from "../../../src/lib/agents/copilot/cap";

describe("capResponse", () => {
  test("returns the exact capped shape for a given limit", () => {
    assert.deepEqual(capResponse(20), {
      kind: "capped",
      used: 20,
      limit: 20,
      upgrade: "/pricing",
    });
  });

  test("used always equals limit, whatever limit is passed", () => {
    assert.deepEqual(capResponse(5), {
      kind: "capped",
      used: 5,
      limit: 5,
      upgrade: "/pricing",
    });
  });
});

describe("COPILOT_PERSONA", () => {
  test("is a non-empty string", () => {
    assert.equal(typeof COPILOT_PERSONA, "string");
    assert.ok(COPILOT_PERSONA.length > 0);
  });

  test("contains the never-lies grounding guard", () => {
    assert.ok(
      COPILOT_PERSONA.includes("only claim what a tool result confirmed") ||
        COPILOT_PERSONA.toLowerCase().includes("only claim what a tool result confirmed"),
    );
  });

  test("contains the confirm-before-destructive instruction", () => {
    assert.ok(COPILOT_PERSONA.toLowerCase().includes("confirm"));
  });

  test("contains the act-then-report instruction", () => {
    assert.ok(COPILOT_PERSONA.toLowerCase().includes("state what changed"));
  });
});
