// Voice tool bridge — adapts the existing text-chatbot AgentTool registry
// into OpenAI Realtime's function-calling wire format and executes a single
// tool call safely.
//
// This is the one piece valid in every voice architecture (direct-SIP or
// LiveKit-middleware, Fluid Compute or dedicated worker): convert our tools
// to Realtime format + run one tool call without throwing.
//
// PATTERN NOTE: this codebase prefers dependency-injection over node:test
// mock.module / mock.method because tsx's CJS interop puts named exports
// behind a `default` namespace, making module mocking unreliable (see
// billing/has-feature.spec.ts, agency-profile/save.spec.ts). So
// executeVoiceToolCall takes an optional { findTool } dep — the unknown-tool
// and throwing-tool cases inject a fake registry; the happy path uses the
// REAL book_appointment tool in testMode (synthetic, no DB writes).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { z } from "zod";

import {
  toRealtimeFunctionTools,
  executeVoiceToolCall,
} from "../../../../src/lib/agents/voice/realtime-tools";
import {
  ALL_TOOLS,
  bookAppointment,
  lookUpAvailability,
  type AgentTool,
  type ToolExecuteContext,
} from "../../../../src/lib/agents/tools";

// A ToolExecuteContext with testMode ON — book_appointment short-circuits to
// a synthetic { ok: true, testMode: true } response without touching the DB.
const TEST_CTX: ToolExecuteContext = {
  orgId: "org-test",
  orgSlug: "acme",
  agentId: "agt-test",
  conversationId: "conv-test",
  testMode: true,
};

// ─── toRealtimeFunctionTools ────────────────────────────────────────────────

describe("toRealtimeFunctionTools — wire shape", () => {
  test("converts every tool to { type:'function', name, description, parameters }", () => {
    const wire = toRealtimeFunctionTools(ALL_TOOLS);
    assert.equal(wire.length, ALL_TOOLS.length);
    for (let i = 0; i < wire.length; i += 1) {
      const w = wire[i]!;
      const src = ALL_TOOLS[i]!;
      assert.equal(w.type, "function", `tool ${src.name} must have type 'function'`);
      assert.equal(w.name, src.name);
      assert.equal(w.description, src.description);
      // parameters is the tool's pre-computed JSON Schema, passed through
      // verbatim (NOT hand-rolled) — same object the text runtime feeds to
      // Anthropic's input_schema.
      assert.deepEqual(w.parameters, src.jsonSchema);
    }
  });

  test("book_appointment parameters is a valid JSON Schema object with required fields", () => {
    const [wire] = toRealtimeFunctionTools([bookAppointment as AgentTool]);
    assert.ok(wire, "expected a converted tool");
    assert.equal(wire.type, "function");
    assert.equal(wire.name, "book_appointment");
    const params = wire.parameters as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    assert.equal(params.type, "object", "parameters.type should be 'object'");
    assert.ok(params.properties, "parameters.properties should exist");
    assert.ok(params.properties!.fullName, "expected a fullName property");
    assert.ok(params.properties!.email, "expected an email property");
    assert.ok(params.properties!.slotIso, "expected a slotIso property");
    assert.deepEqual(
      params.required,
      ["fullName", "email", "slotIso"],
      "book_appointment requires fullName + email + slotIso",
    );
  });

  test("look_up_availability parameters carries the date required field", () => {
    const [wire] = toRealtimeFunctionTools([lookUpAvailability as AgentTool]);
    assert.ok(wire);
    assert.equal(wire.name, "look_up_availability");
    const params = wire.parameters as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    assert.equal(params.type, "object");
    assert.ok(params.properties!.date, "expected a date property");
    assert.deepEqual(params.required, ["date"]);
  });

  test("does not mutate the source tool's jsonSchema (passes a stable reference/clone)", () => {
    const before = JSON.stringify(bookAppointment.jsonSchema);
    toRealtimeFunctionTools([bookAppointment as AgentTool]);
    assert.equal(JSON.stringify(bookAppointment.jsonSchema), before);
  });

  test("empty input yields empty output (pure, total)", () => {
    assert.deepEqual(toRealtimeFunctionTools([]), []);
  });
});

// ─── executeVoiceToolCall — happy path ──────────────────────────────────────

describe("executeVoiceToolCall — valid args route to the right tool", () => {
  test("valid book_appointment args (testMode) → { ok: true }", async () => {
    const result = await executeVoiceToolCall({
      name: "book_appointment",
      argumentsJson: JSON.stringify({
        fullName: "Jane Doe",
        email: "jane@acme.co",
        slotIso: "2026-06-02T16:00:00Z",
      }),
      ctx: TEST_CTX,
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      // testMode book_appointment returns { ok: true, testMode: true, bookingId }
      const out = result.result as { ok?: boolean; testMode?: boolean };
      assert.equal(out.ok, true);
      assert.equal(out.testMode, true);
      // The bridge also surfaces a ready-to-serialize string output for the
      // Realtime function_call_output item.
      assert.equal(typeof result.output, "string");
      assert.deepEqual(JSON.parse(result.output), result.result);
    }
  });

  test("passes the PARSED object (not the raw string) to the tool's execute", async () => {
    let received: unknown;
    const fakeTool: AgentTool = {
      name: "spy_tool",
      description: "captures its parsed input",
      inputSchema: z.object({ a: z.number(), b: z.string() }),
      jsonSchema: { type: "object" },
      execute: async (input) => {
        received = input;
        return { ok: true };
      },
    };
    const result = await executeVoiceToolCall({
      name: "spy_tool",
      argumentsJson: '{"a":1,"b":"hi"}',
      ctx: TEST_CTX,
      deps: { findTool: (n) => (n === "spy_tool" ? fakeTool : undefined) },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(received, { a: 1, b: "hi" });
  });

  test("empty-arguments string ('') is treated as no-arg call ({})", async () => {
    // OpenAI Realtime hands back "" for a zero-parameter function call.
    let received: unknown = "UNSET";
    const fakeTool: AgentTool = {
      name: "noarg_tool",
      description: "takes nothing",
      inputSchema: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      execute: async (input) => {
        received = input;
        return { done: true };
      },
    };
    const result = await executeVoiceToolCall({
      name: "noarg_tool",
      argumentsJson: "",
      ctx: TEST_CTX,
      deps: { findTool: (n) => (n === "noarg_tool" ? fakeTool : undefined) },
    });
    assert.equal(result.ok, true);
    assert.deepEqual(received, {});
  });
});

// ─── executeVoiceToolCall — failure paths (never throw) ──────────────────────

describe("executeVoiceToolCall — malformed JSON arguments", () => {
  test("malformed JSON → { ok: false, error }, does not throw", async () => {
    const result = await executeVoiceToolCall({
      name: "book_appointment",
      argumentsJson: "{ this is not json",
      ctx: TEST_CTX,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(typeof result.error, "string");
      assert.match(result.error, /json|parse/i);
    }
  });

  test("argument JSON that isn't an object (e.g. a bare number) → { ok: false }", async () => {
    const result = await executeVoiceToolCall({
      name: "book_appointment",
      argumentsJson: "42",
      ctx: TEST_CTX,
    });
    assert.equal(result.ok, false);
  });
});

describe("executeVoiceToolCall — unknown tool", () => {
  test("unknown tool name → { ok: false, error: 'unknown_tool' }", async () => {
    const result = await executeVoiceToolCall({
      name: "definitely_not_a_real_tool",
      argumentsJson: "{}",
      ctx: TEST_CTX,
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "unknown_tool");
    }
  });
});

describe("executeVoiceToolCall — input validation", () => {
  test("args that fail the tool's zod schema → { ok: false } (no execute, no throw)", async () => {
    let executed = false;
    const fakeTool: AgentTool = {
      name: "strict_tool",
      description: "requires a number",
      inputSchema: z.object({ n: z.number() }),
      jsonSchema: { type: "object" },
      execute: async () => {
        executed = true;
        return { ok: true };
      },
    };
    const result = await executeVoiceToolCall({
      name: "strict_tool",
      argumentsJson: '{"n":"not-a-number"}',
      ctx: TEST_CTX,
      deps: { findTool: (n) => (n === "strict_tool" ? fakeTool : undefined) },
    });
    assert.equal(result.ok, false);
    assert.equal(executed, false, "must not execute when input validation fails");
  });
});

describe("executeVoiceToolCall — tool throws", () => {
  test("tool execute() throwing is caught → { ok: false }, no rethrow", async () => {
    const throwingTool: AgentTool = {
      name: "boom_tool",
      description: "always throws",
      inputSchema: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      execute: async () => {
        throw new Error("kaboom");
      },
    };
    const result = await executeVoiceToolCall({
      name: "boom_tool",
      argumentsJson: "{}",
      ctx: TEST_CTX,
      deps: { findTool: (n) => (n === "boom_tool" ? throwingTool : undefined) },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.error, /kaboom/);
    }
  });

  test("tool that throws a non-Error value is still caught → { ok: false }", async () => {
    const throwingTool: AgentTool = {
      name: "weird_throw_tool",
      description: "throws a string",
      inputSchema: z.object({}),
      jsonSchema: { type: "object", properties: {} },
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      execute: async () => {
        throw "just a string";
      },
    };
    const result = await executeVoiceToolCall({
      name: "weird_throw_tool",
      argumentsJson: "{}",
      ctx: TEST_CTX,
      deps: { findTool: (n) => (n === "weird_throw_tool" ? throwingTool : undefined) },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(typeof result.error, "string");
    }
  });
});
