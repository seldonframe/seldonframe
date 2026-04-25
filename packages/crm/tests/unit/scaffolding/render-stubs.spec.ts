// Tests for the stub renderers — subscription-handler file + test
// file. PR 1 C3 per SLICE 2 audit §3.6 + G-6.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { renderHandlerStub } from "../../../src/lib/scaffolding/render/handler-stub";
import { renderTestStub } from "../../../src/lib/scaffolding/render/test-stub";
import type { BlockSpec } from "../../../src/lib/scaffolding/spec";

function spec(): BlockSpec {
  return {
    slug: "notes",
    title: "Notes",
    description: "test",
    triggerPhrases: [],
    frameworks: ["universal"],
    produces: [{ name: "note.created", fields: [] }],
    consumes: [],
    tools: [
      { name: "create_note", description: "Create a note", args: [], returns: [], emits: ["note.created"] },
      { name: "list_notes", description: "List notes", args: [], returns: [], emits: [] },
    ],
    subscriptions: [
      {
        event: "caldiy-booking:booking.created",
        handlerName: "logNoteOnBookingCreate",
        description: "Log a note when a booking is created for a contact",
        idempotencyKey: "{{id}}",
      },
    ],
    entities: [],
    customer_surfaces: { display: [], actions: [] },
  };
}

describe("renderHandlerStub — subscription handler TypeScript file", () => {
  test("imports handler types + registerSubscriptionHandler", () => {
    const out = renderHandlerStub(spec().subscriptions[0]);
    assert.match(out, /import type \{ SubscriptionEvent, SubscriptionHandler, SubscriptionHandlerContext \}/);
    assert.match(out, /import \{ registerSubscriptionHandler \}/);
  });

  test("exports the handler with its name + registers at module load", () => {
    const out = renderHandlerStub(spec().subscriptions[0]);
    assert.match(out, /export const logNoteOnBookingCreate: SubscriptionHandler = async/);
    assert.match(out, /registerSubscriptionHandler\("logNoteOnBookingCreate", logNoteOnBookingCreate\)/);
  });

  test("handler body is a TODO marker + initial log call", () => {
    const out = renderHandlerStub(spec().subscriptions[0]);
    assert.match(out, /\/\/ TODO \(scaffold-default\): implement the handler/);
    assert.match(out, /ctx\.log\("logNoteOnBookingCreate invoked"/);
  });

  test("header comment references the subscription description", () => {
    const out = renderHandlerStub(spec().subscriptions[0]);
    assert.match(out, /Log a note when a booking is created for a contact/);
  });
});

describe("renderTestStub — test.todo stubs per tool", () => {
  test("describe block names the block slug", () => {
    const out = renderTestStub(spec());
    assert.match(out, /describe\("notes — create_note"/);
    assert.match(out, /describe\("notes — list_notes"/);
  });

  test("one test.todo per tool with descriptive message", () => {
    const out = renderTestStub(spec());
    // Match the call form specifically (not the header comment text).
    const todoCount = (out.match(/test\.todo\(/g) ?? []).length;
    assert.equal(todoCount, 2, "one test.todo per tool");
    assert.match(out, /create_note accepts a valid args shape and returns the expected returns shape/);
    assert.match(out, /TODO: fill using the pattern in packages\/crm\/tests\/unit\/crm-tools\.spec\.ts/);
  });

  test("imports node:test + node:assert", () => {
    const out = renderTestStub(spec());
    assert.match(out, /import \{ describe, test \} from "node:test";/);
    assert.match(out, /import assert from "node:assert\/strict";/);
  });

  test("tools-less block renders a single block-level todo instead of per-tool", () => {
    const emptySpec = { ...spec(), tools: [] };
    const out = renderTestStub(emptySpec);
    // Still produces a valid TS test file with a block-level todo.
    assert.match(out, /describe\("notes — block smoke"/);
    assert.match(out, /test\.todo\(/);
    // No per-tool blocks since there are none.
    assert.ok(!out.includes("create_note"));
  });
});
