import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runStatelessAgentTurn } from "../../../src/lib/agents/stateless-turn";
import type { AgentBlueprint } from "../../../src/db/schema/agents";

// Minimal fake Anthropic client: records create() params, replies end_turn.
function makeFakeClient() {
  const calls: Array<{ model: string; max_tokens: number }> = [];
  const client = {
    messages: {
      create: async (params: { model: string; max_tokens: number }) => {
        calls.push({ model: params.model, max_tokens: params.max_tokens });
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "hi" }],
        };
      },
    },
  };
  return { client: client as never, calls };
}

const blueprint = {
  greeting: "hi",
  capabilities: [],
  faq: [],
} as unknown as AgentBlueprint;

const baseInput = {
  orgId: "org-1",
  orgSlug: "org",
  orgName: "Org",
  soul: null,
  timezone: "UTC",
  blueprint,
  messages: [{ role: "user" as const, content: "hello" }],
  testMode: true,
};

describe("stateless-turn overrides", () => {
  it("uses the override model + max_tokens on every create call", async () => {
    const { client, calls } = makeFakeClient();
    const result = await runStatelessAgentTurn({
      ...baseInput,
      client,
      modelOverride: "claude-3-5-haiku-20241022",
      maxTokensOverride: 400,
    });
    assert.equal(result.ok, true);
    assert.ok(calls.length >= 1);
    for (const c of calls) {
      assert.equal(c.model, "claude-3-5-haiku-20241022");
      assert.equal(c.max_tokens, 400);
    }
  });

  it("keeps today's defaults when overrides are absent", async () => {
    const { client, calls } = makeFakeClient();
    const result = await runStatelessAgentTurn({ ...baseInput, client });
    assert.equal(result.ok, true);
    assert.equal(calls[0].max_tokens, 1024);
    assert.notEqual(calls[0].model, "claude-3-5-haiku-20241022");
  });
});
