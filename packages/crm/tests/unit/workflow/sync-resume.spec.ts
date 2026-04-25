// Sync-resume tests (2c PR 2 M3).
//
// Exercises resumePendingWaitsForEventInContext — the testable core
// of the emit-time wake-up scan. Confirms G-4 (frozen predicate)
// comparison works at event-arrival time, G-2 resume is synchronous,
// and non-matching events leave waits untouched.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type { AgentSpec } from "../../../src/lib/agents/validator";
import { resumePendingWaitsForEventInContext } from "../../../src/lib/events/bus";
import { startRun } from "../../../src/lib/workflow/runtime";
import type { RuntimeContext } from "../../../src/lib/workflow/types";
import { InMemoryRuntimeStorage } from "./storage-memory";

const ORG_ID = "org_sync_01";

function makeContext(now = new Date()): RuntimeContext {
  return {
    storage: new InMemoryRuntimeStorage(),
    invokeTool: async () => ({ data: { ok: true } }),
    now: () => now,
  };
}

describe("sync resume — resumePendingWaitsForEventInContext", () => {
  test("matching event resumes the wait and advances the run (G-2)", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Sync resume",
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
          on_resume: { capture: "submission", next: "book" },
          on_timeout: { next: null },
        },
        { id: "book", type: "mcp_tool_call", tool: "create_booking", args: {}, next: null },
      ],
    };
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: { contactId: "ctc_abc" },
    });

    // Before event: run is waiting.
    let run = await context.storage.getRun(runId);
    assert.equal(run!.status, "waiting");

    // Fire the matching event.
    const result = await resumePendingWaitsForEventInContext(
      context,
      ORG_ID,
      "form.submitted",
      { contactId: "ctc_abc", formId: "f_intake", data: {} },
      "evt_log_1",
    );

    assert.equal(result.candidates, 1);
    assert.equal(result.resumed, 1);

    // Run advanced through "book" and completed.
    run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");
    // Capture populated with event data.
    assert.equal((run!.captureScope.submission as { contactId: string }).contactId, "ctc_abc");
  });

  test("non-matching predicate leaves the wait untouched", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Non-match",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "await_form",
          type: "await_event",
          event: "form.submitted",
          match: {
            kind: "field_equals",
            field: "data.formId",
            value: "specific_form",
          },
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

    const result = await resumePendingWaitsForEventInContext(
      context,
      ORG_ID,
      "form.submitted",
      { contactId: "anyone", formId: "different_form", data: {} },
      "evt_log_1",
    );
    assert.equal(result.candidates, 1, "candidate wait was found by type");
    assert.equal(result.resumed, 0, "predicate didn't match, so no resume");

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "waiting");
  });

  test("different orgId isolates waits — no cross-org resume", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Org isolation",
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
    await startRun(context, {
      orgId: "org_A",
      archetypeId: "test",
      spec,
      triggerEventId: null,
      triggerPayload: {},
    });

    const result = await resumePendingWaitsForEventInContext(
      context,
      "org_B",
      "form.submitted",
      { contactId: "x", formId: "y", data: {} },
      null,
    );
    assert.equal(result.candidates, 0, "org_A's wait is invisible to org_B");
  });

  test("no pending wait for eventType = no candidates, no error", async () => {
    const context = makeContext();
    const result = await resumePendingWaitsForEventInContext(
      context,
      ORG_ID,
      "form.submitted",
      { contactId: "x", formId: "y", data: {} },
      null,
    );
    assert.equal(result.candidates, 0);
    assert.equal(result.resumed, 0);
  });

  test("predicate with all/any composites matches correctly", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Composite",
      description: "x",
      trigger: { type: "event", event: "contact.created" },
      steps: [
        {
          id: "await",
          type: "await_event",
          event: "form.submitted",
          match: {
            kind: "all",
            of: [
              { kind: "field_equals", field: "data.formId", value: "f_intake" },
              { kind: "field_exists", field: "data.contactId" },
            ],
          },
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

    // Both conditions satisfied.
    const matchResult = await resumePendingWaitsForEventInContext(
      context,
      ORG_ID,
      "form.submitted",
      { contactId: "ctc_1", formId: "f_intake", data: {} },
      null,
    );
    assert.equal(matchResult.resumed, 1);
    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "completed");
  });
});
