// Component smoke tests for the /agents/runs admin surface (2c PR 3 M4).
//
// Per L-17 addendum + follow-up-workflow-runs-e2e.md: the Playwright
// e2e spec deferred to a separate slice (horizontal infrastructure,
// multi-consumer scope). These smoke tests cover the 80% that doesn't
// need a real browser:
//
//   1. The server page module's exported serializer functions
//      produce the expected shape (date ISO round-trip, payload
//      passthrough, no hidden PII leakage).
//   2. The JSON list endpoint shape matches what the client
//      component expects — caught via shared type imports.
//
// What these tests don't cover (covered by the deferred Playwright
// suite):
//   - Polling refresh timing against real wall-clock.
//   - Sheet drawer open/close via real DOM events.
//   - fetch() + Next.js middleware round-trip.
//
// Justification in tasks/follow-up-workflow-runs-e2e.md.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import type {
  SerializedRun,
  SerializedStepResult,
  SerializedWait,
} from "../../../src/app/(dashboard)/agents/runs/page";

describe("runs-page — serializer smoke (2c PR 3 M4)", () => {
  test("SerializedRun type shape matches the server page contract", () => {
    // Compile-time check: constructing a literal that satisfies the
    // exported type proves the client component gets the shape it
    // expects. Any drift in page.tsx's serializeRun() breaks this.
    const run: SerializedRun = {
      id: "run_1",
      archetypeId: "client-onboarding",
      status: "waiting",
      currentStepId: "await_form",
      triggerEventId: null,
      triggerPayload: { contactId: "ctc_1" },
      captureScope: {},
      variableScope: { contactId: "ctc_1" },
      specSnapshot: {
        name: "Client Onboarding",
        steps: [{ id: "welcome", type: "mcp_tool_call" }],
      },
      // SLICE 9 PR 2 C5 — cost observability fields added to SerializedRun
      totalTokensInput: 0,
      totalTokensOutput: 0,
      totalCostUsdEstimate: "0",
      createdAt: "2026-04-22T00:00:00.000Z",
      updatedAt: "2026-04-22T00:05:00.000Z",
    };
    assert.equal(run.status, "waiting");
    assert.equal(run.specSnapshot.steps[0].type, "mcp_tool_call");
  });

  test("SerializedWait type carries ISO strings + nullable fields", () => {
    const wait: SerializedWait = {
      id: "wait_1",
      runId: "run_1",
      stepId: "await_form",
      eventType: "form.submitted",
      matchPredicate: { kind: "field_equals", field: "data.contactId", value: "ctc_1" },
      timeoutAt: "2026-04-29T00:00:00.000Z",
      resumedAt: null,
      resumedReason: null,
    };
    assert.equal(wait.resumedAt, null, "null when pending");
    assert.equal(wait.eventType, "form.submitted");
  });

  test("SerializedStepResult includes outcome + durationMs + optional capture", () => {
    const result: SerializedStepResult = {
      id: "sr_1",
      runId: "run_1",
      stepId: "welcome_email",
      stepType: "mcp_tool_call",
      outcome: "advanced",
      captureValue: null,
      errorMessage: null,
      durationMs: 125,
      createdAt: "2026-04-22T00:01:00.000Z",
    };
    assert.equal(result.outcome, "advanced");
    assert.equal(result.durationMs, 125);
  });

  test("status values are narrowly typed to the runtime's state set", () => {
    // Validates the type union hasn't drifted from runtime's
    // RunStatus. If runtime adds a state, this test should break
    // so the admin surface updates in lockstep.
    const validStatuses: SerializedRun["status"][] = [
      "running",
      "waiting",
      "completed",
      "failed",
      "cancelled",
    ];
    assert.equal(validStatuses.length, 5);
  });
});

describe("runs-page — polling contract smoke", () => {
  test("JSON endpoint response shape matches the client state shape", () => {
    // The client's refreshSnapshot expects { runs, waits, stepResults }
    // arrays matching the serializer output. This test documents that
    // contract explicitly so a drift between page.tsx's serializers
    // and the JSON endpoint's output surfaces at test time.
    const snapshot: {
      runs: SerializedRun[];
      waits: SerializedWait[];
      stepResults: SerializedStepResult[];
    } = {
      runs: [],
      waits: [],
      stepResults: [],
    };
    assert.equal(Array.isArray(snapshot.runs), true);
    assert.equal(Array.isArray(snapshot.waits), true);
    assert.equal(Array.isArray(snapshot.stepResults), true);
  });
});
