// Deterministic replay — Reelier phase 2c slice 1 (OBSERVE MODE ONLY).
//
// runStatelessAgentTurn's `wrapToolCall` DI hook: an optional seam a caller
// (composio-event-dispatch-deps.ts, only when SF_DETERMINISTIC_REPLAY=1) uses
// to observe each tool execute() call. Two invariants under test:
//   1. Absent (every existing caller) → the identical unwrapped path runs,
//      byte-for-byte the same result as before this hook existed.
//   2. Present → it receives (tool name, parsed args, run) and its
//      resolved/thrown outcome flows through unchanged to the turn loop.
//
// Mirrors tests/unit/agent-templates/stateless-turn.spec.ts's fake-client
// harness and its book_appointment tool-call fixture exactly.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runStatelessAgentTurn,
  type RunStatelessAgentTurnInput,
} from "../../../src/lib/agents/stateless-turn";
import type { AgentBlueprint } from "../../../src/db/schema/agents";

type FakeResponse = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  stop_reason: string;
};

function makeFakeClient(responses: FakeResponse[]) {
  let i = 0;
  const client = {
    messages: {
      create: async () => {
        const res = responses[i] ?? responses[responses.length - 1];
        i += 1;
        return res as unknown;
      },
    },
  };
  return client as unknown as RunStatelessAgentTurnInput["client"];
}

function baseInput(over: Partial<RunStatelessAgentTurnInput> = {}): RunStatelessAgentTurnInput {
  const blueprint: AgentBlueprint = {
    archetype: "voice-receptionist",
    capabilities: ["look_up_availability", "book_appointment"],
    greeting: "Thanks for calling!",
    faq: [],
    voice: "cedar",
  };
  return {
    orgId: "org-1",
    orgSlug: "acme",
    orgName: "Acme Plumbing",
    soul: null,
    timezone: "America/New_York",
    blueprint,
    messages: [{ role: "user", content: "Book me for the 25th at noon." }],
    testMode: true,
    client: makeFakeClient([
      {
        content: [
          {
            type: "tool_use",
            id: "tu_1",
            name: "book_appointment",
            input: {
              fullName: "Jane Doe",
              phone: "+15551234567",
              slotIso: "2026-06-25T16:00:00Z",
              confirmed: true,
            },
          },
        ],
        stop_reason: "tool_use",
      },
      { content: [{ type: "text", text: "You're all set." }], stop_reason: "end_turn" },
    ]),
    now: new Date("2026-06-20T12:00:00Z"),
    ...over,
  };
}

describe("wrapToolCall — absent (default, every existing caller)", () => {
  test("turn behavior is byte-for-byte unaffected when the hook is not provided", async () => {
    const result = await runStatelessAgentTurn(baseInput());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.reply, "You're all set.");
    assert.equal(result.toolCalls.length, 1);
    assert.equal(result.toolCalls[0].name, "book_appointment");
  });
});

describe("wrapToolCall — present", () => {
  test("is invoked with the tool name + parsed args, and its resolved value drives the turn onward", async () => {
    const calls: Array<{ tool: string; args: unknown }> = [];
    const result = await runStatelessAgentTurn(
      baseInput({
        wrapToolCall: async (tool, args, run) => {
          calls.push({ tool, args });
          return run();
        },
      }),
    );

    assert.equal(result.ok, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool, "book_appointment");
    assert.equal((calls[0].args as { fullName: string }).fullName, "Jane Doe");
  });

  test("a throw from the wrapped run() still reaches the turn's error-recovery path (fed back as a tool error, turn still completes)", async () => {
    const result = await runStatelessAgentTurn(
      baseInput({
        client: makeFakeClient([
          {
            content: [
              { type: "tool_use", id: "tu_1", name: "book_appointment", input: { confirmed: true } },
            ],
            stop_reason: "tool_use",
          },
          { content: [{ type: "text", text: "Sorry, something went wrong." }], stop_reason: "end_turn" },
        ]),
        wrapToolCall: async (_tool, _args, run) => run(),
      }),
    );
    // The turn loop itself never throws — a tool failure is fed back to the
    // model as a tool_result error and the loop continues to end_turn.
    assert.equal(result.ok, true);
  });

  test("wrapToolCall throwing directly (not the wrapped run) surfaces as that tool's failure, never crashes the turn", async () => {
    const result = await runStatelessAgentTurn(
      baseInput({
        wrapToolCall: async () => {
          throw new Error("recorder blew up");
        },
      }),
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.toolCalls.length, 1); // the call was still attempted/recorded
  });
});
