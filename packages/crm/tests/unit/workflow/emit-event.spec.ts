// Tests for the emit_event dispatcher + Zod schema + registry
// cross-check. SLICE 3 C3 per audit §3.3 + G-3-2 (restricted-shape
// with registry cross-check at parse time; runtime type-check at
// emit time for values known only at runtime).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../../src/lib/agents/validator";
import { dispatchEmitEvent } from "../../../src/lib/workflow/step-dispatchers/emit-event";
import type { RuntimeContext, StoredRun } from "../../../src/lib/workflow/types";
import { notImplementedToolInvoker } from "../../../src/lib/workflow/types";
import type { AgentSpec } from "../../../src/lib/agents/validator";
import { InMemoryRuntimeStorage } from "./storage-memory";

type EventEmitter = (
  type: string,
  data: Record<string, unknown>,
  options: { orgId: string },
) => Promise<void>;

function makeContext(emitSpy: EventEmitter): RuntimeContext & { emitSeldonEvent: EventEmitter } {
  return {
    storage: new InMemoryRuntimeStorage(),
    invokeTool: notImplementedToolInvoker,
    now: () => new Date("2026-04-23T12:00:00Z"),
    emitSeldonEvent: emitSpy,
  };
}

function makeRun(overrides: Partial<StoredRun> = {}): StoredRun {
  return {
    id: "run-1",
    orgId: "org-1",
    archetypeId: "test",
    specSnapshot: {} as AgentSpec,
    triggerEventId: null,
    triggerPayload: {},
    status: "running",
    currentStepId: "e1",
    captureScope: {},
    variableScope: {},
    failureCount: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Fixture event registry — contact.created (1 string field) +
// a broader event with mixed types for type-check coverage.
function fixtureRegistry(): EventRegistry {
  return {
    events: [
      {
        type: "contact.created",
        fields: { contactId: { rawType: "string", nullable: false } },
      },
      {
        type: "score.submitted",
        fields: {
          scoreId: { rawType: "string", nullable: false },
          rating: { rawType: "number", nullable: false },
          comment: { rawType: "string", nullable: true },
        },
      },
    ],
  };
}
function emptyBlockRegistry(): BlockRegistry {
  return { tools: new Map(), producesByBlock: new Map() };
}

describe("emit_event — validateAgentSpec cross-check (G-3-2)", () => {
  test("accepts emit_event with event in registry + matching data keys", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          {
            id: "e1",
            type: "emit_event",
            event: "score.submitted",
            data: { scoreId: "s-1", rating: 5, comment: "great" },
            next: null,
          },
        ],
      },
      emptyBlockRegistry(),
      fixtureRegistry(),
    );
    assert.deepEqual(issues, []);
  });

  test("rejects unknown event with unknown_event", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          {
            id: "e1",
            type: "emit_event",
            event: "not.a.real.event",
            data: {},
            next: null,
          },
        ],
      },
      emptyBlockRegistry(),
      fixtureRegistry(),
    );
    assert.ok(
      issues.some((i) => i.code === "unknown_event" && i.stepId === "e1"),
      "unknown event must surface unknown_event",
    );
  });

  test("rejects data key not declared on the event (spec_malformed)", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          {
            id: "e1",
            type: "emit_event",
            event: "contact.created",
            data: { contactId: "c-1", madeUpField: "huh" },
            next: null,
          },
        ],
      },
      emptyBlockRegistry(),
      fixtureRegistry(),
    );
    assert.ok(
      issues.some(
        (i) =>
          i.code === "spec_malformed" &&
          /madeUpField/.test(i.message),
      ),
      "unknown data key must be rejected with field name in message",
    );
  });

  test("rejects non-interpolated literal value with wrong primitive type", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          {
            id: "e1",
            type: "emit_event",
            event: "score.submitted",
            data: { scoreId: "s-1", rating: "not-a-number" },
            next: null,
          },
        ],
      },
      emptyBlockRegistry(),
      fixtureRegistry(),
    );
    assert.ok(
      issues.some(
        (i) => i.code === "spec_malformed" && /rating/.test(i.path),
      ),
      "literal type mismatch must surface spec_malformed",
    );
  });

  test("accepts interpolated values (pass parse as strings)", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          {
            id: "e1",
            type: "emit_event",
            event: "score.submitted",
            data: {
              scoreId: "{{capture.scoreId}}",
              rating: "{{capture.rating}}",
            },
            next: null,
          },
        ],
      },
      emptyBlockRegistry(),
      fixtureRegistry(),
    );
    // Interpolation tokens accepted at parse — runtime will do the
    // type-check once resolved.
    assert.deepEqual(issues, []);
  });
});

describe("dispatchEmitEvent — happy path", () => {
  test("resolves interpolations + calls emitSeldonEvent with orgId", async () => {
    const calls: Array<{ type: string; data: Record<string, unknown>; options: { orgId: string } }> = [];
    const emit: EventEmitter = async (type, data, options) => {
      calls.push({ type, data, options });
    };
    const context = makeContext(emit);
    const run = makeRun({
      captureScope: { score: { id: "s-1", rating: 5 } },
    });

    const result = await dispatchEmitEvent(
      run,
      {
        id: "e1",
        type: "emit_event",
        event: "score.submitted",
        data: {
          scoreId: "{{score.id}}",
          rating: "{{score.rating}}",
        },
        next: "next_step",
      },
      context,
    );

    assert.equal(result.kind, "advance");
    if (result.kind !== "advance") return;
    assert.equal(result.next, "next_step");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].type, "score.submitted");
    assert.deepEqual(calls[0].data, { scoreId: "s-1", rating: "5" });
    assert.equal(calls[0].options.orgId, "org-1");
  });
});

describe("dispatchEmitEvent — missing emitter wiring", () => {
  test("missing context.emitSeldonEvent → fail", async () => {
    const context: RuntimeContext = {
      storage: new InMemoryRuntimeStorage(),
      invokeTool: notImplementedToolInvoker,
      now: () => new Date(),
    };
    const result = await dispatchEmitEvent(
      makeRun(),
      {
        id: "e1",
        type: "emit_event",
        event: "contact.created",
        data: { contactId: "c-1" },
        next: null,
      },
      context,
    );
    assert.equal(result.kind, "fail");
    if (result.kind !== "fail") return;
    assert.match(result.reason, /emitSeldonEvent/);
  });
});

describe("dispatchEmitEvent — emitter throws", () => {
  test("emitSeldonEvent throw → fail NextAction", async () => {
    const emit: EventEmitter = async () => {
      throw new Error("bus down");
    };
    const context = makeContext(emit);
    const result = await dispatchEmitEvent(
      makeRun(),
      {
        id: "e1",
        type: "emit_event",
        event: "contact.created",
        data: { contactId: "c-1" },
        next: null,
      },
      context,
    );
    assert.equal(result.kind, "fail");
    if (result.kind !== "fail") return;
    assert.match(result.reason, /bus down/);
  });
});
