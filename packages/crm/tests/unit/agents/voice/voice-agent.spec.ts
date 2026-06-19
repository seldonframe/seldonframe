// Task A3 — TDD tests for getOrCreateVoiceAgent.
//
// Uses dependency injection (no real DB). Verifies:
//   1. findExisting returns agent → returned as-is, insert never called.
//   2. findExisting returns null → insert called once with the canonical
//      defaults, created agent returned.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  getOrCreateVoiceAgent,
  type VoiceAgentDeps,
} from "../../../../src/lib/agents/voice/voice-agent";

const EXISTING_AGENT = {
  id: "agent-exists-123",
  blueprint: { voice: "alloy", archetype: "voice-receptionist", capabilities: [] },
  status: "live",
};

const CREATED_AGENT = {
  id: "agent-new-456",
  blueprint: { voice: "alloy", archetype: "voice-receptionist", capabilities: [] },
  status: "draft",
};

describe("getOrCreateVoiceAgent", () => {
  test("returns existing agent without calling insert", async () => {
    let insertCalls = 0;

    const deps: VoiceAgentDeps = {
      findExisting: async (_orgId) => EXISTING_AGENT,
      insert: async (_values) => {
        insertCalls++;
        return CREATED_AGENT;
      },
    };

    const result = await getOrCreateVoiceAgent({ orgId: "org-abc", deps });

    assert.equal(result.id, EXISTING_AGENT.id, "should return the existing agent");
    assert.equal(insertCalls, 0, "insert must NOT be called when agent already exists");
  });

  test("calls insert with canonical defaults when no existing agent", async () => {
    let insertCalls = 0;
    let insertedValues: Record<string, unknown> | null = null;

    const deps: VoiceAgentDeps = {
      findExisting: async (_orgId) => null,
      insert: async (values) => {
        insertCalls++;
        insertedValues = values;
        return CREATED_AGENT;
      },
    };

    const result = await getOrCreateVoiceAgent({ orgId: "org-xyz", deps });

    assert.equal(insertCalls, 1, "insert must be called exactly once");
    assert.equal(result.id, CREATED_AGENT.id, "should return the created agent");

    assert.ok(insertedValues !== null, "insertedValues should have been captured");
    const vals = insertedValues as Record<string, unknown>;
    assert.equal(vals.orgId, "org-xyz", "orgId must be passed through");
    assert.equal(vals.channel, "voice");
    assert.equal(vals.archetype, "voice-receptionist");
    assert.equal(vals.slug, "voice-receptionist");
    assert.equal(vals.status, "draft");
    assert.equal(vals.name, "Voice Receptionist");

    const blueprint = vals.blueprint as Record<string, unknown>;
    assert.ok(blueprint && typeof blueprint === "object", "blueprint must be an object");
    // Default TTS voice is "cedar" (set in commit 8b8a00cf — the newest
    // gpt-realtime voice). This assertion was stale ('alloy') before voice R1.
    assert.equal(blueprint.voice, "cedar", "blueprint.voice must default to 'cedar'");
  });
});
