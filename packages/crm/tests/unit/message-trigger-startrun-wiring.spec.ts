// Tests for the production startRun + loadSpec wiring.
// SLICE 7 PR 2 C2 per audit §4.1 + §5.3.
//
// PR 2 C2 swaps PR 1's synthetic-id stub with real runtime.startRun.
// loadSpec resolves the archetype from the registry (placeholder-free
// archetypes only — appointment-confirm-sms in C3 is the first such).
//
// These tests verify the wiring constructs the right inputs and hands
// off cleanly. End-to-end (real DB → real run → real reply) lives
// in the integration harness (C4) + E2E test (C5).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  buildMessageTriggerSpecResolver,
  buildMessageTriggerStartRun,
} from "../../src/lib/agents/message-trigger-runtime-wiring";
import type { RuntimeContext } from "../../src/lib/workflow/types";

// ---------------------------------------------------------------------
// 1. buildMessageTriggerSpecResolver — resolves from archetype registry
// ---------------------------------------------------------------------

describe("buildMessageTriggerSpecResolver", () => {
  test("returns a function that resolves a known archetype's spec", async () => {
    const resolve = buildMessageTriggerSpecResolver();
    // weather-aware-booking exists in the registry (SLICE 6 PR 2)
    const spec = await resolve("weather-aware-booking");
    assert.ok(spec);
    assert.equal((spec as { id?: string }).id, "weather-aware-booking");
  });

  test("throws on unknown archetype id", async () => {
    const resolve = buildMessageTriggerSpecResolver();
    await assert.rejects(
      () => resolve("does-not-exist"),
      /unknown archetype|not found/i,
    );
  });
});

// ---------------------------------------------------------------------
// 2. buildMessageTriggerStartRun — invokes runtime.startRun via context
// ---------------------------------------------------------------------

describe("buildMessageTriggerStartRun", () => {
  test("invokes the runtime startRun and returns the run id", async () => {
    let captured: { archetypeId: string; orgId: string; triggerEventId: string | null } | null = null;
    const fakeRuntimeStartRun = async (
      _ctx: RuntimeContext,
      input: { orgId: string; archetypeId: string; spec: unknown; triggerEventId: string | null; triggerPayload: Record<string, unknown> },
    ): Promise<string> => {
      captured = {
        archetypeId: input.archetypeId,
        orgId: input.orgId,
        triggerEventId: input.triggerEventId,
      };
      return "run_xyz";
    };

    const fakeContext = {} as RuntimeContext;
    const startRun = buildMessageTriggerStartRun({
      runtimeContext: fakeContext,
      runtimeStartRun: fakeRuntimeStartRun,
    });

    const runId = await startRun({
      orgId: "org_acme",
      archetypeId: "test-arch",
      spec: { name: "x", description: "y", steps: [] } as never,
      triggerEventId: "fire_1",
      triggerPayload: { body: "CONFIRM" },
    });

    assert.equal(runId, "run_xyz");
    assert.deepEqual(captured, {
      archetypeId: "test-arch",
      orgId: "org_acme",
      triggerEventId: "fire_1",
    });
  });

  test("propagates runtime failures (caller catches per-trigger)", async () => {
    const fakeRuntimeStartRun = async (): Promise<string> => {
      throw new Error("runtime down");
    };
    const startRun = buildMessageTriggerStartRun({
      runtimeContext: {} as RuntimeContext,
      runtimeStartRun: fakeRuntimeStartRun,
    });

    await assert.rejects(
      () => startRun({
        orgId: "org_a",
        archetypeId: "x",
        spec: { name: "x", description: "x", steps: [] } as never,
        triggerEventId: null,
        triggerPayload: {},
      }),
      /runtime down/,
    );
  });
});
