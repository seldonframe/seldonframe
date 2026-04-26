// Tests for the llm_call step dispatcher.
// SLICE 11 C2 per audit §5.1 + Max's gate-resolution prompt.
//
// The dispatcher's contract:
//   1. Resolve interpolations in user_prompt + system_prompt
//   2. Invoke Claude SDK via injected invoker (RuntimeContext.invokeClaude)
//   3. Call recordLlmUsage with response.usage (the launch-blocker
//      fix — recorder finally has a caller)
//   4. If `capture` is set: bind response.text to the capture name
//      via NextAction's capture field
//   5. Return advance to step.next
//
// Failure modes:
//   - Invoker throws → return fail (no usage recorded; cost
//     remains $0 for this step's contribution)
//   - Invoker returns response with missing usage → recordLlmUsage's
//     own swallow handles it (records 0 tokens, no cost; advance
//     still proceeds because the response text is what matters)
//   - Empty response text → still returns advance (downstream may
//     handle empty capture)

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { dispatchLlmCall, type LlmCallDispatchContext, type ClaudeInvoker } from "../../src/lib/workflow/step-dispatchers/llm-call";
import type { LlmCallStep, AgentSpec } from "../../src/lib/agents/validator";
import type { StoredRun } from "../../src/lib/workflow/types";

const RUN_ID = "00000000-0000-4000-8000-000000000bbb";
const ORG = "00000000-0000-4000-8000-000000000aaa";

const baseStep = (over: Partial<LlmCallStep> = {}): LlmCallStep =>
  ({
    id: "summarize",
    type: "llm_call",
    model: "claude-sonnet-4-6",
    user_prompt: "Summarize this customer's history in one sentence.",
    max_tokens: 4096,
    next: "next_target",
    ...over,
  }) as LlmCallStep;

const baseSpec: AgentSpec = {
  name: "test",
  description: "test",
  trigger: { type: "event", event: "contact.created" },
  variables: { contactId: "trigger.contactId" },
  steps: [
    baseStep(),
    { id: "next_target", type: "wait", seconds: 0, next: null },
  ] as unknown as AgentSpec["steps"],
};

const baseRun = (over: Partial<StoredRun> = {}): StoredRun => ({
  id: RUN_ID,
  orgId: ORG,
  archetypeId: "test",
  specSnapshot: baseSpec,
  triggerEventId: null,
  triggerPayload: { contactId: "ctc_1" },
  status: "running",
  currentStepId: "summarize",
  captureScope: {},
  variableScope: { contactId: "ctc_1", customerName: "Maria" },
  failureCount: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

function makeContext(over: {
  invoker?: ClaudeInvoker;
  recorder?: (input: { runId: string; model: string; inputTokens: number | undefined; outputTokens: number | undefined }) => Promise<void>;
} = {}): LlmCallDispatchContext {
  return {
    invokeClaude:
      over.invoker ??
      (async () => ({
        text: "Maria has been a customer since 2024; service-history is consistent.",
        model: "claude-sonnet-4-6",
        usage: { inputTokens: 250, outputTokens: 80 },
      })),
    recordLlmUsage: over.recorder ?? (async () => {}),
  };
}

// ---------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------

describe("dispatchLlmCall — happy path", () => {
  test("invokes Claude with the resolved prompt + records usage + advances", async () => {
    type InvokeArgs = { model: string; userPrompt: string; systemPrompt?: string; maxTokens: number };
    type RecordedUsage = { runId: string; model: string; inputTokens: number | undefined; outputTokens: number | undefined };
    let invokeArgs: InvokeArgs | null = null as InvokeArgs | null;
    let recordedUsage: RecordedUsage | null = null as RecordedUsage | null;
    const ctx = makeContext({
      invoker: async (args) => {
        invokeArgs = args;
        return {
          text: "Hello Maria!",
          model: "claude-sonnet-4-6",
          usage: { inputTokens: 250, outputTokens: 80 },
        };
      },
      recorder: async (input) => {
        recordedUsage = input;
      },
    });
    const step = baseStep({
      user_prompt: "Hi {{customerName}}, summarize.",
      system_prompt: "Brand voice: friendly.",
    });
    const action = await dispatchLlmCall(baseRun(), step, ctx);

    assert.equal(action.kind, "advance");
    if (action.kind === "advance") {
      assert.equal(action.next, "next_target");
    }

    // Interpolation resolved in user_prompt + system_prompt passed through.
    assert.ok(invokeArgs);
    assert.equal(invokeArgs!.userPrompt, "Hi Maria, summarize.");
    assert.equal(invokeArgs!.systemPrompt, "Brand voice: friendly.");
    assert.equal(invokeArgs!.model, "claude-sonnet-4-6");
    assert.equal(invokeArgs!.maxTokens, 4096);

    // Recorder called with the right args (THE LAUNCH-BLOCKER FIX).
    assert.ok(recordedUsage);
    assert.equal(recordedUsage!.runId, RUN_ID);
    assert.equal(recordedUsage!.model, "claude-sonnet-4-6");
    assert.equal(recordedUsage!.inputTokens, 250);
    assert.equal(recordedUsage!.outputTokens, 80);
  });

  test("capture binds response text into the run scope via NextAction", async () => {
    const ctx = makeContext();
    const step = baseStep({ capture: "summary" });
    const action = await dispatchLlmCall(baseRun(), step, ctx);
    assert.equal(action.kind, "advance");
    if (action.kind === "advance") {
      assert.ok(action.capture);
      assert.equal(action.capture!.name, "summary");
      assert.equal(action.capture!.value, "Maria has been a customer since 2024; service-history is consistent.");
    }
  });

  test("no capture → action carries no capture binding", async () => {
    const ctx = makeContext();
    const action = await dispatchLlmCall(baseRun(), baseStep(), ctx);
    assert.equal(action.kind, "advance");
    if (action.kind === "advance") {
      assert.equal(action.capture, undefined);
    }
  });

  test("system_prompt omitted → invoker called without systemPrompt", async () => {
    let invokeArgs: { systemPrompt?: string } | null = null;
    const ctx = makeContext({
      invoker: async (args) => {
        invokeArgs = args;
        return { text: "ok", model: "claude-sonnet-4-6", usage: { inputTokens: 10, outputTokens: 5 } };
      },
    });
    await dispatchLlmCall(baseRun(), baseStep(), ctx);
    assert.equal(invokeArgs!.systemPrompt, undefined);
  });

  test("max_tokens defaulted to 4096 when not specified", async () => {
    let invokeArgs: { maxTokens: number } | null = null;
    const ctx = makeContext({
      invoker: async (args) => {
        invokeArgs = args;
        return { text: "ok", model: "claude-sonnet-4-6", usage: { inputTokens: 10, outputTokens: 5 } };
      },
    });
    const step = baseStep();
    delete (step as Record<string, unknown>).max_tokens;
    await dispatchLlmCall(baseRun(), step, ctx);
    // Dispatcher uses step's max_tokens or its 4096 default.
    assert.equal(invokeArgs!.maxTokens, 4096);
  });

  test("interpolation in user_prompt resolves capture-scope nested fields", async () => {
    let invokeArgs: { userPrompt: string } | null = null;
    const ctx = makeContext({
      invoker: async (args) => {
        invokeArgs = args;
        return { text: "ok", model: "claude-sonnet-4-6", usage: { inputTokens: 10, outputTokens: 5 } };
      },
    });
    const step = baseStep({
      user_prompt: "Customer is {{contact.name}} at {{contact.org}}.",
    });
    const run = baseRun({
      captureScope: { contact: { name: "Maria", org: "Desert Cool HVAC" } },
    });
    await dispatchLlmCall(run, step, ctx);
    assert.equal(invokeArgs!.userPrompt, "Customer is Maria at Desert Cool HVAC.");
  });
});

// ---------------------------------------------------------------------
// Failure paths (recorder is the launch-blocker — verify it
// keeps trying even when other things go sideways)
// ---------------------------------------------------------------------

describe("dispatchLlmCall — invoker failure", () => {
  test("invoker throws → fail action; no recorder call", async () => {
    let recordedCount = 0;
    const ctx = makeContext({
      invoker: async () => {
        throw new Error("Anthropic API timeout");
      },
      recorder: async () => {
        recordedCount += 1;
      },
    });
    const action = await dispatchLlmCall(baseRun(), baseStep(), ctx);
    assert.equal(action.kind, "fail");
    if (action.kind === "fail") {
      assert.match(action.reason, /Anthropic API timeout|llm_call/i);
    }
    // No usage data → no recorder call.
    assert.equal(recordedCount, 0);
  });

  test("invoker returns missing usage → recorder still called with undefined tokens (recorder swallows)", async () => {
    type RecordedUsage = { inputTokens: number | undefined; outputTokens: number | undefined };
    let recordedUsage: RecordedUsage | null = null as RecordedUsage | null;
    const ctx = makeContext({
      invoker: async () => ({
        text: "ok",
        model: "claude-sonnet-4-6",
        usage: { inputTokens: undefined, outputTokens: undefined },
      }),
      recorder: async (input) => {
        recordedUsage = input;
      },
    });
    const action = await dispatchLlmCall(baseRun(), baseStep(), ctx);
    assert.equal(action.kind, "advance");
    // Recorder was called; it's the recorder's job to swallow undefined
    // tokens (verified in ai-workflow-cost-recorder.spec.ts).
    assert.ok(recordedUsage);
    assert.equal(recordedUsage!.inputTokens, undefined);
    assert.equal(recordedUsage!.outputTokens, undefined);
  });

  test("recorder throws → still advances (cost capture is observability, never blocks workflow per L-22)", async () => {
    let warned = false;
    const originalWarn = console.warn;
    console.warn = () => {
      warned = true;
    };
    try {
      const ctx = makeContext({
        recorder: async () => {
          throw new Error("DB down");
        },
      });
      const action = await dispatchLlmCall(baseRun(), baseStep(), ctx);
      assert.equal(action.kind, "advance");
      assert.ok(warned, "expected console.warn breadcrumb when recorder throws");
    } finally {
      console.warn = originalWarn;
    }
  });
});

// ---------------------------------------------------------------------
// Empty / odd responses
// ---------------------------------------------------------------------

describe("dispatchLlmCall — empty + odd responses", () => {
  test("empty response text + capture → capture binds to empty string (downstream handles)", async () => {
    const ctx = makeContext({
      invoker: async () => ({
        text: "",
        model: "claude-sonnet-4-6",
        usage: { inputTokens: 5, outputTokens: 0 },
      }),
    });
    const action = await dispatchLlmCall(baseRun(), baseStep({ capture: "summary" }), ctx);
    assert.equal(action.kind, "advance");
    if (action.kind === "advance") {
      assert.equal(action.capture!.value, "");
    }
  });

  test("response model differs from step.model → recorder uses response.model (source of truth for billing)", async () => {
    let recordedModel: string | null = null;
    const ctx = makeContext({
      invoker: async () => ({
        text: "ok",
        // Anthropic may return a more specific date-stamped model id.
        model: "claude-sonnet-4-6-20251215",
        usage: { inputTokens: 10, outputTokens: 5 },
      }),
      recorder: async (input) => {
        recordedModel = input.model;
      },
    });
    await dispatchLlmCall(baseRun(), baseStep({ model: "claude-sonnet-4-6" }), ctx);
    // Recorder uses the response model — that's what was actually
    // billed. Fallback pricing handles unknown date-stamped variants.
    assert.equal(recordedModel, "claude-sonnet-4-6-20251215");
  });
});
