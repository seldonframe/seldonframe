// Client Onboarding end-to-end integration test (2c PR 2 M4).
//
// Drives a Client-Onboarding-shaped AgentSpec through the full
// runtime lifecycle + sync resume + timeout path. Uses
// InMemoryRuntimeStorage so the test is DB-free; same code paths
// that production will run.
//
// The archetype itself (packages/crm/src/lib/agents/archetypes/
// client-onboarding.ts) is NOT shipped yet — that's 3b scope. This
// test inlines a representative spec per audit §1.2 to drive the
// runtime through its paces ahead of archetype ship.
//
// Goal per PR 2 brief:
//   - Start run with mock trigger payload.
//   - Verify advancement through welcome_email, share_form_link.
//   - Verify pause on await_form with correct resolved predicate.
//   - Simulate form.submitted event emission.
//   - Verify synchronous resume + advancement to book_kickoff +
//     kickoff_confirm + completion.
//   - Assert structural stability across 3 runs.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import type { AgentSpec } from "../../../src/lib/agents/validator";
import { resumePendingWaitsForEventInContext } from "../../../src/lib/events/bus";
import { resumeWait, startRun } from "../../../src/lib/workflow/runtime";
import type { RuntimeContext, StoredRun, StoredWait } from "../../../src/lib/workflow/types";
import { InMemoryRuntimeStorage } from "./storage-memory";

const ORG_ID = "org_onboarding";

const CLIENT_ONBOARDING_SPEC: AgentSpec = {
  name: "Client Onboarding",
  description: "Welcome new contacts, share intake form, schedule kickoff once submitted.",
  trigger: { type: "event", event: "contact.created" },
  variables: {
    contactId: "trigger.contactId",
    firstName: "trigger.firstName",
    email: "trigger.email",
  },
  steps: [
    {
      id: "welcome_email",
      type: "mcp_tool_call",
      tool: "send_email",
      args: {
        to: "{{email}}",
        subject: "Welcome {{firstName}}",
        body: "Thanks for signing up — quick intake form next.",
      },
      next: "share_form_link",
    },
    {
      id: "share_form_link",
      type: "mcp_tool_call",
      tool: "send_email",
      args: {
        to: "{{email}}",
        subject: "One quick form",
        body: "Please complete the onboarding intake at [url].",
      },
      next: "await_form",
    },
    {
      id: "await_form",
      type: "await_event",
      event: "form.submitted",
      match: {
        kind: "all",
        of: [
          { kind: "field_equals", field: "data.contactId", value: "{{contactId}}" },
          { kind: "field_equals", field: "data.formId", value: "onboarding_intake" },
        ],
      },
      timeout: "P7D",
      on_resume: { capture: "submission", next: "book_kickoff" },
      on_timeout: { next: "nudge_email" },
    },
    {
      id: "book_kickoff",
      type: "mcp_tool_call",
      tool: "create_booking",
      args: {
        contact_id: "{{contactId}}",
        appointment_type_id: "appt_kickoff",
        notes: "Onboarding intake completed; auto-booked.",
      },
      next: "kickoff_confirm",
    },
    {
      id: "kickoff_confirm",
      type: "mcp_tool_call",
      tool: "send_email",
      args: {
        to: "{{email}}",
        subject: "Kickoff booked",
        body: "Your onboarding kickoff is scheduled. See you there.",
      },
      next: null,
    },
    {
      id: "nudge_email",
      type: "mcp_tool_call",
      tool: "send_email",
      args: {
        to: "{{email}}",
        subject: "Still there?",
        body: "Haven't seen your intake yet — takes 3 minutes.",
      },
      next: null,
    },
  ],
};

// Capture every tool invocation so tests can assert trace order.
type ToolCall = { tool: string; args: Record<string, unknown> };
function makeContext(frozenNow?: Date): { context: RuntimeContext; calls: ToolCall[] } {
  const calls: ToolCall[] = [];
  const context: RuntimeContext = {
    storage: new InMemoryRuntimeStorage(),
    invokeTool: async (tool, args) => {
      calls.push({ tool, args });
      return { data: { id: `stub_${tool}_${calls.length}` } };
    },
    now: () => frozenNow ?? new Date(),
  };
  return { context, calls };
}

// Hash the structural trace so we can compare across 3 runs and
// confirm determinism. Ignores tool-invocation `args` string values
// that carry dynamic content; keeps tool sequence + step id sequence
// + wait shape + capture names. Mirrors the 2b.2 structural-hash
// utility's approach but scoped to workflow runs.
function hashRunTrace(input: {
  calls: ToolCall[];
  run: StoredRun;
  waits: StoredWait[];
}): string {
  const skeleton = {
    toolSequence: input.calls.map((c) => c.tool),
    runStatus: input.run.status,
    currentStepId: input.run.currentStepId,
    captureKeys: Object.keys(input.run.captureScope).sort(),
    waitShapes: input.waits.map((w) => ({
      eventType: w.eventType,
      stepId: w.stepId,
      resumedReason: w.resumedReason,
    })),
  };
  return crypto.createHash("sha256").update(JSON.stringify(skeleton)).digest("hex").slice(0, 16);
}

async function runClientOnboarding(
  frozenNow: Date,
  options: { resolveWith: "event" | "timeout" },
): Promise<{ calls: ToolCall[]; run: StoredRun; waits: StoredWait[] }> {
  const { context, calls } = makeContext(frozenNow);
  const runId = await startRun(context, {
    orgId: ORG_ID,
    archetypeId: "client-onboarding",
    spec: CLIENT_ONBOARDING_SPEC,
    triggerEventId: null,
    triggerPayload: {
      contactId: "ctc_probe",
      firstName: "Ava",
      email: "ava@example.com",
    },
  });

  const memory = context.storage as InMemoryRuntimeStorage;

  // After startRun: 2 emails sent, paused on await_form.
  assert.equal(calls.length, 2, "welcome + share_form_link sent before pause");
  const run1 = await context.storage.getRun(runId);
  assert.equal(run1!.status, "waiting", "run paused at await_form");
  assert.equal(run1!.currentStepId, "await_form");

  const waitBefore = Array.from(memory.waits.values()).find((w) => w.runId === runId)!;
  assert.equal(waitBefore.eventType, "form.submitted");
  // G-4: predicate was frozen with literal contactId.
  const predicate = waitBefore.matchPredicate as {
    kind: string;
    of: Array<{ field: string; value: string }>;
  };
  assert.equal(predicate.of[0].value, "ctc_probe");
  assert.equal(predicate.of[1].value, "onboarding_intake");

  if (options.resolveWith === "event") {
    // Simulate the form submission event arriving.
    await resumePendingWaitsForEventInContext(
      context,
      ORG_ID,
      "form.submitted",
      {
        contactId: "ctc_probe",
        formId: "onboarding_intake",
        data: { intake_payload: "redacted" },
      },
      "evt_log_1",
    );
  } else {
    // Simulate the timeout cron tick firing after 7 days.
    const timeoutContext: RuntimeContext = {
      ...context,
      now: () => new Date(frozenNow.getTime() + 8 * 24 * 60 * 60 * 1000),
    };
    await resumeWait(timeoutContext, waitBefore, "timeout", null, null);
  }

  const run = (await context.storage.getRun(runId))!;
  const waits = Array.from(memory.waits.values()).filter((w) => w.runId === runId);
  return { calls, run, waits };
}

describe("Client Onboarding end-to-end (2c PR 2 M4)", () => {
  test("event-match path: 3 runs all complete at kickoff_confirm with preserved hash", async () => {
    const hashes: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const frozenNow = new Date("2026-04-22T10:00:00Z");
      const result = await runClientOnboarding(frozenNow, { resolveWith: "event" });

      assert.equal(result.run.status, "completed", `run ${i + 1} completed`);
      assert.equal(result.calls.length, 4, `run ${i + 1}: 4 tool calls (welcome + form link + booking + confirm)`);
      assert.equal(result.calls[0].tool, "send_email");
      assert.equal(result.calls[1].tool, "send_email");
      assert.equal(result.calls[2].tool, "create_booking");
      assert.equal(result.calls[3].tool, "send_email");

      // Capture scope has the event payload under "submission".
      assert.equal(
        (result.run.captureScope.submission as { contactId: string }).contactId,
        "ctc_probe",
      );

      // The booking tool call received the resolved contactId.
      assert.equal(result.calls[2].args.contact_id, "ctc_probe");

      hashes.push(hashRunTrace(result));
    }
    // All three runs produce the same structural trace hash.
    assert.equal(hashes[0], hashes[1]);
    assert.equal(hashes[1], hashes[2]);
  });

  test("timeout path: resolves to nudge_email", async () => {
    const frozenNow = new Date("2026-04-22T10:00:00Z");
    const result = await runClientOnboarding(frozenNow, { resolveWith: "timeout" });

    assert.equal(result.run.status, "completed");
    // 3 tool calls: welcome + form link + nudge. No booking.
    assert.equal(result.calls.length, 3);
    assert.equal(result.calls[2].tool, "send_email"); // nudge
    // Capture scope does NOT have "submission" — timeout path
    // doesn't bind.
    assert.equal(result.run.captureScope.submission, undefined);
  });

  test("non-matching event (wrong contactId) leaves the run paused", async () => {
    const { context } = makeContext();
    const runId = await startRun(context, {
      orgId: ORG_ID,
      archetypeId: "client-onboarding",
      spec: CLIENT_ONBOARDING_SPEC,
      triggerEventId: null,
      triggerPayload: { contactId: "ctc_original", firstName: "x", email: "x@y.com" },
    });

    // Simulate a form.submitted for a DIFFERENT contact.
    const result = await resumePendingWaitsForEventInContext(
      context,
      ORG_ID,
      "form.submitted",
      {
        contactId: "ctc_different",
        formId: "onboarding_intake",
        data: {},
      },
      "evt_log_x",
    );
    assert.equal(result.candidates, 1, "found the candidate by eventType");
    assert.equal(result.resumed, 0, "predicate didn't match, no resume");

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "waiting");
  });
});
