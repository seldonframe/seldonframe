// Email-agent slice (Part A2) — runStatelessAgentTurn threads an optional
// `voiceProfileNote` into composeSystemPrompt, for the action-only event/
// schedule turn path (run-event-agent-deps.ts's runActionOnlyTurn). Mirrors
// stateless-turn-overrides.spec.ts's fake-client pattern.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runStatelessAgentTurn } from "../../../src/lib/agents/stateless-turn";
import type { AgentBlueprint } from "../../../src/db/schema/agents";

/** Token economy (2026-07-16): the loop now sends `system` as a cache-marked
 *  block array. Extract the text either way so these assertions stay about the
 *  PROMPT CONTENT, not the wire shape. */
function systemText(system: unknown): string {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system
      .map((b) => (b && typeof b === "object" ? String((b as { text?: string }).text ?? "") : ""))
      .join("\n");
  }
  return "";
}

function makeFakeClient() {
  const prompts: string[] = [];
  const client = {
    messages: {
      create: async (params: { system?: unknown }) => {
        prompts.push(systemText(params.system));
        return {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "hi" }],
        };
      },
    },
  };
  return { client: client as never, prompts };
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

describe("stateless-turn voice profile", () => {
  it("splices the voice-profile note into the system prompt when supplied", async () => {
    const { client, prompts } = makeFakeClient();
    const result = await runStatelessAgentTurn({
      ...baseInput,
      client,
      voiceProfileNote: "Tone: warm, concise.",
    });
    assert.equal(result.ok, true);
    assert.match(prompts[0], /## Write in the operator's voice/);
    assert.match(prompts[0], /Tone: warm, concise\./);
  });

  it("omits the section when voiceProfileNote is absent (byte-for-byte unchanged)", async () => {
    const { client, prompts } = makeFakeClient();
    const result = await runStatelessAgentTurn({ ...baseInput, client });
    assert.equal(result.ok, true);
    assert.doesNotMatch(prompts[0], /## Write in the operator's voice/);
  });
});
