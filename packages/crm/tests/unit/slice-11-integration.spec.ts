// SLICE 11 integration test — verify end-to-end cost capture flow.
// SLICE 11 C3 per audit headline finding (recorder uninstrumented)
// + Max's gate-resolution prompt (verify recorder actually called).
//
// THE PURPOSE OF SLICE 11. This test is the empirical confirmation
// that the launch-blocker fix works. Until C2's wiring landed,
// running any archetype through the runtime would never call
// recordLlmUsage. After C2, an llm_call-containing archetype DOES
// call it with the right args.
//
// Test approach:
//   - Build a synthetic test fixture archetype with an llm_call step
//   - Run it through the real runtime (advanceRun) with:
//     * In-memory RuntimeStorage (test-only, parallel to other
//       runtime integration tests)
//     * Stub Claude invoker (returns canned response with usage)
//     * Stub recordLlmUsage that captures the call args
//   - Verify the recorder was called with the right runId, model,
//     and tokens
//
// We don't exercise the actual SQL `+= ` write (covered by
// `ai-workflow-cost-recorder.spec.ts`); we verify the wiring path
// from advanceRun → dispatchStep → dispatchLlmCall → recordLlmUsage.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  advanceRun,
  startRun,
} from "../../src/lib/workflow/runtime";
import { InMemoryRuntimeStorage } from "./workflow/storage-memory";
import type {
  AgentSpec,
  EventRegistry,
} from "../../src/lib/agents/validator";
import type {
  ClaudeInvokerArgs,
  ClaudeInvokerResult,
} from "../../src/lib/workflow/step-dispatchers/llm-call";
import type { RuntimeContext } from "../../src/lib/workflow/types";

const ORG = "00000000-0000-4000-8000-000000000aaa";

const eventRegistry: EventRegistry = {
  events: [
    { type: "contact.created", fields: { contactId: { rawType: "string", nullable: false } } },
  ],
};

// Synthetic test fixture archetype: a single llm_call step that
// summarizes a customer note, then terminates.
const summarizeArchetypeSpec: AgentSpec = {
  name: "summarize-test-fixture",
  description: "Test fixture: single llm_call step. SLICE 11 C3.",
  trigger: { type: "event", event: "contact.created" },
  variables: { contactId: "trigger.contactId", note: "trigger.note" },
  steps: [
    {
      id: "summarize",
      type: "llm_call",
      model: "claude-sonnet-4-6",
      user_prompt: "Summarize this in one sentence: {{note}}",
      max_tokens: 256,
      capture: "summary",
      next: null,
    },
  ] as unknown as AgentSpec["steps"],
};

describe("SLICE 11 C3 — end-to-end cost capture", () => {
  test("running an llm_call archetype CALLS recordLlmUsage with correct args (THE LAUNCH-BLOCKER FIX)", async () => {
    const storage = new InMemoryRuntimeStorage();
    const recordedCalls: Array<{
      runId: string;
      model: string;
      inputTokens: number | undefined;
      outputTokens: number | undefined;
    }> = [];
    const invokerCalls: ClaudeInvokerArgs[] = [];
    const stubInvoker = async (args: ClaudeInvokerArgs): Promise<ClaudeInvokerResult> => {
      invokerCalls.push(args);
      return {
        text: "Customer is a long-time HVAC client; service-history is consistent.",
        // Anthropic returns date-stamped variant; recorder uses this.
        model: "claude-sonnet-4-6-20251215",
        usage: { inputTokens: 245, outputTokens: 78 },
      };
    };
    const ctx: RuntimeContext = {
      storage,
      invokeTool: async () => {
        throw new Error("not used in this test");
      },
      now: () => new Date(),
      invokeClaude: stubInvoker,
      recordLlmUsage: async (input) => {
        recordedCalls.push(input);
      },
    };

    // Start the run + drive advancement.
    const runId = await startRun(ctx, {
      orgId: ORG,
      archetypeId: "summarize-test-fixture",
      spec: summarizeArchetypeSpec,
      triggerEventId: null,
      triggerPayload: { contactId: "ctc_1", note: "Maria called about her thermostat." },
    });
    await advanceRun(ctx, runId);

    // Invoker called once with resolved interpolation.
    assert.equal(invokerCalls.length, 1);
    assert.equal(
      invokerCalls[0].userPrompt,
      "Summarize this in one sentence: Maria called about her thermostat.",
    );
    assert.equal(invokerCalls[0].model, "claude-sonnet-4-6");
    assert.equal(invokerCalls[0].maxTokens, 256);

    // THE LAUNCH-BLOCKER FIX VERIFIED: recordLlmUsage was called
    // exactly once, with the right args.
    assert.equal(recordedCalls.length, 1, "recordLlmUsage MUST be called exactly once per llm_call step");
    assert.equal(recordedCalls[0].runId, runId);
    // Recorder uses the response.model (Anthropic's actual billing
    // model), not step.model.
    assert.equal(recordedCalls[0].model, "claude-sonnet-4-6-20251215");
    assert.equal(recordedCalls[0].inputTokens, 245);
    assert.equal(recordedCalls[0].outputTokens, 78);

    // Run completed successfully.
    const finalRun = await storage.getRun(runId);
    assert.ok(finalRun);
    assert.equal(finalRun!.status, "completed");
    // Capture bound the response text into the run scope.
    assert.equal(
      finalRun!.captureScope.summary,
      "Customer is a long-time HVAC client; service-history is consistent.",
    );
  });

  test("invoker failure → run fails; recorder NOT called (no usage data)", async () => {
    const storage = new InMemoryRuntimeStorage();
    const recordedCalls: unknown[] = [];
    const ctx: RuntimeContext = {
      storage,
      invokeTool: async () => {
        throw new Error("not used in this test");
      },
      now: () => new Date(),
      invokeClaude: async () => {
        throw new Error("Anthropic 503 Service Unavailable");
      },
      recordLlmUsage: async (input) => {
        recordedCalls.push(input);
      },
    };
    const runId = await startRun(ctx, {
      orgId: ORG,
      archetypeId: "summarize-test-fixture",
      spec: summarizeArchetypeSpec,
      triggerEventId: null,
      triggerPayload: { contactId: "ctc_1", note: "x" },
    });
    await advanceRun(ctx, runId);
    const finalRun = await storage.getRun(runId);
    assert.equal(finalRun!.status, "failed");
    assert.equal(recordedCalls.length, 0, "no usage data → no recorder call");
  });

  test("RuntimeContext without invokeClaude → run fails with clear error (audit gap surfaces explicitly)", async () => {
    const storage = new InMemoryRuntimeStorage();
    // Pre-SLICE-11 RuntimeContext shape (no invokeClaude). Should
    // fail-closed with a clear error, NOT silently no-op.
    const ctx: RuntimeContext = {
      storage,
      invokeTool: async () => {
        throw new Error("not used");
      },
      now: () => new Date(),
      // invokeClaude intentionally omitted
    };
    const runId = await startRun(ctx, {
      orgId: ORG,
      archetypeId: "summarize-test-fixture",
      spec: summarizeArchetypeSpec,
      triggerEventId: null,
      triggerPayload: { contactId: "ctc_1", note: "x" },
    });
    await advanceRun(ctx, runId);
    const finalRun = await storage.getRun(runId);
    assert.equal(finalRun!.status, "failed");
  });
});
