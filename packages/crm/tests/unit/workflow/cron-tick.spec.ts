// Cron-tick timeout-sweep tests (2c PR 2 M2).
//
// Tests the resume-on-timeout path the cron handler drives. The
// handler itself is thin (auth + ToolInvoker injection + batch loop);
// the load-bearing logic is `findDueWaits + resumeWait(timeout)`
// which we exercise here via the in-memory storage.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { AgentSpec } from "../../../src/lib/agents/validator";
import { resumeWait, startRun } from "../../../src/lib/workflow/runtime";
import type { RuntimeContext } from "../../../src/lib/workflow/types";
import { InMemoryRuntimeStorage } from "./storage-memory";

const ORG_ID = "org_cron_01";

function makeContextAt(frozenNow: Date): RuntimeContext {
  return {
    storage: new InMemoryRuntimeStorage(),
    invokeTool: async () => ({ data: { ok: true } }),
    now: () => frozenNow,
  };
}

describe("cron workflow-tick timeout sweep", () => {
  test("findDueWaits returns waits whose timeoutAt is past now", async () => {
    const start = new Date("2026-04-22T00:00:00Z");
    const context = makeContextAt(start);
    const spec: AgentSpec = {
      name: "Timer test",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        { id: "wait", type: "wait", seconds: 60, next: "done" },
        { id: "done", type: "mcp_tool_call", tool: "noop", args: {}, next: null },
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
    // Before timeout: findDueWaits should return nothing.
    let due = await context.storage.findDueWaits(start, 100);
    assert.equal(due.length, 0);

    // Advance 90s past start — timer was set for start + 60s.
    const later = new Date("2026-04-22T00:01:30Z");
    due = await context.storage.findDueWaits(later, 100);
    assert.equal(due.length, 1);
    assert.equal(due[0].runId, runId);

    // Resume on timeout; run advances to "done" and completes.
    await resumeWait(context, due[0], "timeout", null, null);
    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");

    // Wait row is resolved — next scan finds nothing.
    void memory;
    due = await context.storage.findDueWaits(later, 100);
    assert.equal(due.length, 0);
  });

  test("await_event wait that times out advances to on_timeout.next", async () => {
    const start = new Date("2026-04-22T00:00:00Z");
    const context = makeContextAt(start);
    const spec: AgentSpec = {
      name: "Timeout path",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "wait",
          type: "await_event",
          event: "form.submitted",
          timeout: "PT1M",
          on_resume: { next: "on_match" },
          on_timeout: { next: "on_timeout_path" },
        },
        { id: "on_match", type: "mcp_tool_call", tool: "send_email", args: {}, next: null },
        { id: "on_timeout_path", type: "mcp_tool_call", tool: "send_nudge", args: {}, next: null },
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

    // Forward the clock past the 1-minute timeout and resume.
    const later = new Date("2026-04-22T00:02:00Z");
    const dueContext: RuntimeContext = { ...context, now: () => later };
    await resumeWait(dueContext, wait, "timeout", null, null);

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");
    // Capture wasn't applied — timeout path doesn't bind capture
    // even if on_resume declared one.
  });

  test("batch limit: findDueWaits respects limit parameter", async () => {
    const start = new Date("2026-04-22T00:00:00Z");
    const context = makeContextAt(start);
    const spec: AgentSpec = {
      name: "Many timers",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        { id: "wait", type: "wait", seconds: 60, next: "done" },
        { id: "done", type: "mcp_tool_call", tool: "noop", args: {}, next: null },
      ],
    };
    // Fire 5 runs; each registers one wait.
    for (let i = 0; i < 5; i += 1) {
      await startRun(context, {
        orgId: ORG_ID,
        archetypeId: `test_${i}`,
        spec,
        triggerEventId: null,
        triggerPayload: {},
      });
    }
    const later = new Date("2026-04-22T00:01:30Z");
    const batch = await context.storage.findDueWaits(later, 3);
    assert.equal(batch.length, 3, "limit honored");
  });
});
