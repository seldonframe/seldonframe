// Unit tests for the logic driving the admin resume + cancel
// endpoints (2c PR 3 M2). Exercises the runtime behaviors the route
// handlers delegate to, without booting Next/auth.
//
// The route handlers themselves are thin:
//   - Auth check via getOrgId() (existing pattern, not tested here)
//   - Find run / find wait / claim / advance
//
// This spec covers the load-bearing logic: manual resume produces
// the same advancement semantics as event_match (minus payload
// capture), and cancel claims pending waits atomically so the cron
// tick can't race.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { AgentSpec } from "../../../src/lib/agents/validator";
import { resumeWait, startRun } from "../../../src/lib/workflow/runtime";
import type { RuntimeContext, StoredWait } from "../../../src/lib/workflow/types";
import { InMemoryRuntimeStorage } from "./storage-memory";

const ORG_ID = "org_admin_ops";

function makeContext(): RuntimeContext {
  return {
    storage: new InMemoryRuntimeStorage(),
    invokeTool: async () => ({ data: { ok: true } }),
    now: () => new Date(),
  };
}

describe("admin endpoints — manual resume (2c PR 3 M2)", () => {
  test("manual resume advances to on_resume.next without payload capture", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Manual resume",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "wait",
          type: "await_event",
          event: "form.submitted",
          on_resume: { capture: "submission", next: "after" },
          on_timeout: { next: null },
        },
        { id: "after", type: "mcp_tool_call", tool: "send_email", args: {}, next: null },
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

    // Manual resume: pass null payload to resumeWait with reason="manual".
    const result = await resumeWait(context, wait, "manual", null, null);
    assert.equal(result.resumed, true);

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");
    // capture is NOT populated on manual resume (no event payload).
    assert.equal(run!.captureScope.submission, undefined);
  });

  test("manual resume on already-claimed wait returns resumed=false", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Race test",
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
    const wait = Array.from(memory.waits.values()).find((w) => w.runId === runId)!;

    // Cron tick claims first (simulate via timeout resume).
    await resumeWait(context, wait, "timeout", null, null);
    // Now the admin endpoint tries manual — CAS fails.
    const manual = await resumeWait(context, wait, "manual", null, null);
    assert.equal(manual.resumed, false);
  });
});

describe("admin endpoints — cancel (2c PR 3 M2)", () => {
  test("cancelling a waiting run clears pending waits + marks run cancelled", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Cancel test",
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
    const waitsBefore = Array.from(memory.waits.values()).filter((w) => w.runId === runId && !w.resumedAt);
    assert.equal(waitsBefore.length, 1);

    // Simulate the cancel endpoint's logic: claim all pending waits,
    // then mark run cancelled.
    for (const w of waitsBefore) {
      await context.storage.claimWait(w.id, "cancelled", null);
    }
    await context.storage.updateRun(runId, { status: "cancelled", currentStepId: null });

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "cancelled");
    assert.equal(run!.currentStepId, null);

    const waitsAfter = Array.from(memory.waits.values()).filter((w) => w.runId === runId && !w.resumedAt);
    assert.equal(waitsAfter.length, 0, "all pending waits claimed");
  });

  test("cancel-then-cron-tick: wait already claimed so cron can't race", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Race cancel",
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
    const wait: StoredWait = Array.from(memory.waits.values()).find((w) => w.runId === runId)!;

    // Cancel endpoint claims the wait.
    const cancelClaim = await context.storage.claimWait(wait.id, "cancelled", null);
    assert.equal(cancelClaim, true);

    // Cron tick tries to timeout the same wait — CAS fails.
    const cronClaim = await context.storage.claimWait(wait.id, "timeout", null);
    assert.equal(cronClaim, false, "cron tick can't reclaim a cancelled wait");
  });
});
