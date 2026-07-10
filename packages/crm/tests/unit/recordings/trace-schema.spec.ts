import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WorkflowTraceSchema,
  FlowModelSchema,
  CoverageEntrySchema,
  TranscriptSegmentSchema,
} from "@/lib/recordings/trace-schema";

// ─── fixture helper ────────────────────────────────────────────────────────

function validTrace(overrides: Record<string, unknown> = {}) {
  return {
    title: "Book a follow-up call",
    goal: "Schedule a follow-up call after a sales demo",
    apps: ["gmail", "calendly"],
    steps: [
      {
        index: 0,
        app: "gmail",
        action: "read email",
        intent: "find the demo attendee's reply",
        dataIn: ["inbox"],
        dataOut: ["attendee email"],
        checks: ["attendee replied"],
      },
      {
        index: 1,
        app: "calendly",
        action: "create booking link",
        intent: "send a scheduling link",
        dataIn: ["attendee email"],
        dataOut: ["booking link"],
        checks: ["link is valid"],
      },
    ],
    variables: ["attendee email"],
    constants: ["30 minute call"],
    branches: [{ condition: "attendee has no reply", behavior: "send a reminder" }],
    openQuestions: ["what timezone to default to"],
    ...overrides,
  };
}

// ─── TranscriptSegmentSchema ───────────────────────────────────────────────

test("TranscriptSegmentSchema accepts a valid segment", () => {
  const result = TranscriptSegmentSchema.safeParse({ atMs: 1000, text: "clicked send" });
  assert.equal(result.success, true);
});

test("TranscriptSegmentSchema rejects missing text", () => {
  const result = TranscriptSegmentSchema.safeParse({ atMs: 1000 });
  assert.equal(result.success, false);
});

// ─── WorkflowTraceSchema: happy path ───────────────────────────────────────

test("WorkflowTraceSchema accepts a valid trace", () => {
  const result = WorkflowTraceSchema.safeParse(validTrace());
  assert.equal(result.success, true);
});

// ─── min(1) edges on title/goal/app/action/intent ──────────────────────────

test("WorkflowTraceSchema rejects empty title", () => {
  const result = WorkflowTraceSchema.safeParse(validTrace({ title: "" }));
  assert.equal(result.success, false);
});

test("WorkflowTraceSchema rejects empty goal", () => {
  const result = WorkflowTraceSchema.safeParse(validTrace({ goal: "" }));
  assert.equal(result.success, false);
});

test("WorkflowTraceSchema rejects a step with empty app", () => {
  const trace = validTrace();
  (trace.steps[0] as { app: string }).app = "";
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
});

test("WorkflowTraceSchema rejects a step with empty action", () => {
  const trace = validTrace();
  (trace.steps[0] as { action: string }).action = "";
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
});

test("WorkflowTraceSchema rejects a step with empty intent", () => {
  const trace = validTrace();
  (trace.steps[0] as { intent: string }).intent = "";
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
});

// ─── steps.min(1) ───────────────────────────────────────────────────────────

test("WorkflowTraceSchema rejects empty steps array", () => {
  const result = WorkflowTraceSchema.safeParse(validTrace({ steps: [] }));
  assert.equal(result.success, false);
});

// ─── index int >= 0 ─────────────────────────────────────────────────────────

test("WorkflowTraceSchema rejects a negative step index", () => {
  const trace = validTrace();
  trace.steps[0].index = -1;
  // shift others so ascending-from-0 isn't also the failure reason being tested
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
});

test("WorkflowTraceSchema rejects a non-integer step index", () => {
  const trace = validTrace();
  (trace.steps[0] as { index: number }).index = 0.5;
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
});

// ─── superRefine (a): step indexes strictly ascending from 0 ──────────────

test("WorkflowTraceSchema accepts strictly ascending indexes from 0", () => {
  const result = WorkflowTraceSchema.safeParse(validTrace());
  assert.equal(result.success, true);
});

test("WorkflowTraceSchema rejects non-ascending step indexes", () => {
  const trace = validTrace();
  trace.steps[1].index = 0; // duplicate, not ascending
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
});

test("WorkflowTraceSchema rejects indexes not starting at 0", () => {
  const trace = validTrace();
  trace.steps[0].index = 1;
  trace.steps[1].index = 2;
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
});

test("WorkflowTraceSchema rejects a skipped index", () => {
  const trace = validTrace();
  trace.steps[1].index = 2; // skips 1
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
});

// ─── superRefine (b): every branches[].condition non-empty ─────────────────

test("WorkflowTraceSchema rejects an empty branch condition", () => {
  const trace = validTrace({ branches: [{ condition: "", behavior: "do something" }] });
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
});

test("WorkflowTraceSchema accepts an empty branches array", () => {
  const result = WorkflowTraceSchema.safeParse(validTrace({ branches: [] }));
  assert.equal(result.success, true);
});

// ─── superRefine (c): apps must contain every distinct steps[].app ─────────

test("WorkflowTraceSchema rejects a step app missing from apps[]", () => {
  const trace = validTrace({ apps: ["gmail"] }); // missing "calendly" used by step 1
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, false);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join(" ");
    assert.match(message, /calendly/);
  }
});

test("WorkflowTraceSchema accepts when apps[] lists a superset", () => {
  const trace = validTrace({ apps: ["gmail", "calendly", "slack"] });
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, true);
});

// ─── optional decision ──────────────────────────────────────────────────────

test("WorkflowTraceSchema accepts a step without decision", () => {
  const trace = validTrace();
  assert.equal("decision" in trace.steps[0], false);
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, true);
});

test("WorkflowTraceSchema accepts a step with decision present", () => {
  const trace = validTrace();
  (trace.steps[0] as Record<string, unknown>).decision = "if attendee replied, proceed";
  const result = WorkflowTraceSchema.safeParse(trace);
  assert.equal(result.success, true);
});

// ─── CoverageEntrySchema ────────────────────────────────────────────────────

test("CoverageEntrySchema accepts green with toolkit", () => {
  const result = CoverageEntrySchema.safeParse({
    stepIndex: 0,
    tier: "green",
    toolkit: "gmail",
    reason: "matched gmail",
  });
  assert.equal(result.success, true);
});

test("CoverageEntrySchema rejects green without toolkit", () => {
  const result = CoverageEntrySchema.safeParse({
    stepIndex: 0,
    tier: "green",
    reason: "matched something",
  });
  assert.equal(result.success, false);
});

test("CoverageEntrySchema accepts yellow without toolkit", () => {
  const result = CoverageEntrySchema.safeParse({
    stepIndex: 0,
    tier: "yellow",
    reason: "likely API-doable",
  });
  assert.equal(result.success, true);
});

test("CoverageEntrySchema accepts red without toolkit", () => {
  const result = CoverageEntrySchema.safeParse({
    stepIndex: 0,
    tier: "red",
    reason: "no tool binding",
  });
  assert.equal(result.success, true);
});

test("CoverageEntrySchema rejects an unknown tier", () => {
  const result = CoverageEntrySchema.safeParse({
    stepIndex: 0,
    tier: "blue",
    reason: "??",
  });
  assert.equal(result.success, false);
});

// ─── FlowModelSchema ────────────────────────────────────────────────────────

test("FlowModelSchema accepts a valid model", () => {
  const model = {
    ...validTrace(),
    recordingsSeen: 1,
    coverage: [
      { stepIndex: 0, tier: "green", toolkit: "gmail", reason: "matched gmail" },
      { stepIndex: 1, tier: "yellow", reason: "likely API-doable" },
    ],
  };
  const result = FlowModelSchema.safeParse(model);
  assert.equal(result.success, true);
});

test("FlowModelSchema rejects recordingsSeen of 0", () => {
  const model = { ...validTrace(), recordingsSeen: 0, coverage: [] };
  const result = FlowModelSchema.safeParse(model);
  assert.equal(result.success, false);
});

test("FlowModelSchema rejects a non-integer recordingsSeen", () => {
  const model = { ...validTrace(), recordingsSeen: 1.5, coverage: [] };
  const result = FlowModelSchema.safeParse(model);
  assert.equal(result.success, false);
});

test("FlowModelSchema still enforces WorkflowTrace edges (app must be listed)", () => {
  const model = {
    ...validTrace({ apps: ["gmail"] }),
    recordingsSeen: 1,
    coverage: [],
  };
  const result = FlowModelSchema.safeParse(model);
  assert.equal(result.success, false);
});
