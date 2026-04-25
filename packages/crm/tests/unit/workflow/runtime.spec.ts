// Unit tests for the workflow runtime engine (2c PR 2 M1).
//
// Exercises every dispatcher + the runtime's NextAction application
// against the in-memory storage. No Postgres needed; same code paths
// that production runs through.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { AgentSpec } from "../../../src/lib/agents/validator";
import {
  advanceRun,
  resumeWait,
  startRun,
} from "../../../src/lib/workflow/runtime";
import type { RuntimeContext } from "../../../src/lib/workflow/types";
import { TIMER_EVENT_TYPE } from "../../../src/lib/workflow/types";
import { InMemoryRuntimeStorage } from "./storage-memory";

const ORG_ID = "org_test_01";

type MockInvocation = { tool: string; args: Record<string, unknown> };

function makeContext(options: {
  invocations?: MockInvocation[];
  toolResults?: Record<string, unknown>;
  frozenNow?: Date;
} = {}): RuntimeContext {
  const invocations = options.invocations ?? [];
  const results = options.toolResults ?? {};
  const storage = new InMemoryRuntimeStorage();
  return {
    storage,
    invokeTool: async (tool, args) => {
      invocations.push({ tool, args });
      if (tool in results) return results[tool];
      return { data: { ok: true } };
    },
    now: () => options.frozenNow ?? new Date(),
  };
}

// ---------------------------------------------------------------------
// wait step
// ---------------------------------------------------------------------

describe("runtime — wait step", () => {
  test("pauses the run with a timer wait, status=waiting", async () => {
    const context = makeContext({ frozenNow: new Date("2026-04-22T00:00:00Z") });
    const spec: AgentSpec = {
      name: "Wait test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        { id: "pause", type: "wait", seconds: 60, next: "done" },
        { id: "done", type: "wait", seconds: 0, next: null },
      ],
    };

    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });

    const run = await context.storage.getRun(runId);
    assert.ok(run);
    assert.equal(run!.status, "waiting");
    assert.equal(run!.currentStepId, "pause");

    const memory = context.storage as InMemoryRuntimeStorage;
    const waits = Array.from(memory.waits.values()).filter((w) => w.runId === runId);
    assert.equal(waits.length, 1);
    assert.equal(waits[0].eventType, TIMER_EVENT_TYPE);
    assert.equal(waits[0].timeoutAt.getTime(), new Date("2026-04-22T00:01:00Z").getTime());
  });
});

// ---------------------------------------------------------------------
// mcp_tool_call step
// ---------------------------------------------------------------------

describe("runtime — mcp_tool_call step", () => {
  test("invokes tool, captures data-unwrapped result, advances", async () => {
    const invocations: MockInvocation[] = [];
    const context = makeContext({
      invocations,
      toolResults: {
        create_coupon: {
          data: { couponId: "cpn_1", promotionCodeId: "promo_1", code: "WINBACK15" },
        },
      },
    });
    const spec: AgentSpec = {
      name: "Tool test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "make_coupon",
          type: "mcp_tool_call",
          tool: "create_coupon",
          args: { percent_off: 15 },
          capture: "coupon",
          next: null,
        },
      ],
    };

    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });

    assert.equal(invocations.length, 1);
    assert.equal(invocations[0].tool, "create_coupon");

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");
    assert.equal(run!.currentStepId, null);
    // Captured value is data-unwrapped.
    assert.deepEqual(run!.captureScope.coupon, {
      couponId: "cpn_1",
      promotionCodeId: "promo_1",
      code: "WINBACK15",
    });
  });

  test("resolves {{variable}} interpolation in args before invoking", async () => {
    const invocations: MockInvocation[] = [];
    const context = makeContext({ invocations });
    const spec: AgentSpec = {
      name: "Interp test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      variables: { contactId: "trigger.contactId" },
      steps: [
        {
          id: "log",
          type: "mcp_tool_call",
          tool: "create_activity",
          args: { contact_id: "{{contactId}}", body: "hello" },
          next: null,
        },
      ],
    };

    await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: { contactId: "ctc_from_trigger" },
    });

    assert.equal(invocations[0].args.contact_id, "ctc_from_trigger");
  });

  test("resolves {{capture.field}} from a prior step", async () => {
    const invocations: MockInvocation[] = [];
    const context = makeContext({
      invocations,
      toolResults: {
        create_coupon: { data: { couponId: "cpn_1", promotionCodeId: "promo_1", code: "XYZ" } },
      },
    });
    const spec: AgentSpec = {
      name: "Capture chain",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "make_coupon",
          type: "mcp_tool_call",
          tool: "create_coupon",
          args: { percent_off: 15 },
          capture: "coupon",
          next: "email_it",
        },
        {
          id: "email_it",
          type: "mcp_tool_call",
          tool: "send_email",
          args: { subject: "Code: {{coupon.code}}", body: "enjoy" },
          next: null,
        },
      ],
    };
    await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });

    assert.equal(invocations.length, 2);
    assert.equal(invocations[1].args.subject, "Code: XYZ");
  });

  test("marks run failed when the tool invoker throws", async () => {
    const context: RuntimeContext = {
      storage: new InMemoryRuntimeStorage(),
      invokeTool: async () => {
        throw new Error("boom");
      },
      now: () => new Date(),
    };
    const spec: AgentSpec = {
      name: "Fail test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "fail_step",
          type: "mcp_tool_call",
          tool: "create_coupon",
          args: {},
          next: null,
        },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });
    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "failed");
  });
});

// ---------------------------------------------------------------------
// await_event step
// ---------------------------------------------------------------------

describe("runtime — await_event step", () => {
  test("registers a wait with resolved predicate (G-4 freeze)", async () => {
    const context = makeContext({ frozenNow: new Date("2026-04-22T00:00:00Z") });
    const spec: AgentSpec = {
      name: "Await test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      variables: { contactId: "trigger.contactId" },
      steps: [
        {
          id: "await_form",
          type: "await_event",
          event: "form.submitted",
          match: {
            kind: "field_equals",
            field: "data.contactId",
            value: "{{contactId}}",
          },
          timeout: "P7D",
          on_resume: { capture: "submission", next: "done" },
          on_timeout: { next: "done" },
        },
        { id: "done", type: "wait", seconds: 0, next: null },
      ],
    };

    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: { contactId: "ctc_frozen" },
    });

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "waiting");

    const memory = context.storage as InMemoryRuntimeStorage;
    const waits = Array.from(memory.waits.values()).filter((w) => w.runId === runId);
    assert.equal(waits.length, 1);
    assert.equal(waits[0].eventType, "form.submitted");
    // Frozen predicate — "{{contactId}}" has been replaced with the literal.
    assert.equal(
      (waits[0].matchPredicate as { value: string }).value,
      "ctc_frozen",
      "G-4: interpolation resolved at wait-registration, not at event arrival",
    );
    // Timeout computed from frozen now + P7D = 7 days later.
    assert.equal(
      waits[0].timeoutAt.getTime(),
      new Date("2026-04-29T00:00:00Z").getTime(),
    );
  });

  test("resumeWait on event_match captures payload + advances to on_resume.next", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Resume test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "await_form",
          type: "await_event",
          event: "form.submitted",
          on_resume: { capture: "submission", next: "book" },
          on_timeout: { next: "nudge" },
        },
        { id: "book", type: "mcp_tool_call", tool: "create_booking", args: {}, next: null },
        { id: "nudge", type: "mcp_tool_call", tool: "send_email", args: {}, next: null },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });

    const memory = context.storage as InMemoryRuntimeStorage;
    const wait = Array.from(memory.waits.values()).find((w) => w.runId === runId)!;

    const resumed = await resumeWait(
      context,
      wait,
      "event_match",
      "evt_1",
      { contactId: "ctc_123", formId: "f_intake", data: { foo: "bar" } },
    );
    assert.equal(resumed.resumed, true);

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");
    // Capture scope has the full event data.
    assert.deepEqual(run!.captureScope.submission, {
      contactId: "ctc_123",
      formId: "f_intake",
      data: { foo: "bar" },
    });
  });

  test("resumeWait on timeout advances to on_timeout.next WITHOUT capture", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Timeout test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "await_form",
          type: "await_event",
          event: "form.submitted",
          on_resume: { capture: "submission", next: "book" },
          on_timeout: { next: "nudge" },
        },
        { id: "book", type: "mcp_tool_call", tool: "create_booking", args: {}, next: null },
        { id: "nudge", type: "mcp_tool_call", tool: "send_email", args: {}, next: null },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });
    const memory = context.storage as InMemoryRuntimeStorage;
    const wait = Array.from(memory.waits.values()).find((w) => w.runId === runId)!;

    await resumeWait(context, wait, "timeout", null, null);

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");
    // Capture was NOT set.
    assert.equal(run!.captureScope.submission, undefined);
  });

  test("claimWait CAS: second resumeWait call returns resumed=false", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "CAS test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "await",
          type: "await_event",
          event: "form.submitted",
          on_resume: { next: null },
          on_timeout: { next: null },
        },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });
    const memory = context.storage as InMemoryRuntimeStorage;
    const wait = Array.from(memory.waits.values()).find((w) => w.runId === runId)!;

    const first = await resumeWait(context, wait, "event_match", "evt_1", {});
    const second = await resumeWait(context, wait, "event_match", "evt_2", {});
    assert.equal(first.resumed, true);
    assert.equal(second.resumed, false);
  });
});

// ---------------------------------------------------------------------
// conversation step (stub behavior per PR 2 ambiguity resolution)
// ---------------------------------------------------------------------

describe("runtime — conversation step (stub)", () => {
  test("stub advances directly to on_exit.next", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Conv stub test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "chat",
          type: "conversation",
          channel: "sms",
          initial_message: "hi",
          exit_when: "they responded",
          on_exit: { extract: {}, next: null },
        },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });
    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");
  });
});

// ---------------------------------------------------------------------
// step-result write-through (2c PR 3 M1)
// ---------------------------------------------------------------------

describe("runtime — step-result trace (2c PR 3 M1)", () => {
  test("appends one row per dispatcher call with outcome + durationMs", async () => {
    const context = makeContext({
      toolResults: { create_coupon: { data: { couponId: "c_1", code: "X" } } },
    });
    const spec: AgentSpec = {
      name: "Trace test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "make_coupon",
          type: "mcp_tool_call",
          tool: "create_coupon",
          args: { percent_off: 15 },
          capture: "coupon",
          next: "log",
        },
        {
          id: "log",
          type: "mcp_tool_call",
          tool: "create_activity",
          args: { note: "done" },
          next: null,
        },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });

    const memory = context.storage as InMemoryRuntimeStorage;
    const results = memory.stepResults.filter((r) => r.runId === runId);
    assert.equal(results.length, 2);
    // newest-first ordering via listStepResults; raw array is insertion order
    const byStep = new Map(results.map((r) => [r.stepId, r]));
    assert.equal(byStep.get("make_coupon")!.outcome, "advanced");
    assert.equal(byStep.get("make_coupon")!.stepType, "mcp_tool_call");
    assert.deepEqual(byStep.get("make_coupon")!.captureValue, {
      coupon: { couponId: "c_1", code: "X" },
    });
    assert.equal(byStep.get("log")!.outcome, "advanced");
    // durationMs is a non-negative integer — mock tool invoker resolves
    // immediately so we just assert >= 0.
    for (const r of results) {
      assert.ok(r.durationMs >= 0, `durationMs >= 0 for ${r.stepId}`);
    }
  });

  test("failed step surfaces outcome=failed + errorMessage", async () => {
    const context: RuntimeContext = {
      storage: new InMemoryRuntimeStorage(),
      invokeTool: async () => {
        throw new Error("boom");
      },
      now: () => new Date(),
    };
    const spec: AgentSpec = {
      name: "Fail trace",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        { id: "bad", type: "mcp_tool_call", tool: "create_coupon", args: {}, next: null },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });
    const memory = context.storage as InMemoryRuntimeStorage;
    const failed = memory.stepResults.find((r) => r.runId === runId && r.outcome === "failed");
    assert.ok(failed);
    assert.ok(failed!.errorMessage?.includes("boom"));
  });

  test("await_event dispatch writes outcome=paused", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Await trace",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "wait",
          type: "await_event",
          event: "form.submitted",
          on_resume: { next: null },
          on_timeout: { next: null },
        },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });
    const memory = context.storage as InMemoryRuntimeStorage;
    const results = memory.stepResults.filter((r) => r.runId === runId);
    assert.equal(results.length, 1);
    assert.equal(results[0].outcome, "paused");
    assert.equal(results[0].stepType, "await_event");
  });
});

// ---------------------------------------------------------------------
// advanceRun loop safety
// ---------------------------------------------------------------------

describe("runtime — advanceRun guards", () => {
  test("infinite loop detector fires on steps that self-cycle", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Cycle test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "loop",
          type: "mcp_tool_call",
          tool: "create_activity",
          args: {},
          next: "loop",
        },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });

    // advanceRun is called inside startRun; it should have bailed out
    // with status=failed after hitting the iteration cap.
    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "failed");
  });

  test("advanceRun on a completed run is a no-op", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Done test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      // mcp_tool_call with next:null completes the run immediately.
      // wait steps always pause (even seconds:0) so can't be used as terminators.
      steps: [{ id: "only", type: "mcp_tool_call", tool: "noop", args: {}, next: null }],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });
    // Second advance call should early-return without error.
    await advanceRun(context, runId);
    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");
  });
});
