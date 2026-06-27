// ICP-3 — runtime WIRING test: the selected per-turn model is actually threaded
// into the Anthropic call.
//
// Driven through `runStatelessAgentTurn` (the DB-free path that injects the
// Anthropic client) with a CAPTURING fake client, so we read `req.model` off the
// exact request the loop sends. This proves the adaptive selection reaches the
// live call, not just the pure unit. It also covers the fail-soft contract: with
// the kill switch on, the cheap default is threaded even on a hard turn.

import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  runStatelessAgentTurn,
  type RunStatelessAgentTurnInput,
} from "../../../../src/lib/agents/stateless-turn";
import type { AgentBlueprint } from "../../../../src/db/schema/agents";

const DEFAULT = "claude-sonnet-4-5-20250929";
const PREMIUM = "claude-sonnet-4-6";

type FakeResponse = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: unknown }
  >;
  stop_reason: string;
};

function makeCapturingClient(responses: FakeResponse[]) {
  const requests: Array<Record<string, unknown>> = [];
  let i = 0;
  const client = {
    messages: {
      create: async (req: Record<string, unknown>) => {
        requests.push(req);
        const res = responses[i] ?? responses[responses.length - 1];
        i += 1;
        return res as unknown;
      },
    },
  };
  return { client: client as unknown as RunStatelessAgentTurnInput["client"], requests };
}

function baseInput(
  over: Partial<RunStatelessAgentTurnInput>,
  blueprintOver: Partial<AgentBlueprint> = {},
): RunStatelessAgentTurnInput {
  const blueprint: AgentBlueprint = {
    archetype: "voice-receptionist",
    capabilities: ["look_up_availability"],
    greeting: "Hi",
    ...blueprintOver,
  };
  return {
    orgId: "org-1",
    orgSlug: "acme",
    orgName: "Acme Plumbing",
    soul: null,
    timezone: "America/New_York",
    blueprint,
    messages: [{ role: "user", content: "what are your hours?" }],
    testMode: true,
    client: makeCapturingClient([
      { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" },
    ]).client,
    now: new Date("2026-06-20T12:00:00Z"),
    ...over,
  };
}

const ORIG_OFF = process.env.SF_ADAPTIVE_RUNTIME_MODEL;
afterEach(() => {
  if (ORIG_OFF === undefined) delete process.env.SF_ADAPTIVE_RUNTIME_MODEL;
  else process.env.SF_ADAPTIVE_RUNTIME_MODEL = ORIG_OFF;
});

describe("runStatelessAgentTurn — adaptive model is threaded into the call", () => {
  test("easy turn (read-only tool, simple question) → default model on the request", async () => {
    delete process.env.SF_ADAPTIVE_RUNTIME_MODEL;
    const fake = makeCapturingClient([
      { content: [{ type: "text", text: "We're open 9-5." }], stop_reason: "end_turn" },
    ]);
    await runStatelessAgentTurn(
      baseInput({
        client: fake.client,
        messages: [{ role: "user", content: "what are your hours?" }],
      }),
    );
    assert.equal(fake.requests.length, 1);
    assert.equal(fake.requests[0].model, DEFAULT, "easy turn stays on the cheap default");
  });

  test("hard turn (booking intent + book tool available) → premium model on the request", async () => {
    delete process.env.SF_ADAPTIVE_RUNTIME_MODEL;
    const fake = makeCapturingClient([
      { content: [{ type: "text", text: "Sure — what day?" }], stop_reason: "end_turn" },
    ]);
    await runStatelessAgentTurn(
      baseInput(
        {
          client: fake.client,
          messages: [{ role: "user", content: "I'd like to book an appointment" }],
        },
        { capabilities: ["look_up_availability", "book_appointment"] },
      ),
    );
    assert.equal(fake.requests.length, 1);
    assert.equal(fake.requests[0].model, PREMIUM, "hard turn escalates to premium");
  });

  test("kill switch (SF_ADAPTIVE_RUNTIME_MODEL=off) → default even on a hard turn", async () => {
    process.env.SF_ADAPTIVE_RUNTIME_MODEL = "off";
    const fake = makeCapturingClient([
      { content: [{ type: "text", text: "Sure — what day?" }], stop_reason: "end_turn" },
    ]);
    await runStatelessAgentTurn(
      baseInput(
        {
          client: fake.client,
          messages: [{ role: "user", content: "cancel my booking, this is urgent" }],
        },
        { capabilities: ["look_up_availability", "book_appointment"] },
      ),
    );
    assert.equal(fake.requests[0].model, DEFAULT, "kill switch forces the default model");
  });

  test("recovery iteration after a tool error escalates to premium", async () => {
    delete process.env.SF_ADAPTIVE_RUNTIME_MODEL;
    // Turn 1: model calls book_appointment with bad input (schema reject → error
    // tool_result). Turn 2 (recovery): model writes text. We assert the SECOND
    // request used the premium model because priorToolError was set.
    const fake = makeCapturingClient([
      {
        content: [
          { type: "tool_use", id: "tu_bad", name: "book_appointment", input: { fullName: "X" } },
        ],
        stop_reason: "tool_use",
      },
      { content: [{ type: "text", text: "Let me get a few more details." }], stop_reason: "end_turn" },
    ]);
    await runStatelessAgentTurn(
      baseInput(
        {
          client: fake.client,
          // Use an easy message so the FIRST request's escalation is driven by the
          // available write tool, and the SECOND by priorToolError — both premium,
          // but we specifically assert the recovery path threads premium.
          messages: [{ role: "user", content: "ok" }],
        },
        { capabilities: ["book_appointment"] },
      ),
    );
    assert.equal(fake.requests.length, 2, "tool round-trip → two model calls");
    assert.equal(
      fake.requests[1].model,
      PREMIUM,
      "the recovery iteration after a tool error uses premium",
    );
  });
});
