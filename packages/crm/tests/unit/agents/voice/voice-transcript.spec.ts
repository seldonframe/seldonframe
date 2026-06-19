// A7 — tests for best-effort transcript persistence helpers (TDD).
//
// All deps injected — no DB, no network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  startVoiceConversation,
  appendVoiceTurn,
  endVoiceConversation,
} from "../../../../src/lib/agents/voice/transcript";

const CONV_ID = "conv-transcript-test-uuid";
const AGENT_ID = "agent-voice-111";
const ORG_ID = "org-222";

describe("startVoiceConversation", () => {
  test("(a) calls insert with the right shape and returns the injected id", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test capture, mutated inside an injected closure
    let capturedValues: any = null;

    const result = await startVoiceConversation({
      agentId: AGENT_ID,
      agentVersion: 3,
      orgId: ORG_ID,
      callId: "call-abc-123",
      fromNumber: "+15550001111",
      toNumber: "+15559998888",
      deps: {
        insertConversation: async (values) => {
          capturedValues = values;
          return CONV_ID;
        },
      },
    });

    assert.equal(result, CONV_ID);
    assert.ok(capturedValues !== null, "insert should have been called");
    assert.equal(capturedValues!.agentId, AGENT_ID);
    assert.equal(capturedValues!.agentVersion, 3);
    assert.equal(capturedValues!.orgId, ORG_ID);
    assert.equal(capturedValues!.status, "active");

    const meta = capturedValues!.channelMeta as Record<string, unknown>;
    assert.equal(meta.channel, "voice");
    assert.equal(meta.call_id, "call-abc-123");
    assert.equal(meta.from_number, "+15550001111");
    assert.equal(meta.to_number, "+15559998888");
  });

  test("(d) when insertConversation throws, returns null without throwing", async () => {
    const result = await startVoiceConversation({
      agentId: AGENT_ID,
      orgId: ORG_ID,
      callId: "call-bad",
      deps: {
        insertConversation: async () => {
          throw new Error("DB connection failed");
        },
      },
    });

    assert.equal(result, null);
  });

  test("(e) caller number is written to channel_meta.from_number", async () => {
    // Voice R1+ — the inbound call's caller ID must be persisted on the call
    // record so the operator sees who phoned, instead of a null from_number.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test capture, mutated inside an injected closure
    let capturedValues: any = null;
    await startVoiceConversation({
      agentId: AGENT_ID,
      orgId: ORG_ID,
      callId: "call-caller-id",
      fromNumber: "+15553334444",
      deps: {
        insertConversation: async (values) => {
          capturedValues = values;
          return CONV_ID;
        },
      },
    });
    const meta = capturedValues!.channelMeta as Record<string, unknown>;
    assert.equal(meta.from_number, "+15553334444", "caller number lands in from_number");
  });

  test("(f) from_number is null when no caller number is supplied (anonymous, back-compat)", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test capture, mutated inside an injected closure
    let capturedValues: any = null;
    await startVoiceConversation({
      agentId: AGENT_ID,
      orgId: ORG_ID,
      callId: "call-anon",
      // no fromNumber — anonymous / blocked caller
      deps: {
        insertConversation: async (values) => {
          capturedValues = values;
          return CONV_ID;
        },
      },
    });
    const meta = capturedValues!.channelMeta as Record<string, unknown>;
    assert.equal(meta.from_number, null, "absent caller number stays null");
  });
});

describe("appendVoiceTurn", () => {
  test("(b) inserts a turn with the given turnIndex, role, content", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test capture, mutated inside an injected closure
    let capturedValues: any = null;

    await appendVoiceTurn({
      conversationId: CONV_ID,
      turnIndex: 2,
      role: "assistant",
      content: "Hello, how can I help you?",
      deps: {
        insertTurn: async (values) => {
          capturedValues = values;
        },
      },
    });

    assert.ok(capturedValues !== null, "insertTurn should have been called");
    assert.equal(capturedValues!.conversationId, CONV_ID);
    assert.equal(capturedValues!.turnIndex, 2);
    assert.equal(capturedValues!.role, "assistant");
    assert.equal(capturedValues!.content, "Hello, how can I help you?");
  });

  test("(d) when insertTurn throws, resolves without throwing", async () => {
    // Should not reject — best-effort
    await appendVoiceTurn({
      conversationId: CONV_ID,
      turnIndex: 0,
      role: "user",
      content: "hi",
      deps: {
        insertTurn: async () => {
          throw new Error("DB write failed");
        },
      },
    });
    // If we reach here without throwing, the test passes.
  });
});

describe("endVoiceConversation", () => {
  test("(c) updates with status:completed, endedAt set, and turnCount", async () => {
    let capturedConvId: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test capture, mutated inside an injected closure
    let capturedPatch: any = null;

    await endVoiceConversation({
      conversationId: CONV_ID,
      turnCount: 5,
      deps: {
        updateConversation: async (convId, patch) => {
          capturedConvId = convId;
          capturedPatch = patch;
        },
      },
    });

    assert.equal(capturedConvId, CONV_ID);
    assert.ok(capturedPatch !== null, "updateConversation should have been called");
    assert.equal(capturedPatch!.status, "completed");
    assert.equal(capturedPatch!.turnCount, 5);
    assert.ok(capturedPatch!.endedAt instanceof Date, "endedAt should be a Date");
  });

  test("(c-custom-status) respects a custom status (e.g. 'abandoned')", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test capture, mutated inside an injected closure
    let capturedPatch: any = null;

    await endVoiceConversation({
      conversationId: CONV_ID,
      turnCount: 0,
      status: "abandoned",
      deps: {
        updateConversation: async (_convId, patch) => {
          capturedPatch = patch;
        },
      },
    });

    assert.equal(capturedPatch!.status, "abandoned");
  });

  test("(d) when updateConversation throws, resolves without throwing", async () => {
    await endVoiceConversation({
      conversationId: CONV_ID,
      turnCount: 1,
      deps: {
        updateConversation: async () => {
          throw new Error("DB update failed");
        },
      },
    });
    // No rejection = pass
  });
});
