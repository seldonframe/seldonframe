// Tests for the request_approval step schema + cross-ref validator.
// SLICE 10 PR 1 C1 per audit §3 + Max's gate-resolution prompt.
//
// Coverage:
// 1. Discriminated approver union — operator | client_owner | user_id
//    parse cleanly; unknown approver type rejected.
// 2. Discriminated timeout union — abort/seconds, auto_approve/seconds,
//    wait_indefinitely (no seconds; .strict() rejects). Per G-10-2,
//    structural enforcement at schema level.
// 3. Context block — title (1-120), summary (1-600), preview (≤4000),
//    metadata (record). Bounds enforced.
// 4. .strict() at top — extra top-level fields rejected.
// 5. Cross-ref edges — next_on_approve + next_on_reject references
//    must point to declared step ids; null = terminate; unknown =
//    unknown_step_next.
// 6. Runtime user_id rejection — schema accepts user_id approver
//    type but the validator surfaces approver_unsupported_in_v1
//    so v1 deployments don't silently allow unsupported approver
//    bindings (per G-10-1 "schema must accommodate eventually but
//    only operator + client_owner have runtime support in v1").

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  validateAgentSpec,
  type BlockRegistry,
  type EventRegistry,
} from "../../src/lib/agents/validator";

// ---------------------------------------------------------------------
// Test scaffolding (mirrors validator.spec.ts conventions)
// ---------------------------------------------------------------------

const emptyRegistry: BlockRegistry = {
  tools: new Map(),
  producesByBlock: new Map(),
};

const testEventRegistry: EventRegistry = {
  events: [
    { type: "contact.created", fields: { contactId: { rawType: "string", nullable: false } } },
  ],
};

// Build a spec wrapping a single request_approval step + two trivial
// destination steps for next_on_approve / next_on_reject.
const spec = (step: Record<string, unknown>) => ({
  name: "x",
  description: "x",
  trigger: { type: "event", event: "contact.created" },
  steps: [
    step,
    { id: "approve_target", type: "wait", seconds: 0, next: null },
    { id: "reject_target", type: "wait", seconds: 0, next: null },
  ],
});

const minimalApprovalStep = (over: Record<string, unknown> = {}) => ({
  id: "needs_review",
  type: "request_approval",
  approver: { type: "operator" },
  context: { title: "Approve send", summary: "Outbound message ready" },
  timeout: { action: "abort", seconds: 3600 },
  next_on_approve: "approve_target",
  next_on_reject: "reject_target",
  ...over,
});

// ---------------------------------------------------------------------
// Approver discriminated union (G-10-1)
// ---------------------------------------------------------------------

describe("request_approval approver union — three types accepted by schema (G-10-1)", () => {
  test("approver=operator parses without spec_malformed", () => {
    const issues = validateAgentSpec(spec(minimalApprovalStep({ approver: { type: "operator" } })), emptyRegistry, testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), JSON.stringify(issues));
  });

  test("approver=client_owner parses without spec_malformed", () => {
    const issues = validateAgentSpec(spec(minimalApprovalStep({ approver: { type: "client_owner" } })), emptyRegistry, testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), JSON.stringify(issues));
  });

  test("approver=user_id with valid uuid parses (schema-level), but surfaces approver_unsupported_in_v1 (G-10-1 runtime carve-out)", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({
        approver: { type: "user_id", userId: "00000000-0000-4000-8000-000000000001" },
      })),
      emptyRegistry,
      testEventRegistry,
    );
    // Schema accepts the shape …
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), `unexpected spec_malformed: ${JSON.stringify(issues)}`);
    // … but the validator emits approver_unsupported_in_v1 so v1
    // deployments don't silently allow user_id approvers without
    // runtime support landing in v1.1.
    assert.ok(
      issues.some((i) => i.code === "approver_unsupported_in_v1" && i.stepId === "needs_review"),
      `expected approver_unsupported_in_v1; got: ${JSON.stringify(issues)}`,
    );
  });

  test("approver=user_id with invalid uuid surfaces spec_malformed (Zod uuid())", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ approver: { type: "user_id", userId: "not-a-uuid" } })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.code === "spec_malformed"), JSON.stringify(issues));
  });

  test("approver missing surfaces an issue on the step (UnknownStep fallthrough)", () => {
    const stepNoApprover = minimalApprovalStep();
    delete (stepNoApprover as Record<string, unknown>).approver;
    const issues = validateAgentSpec(spec(stepNoApprover), emptyRegistry, testEventRegistry);
    // Per the existing validator pattern: malformed step shapes
    // fall through the discriminated union to UnknownStepSchema and
    // surface via re-parse in validateStep. Core invariant: the
    // step is NOT silently accepted.
    assert.ok(issues.some((i) => i.stepId === "needs_review"), `expected an issue on needs_review; got: ${JSON.stringify(issues)}`);
  });

  test("approver of unknown type (e.g., 'admin') rejected", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ approver: { type: "admin" } })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.stepId === "needs_review"), JSON.stringify(issues));
  });
});

// ---------------------------------------------------------------------
// Timeout discriminated union (G-10-2)
// ---------------------------------------------------------------------

describe("request_approval timeout union — three actions accepted; structural enforcement of seconds presence (G-10-2)", () => {
  test("timeout action=abort with seconds parses cleanly", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ timeout: { action: "abort", seconds: 3600 } })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), JSON.stringify(issues));
  });

  test("timeout action=auto_approve with seconds parses cleanly", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ timeout: { action: "auto_approve", seconds: 86400 } })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), JSON.stringify(issues));
  });

  test("timeout action=wait_indefinitely with NO seconds parses cleanly", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ timeout: { action: "wait_indefinitely" } })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), JSON.stringify(issues));
  });

  test("timeout action=wait_indefinitely WITH seconds rejected — .strict() (G-10-2 structural enforcement)", () => {
    // Adding seconds to wait_indefinitely is a definitive author error
    // (the variant explicitly omits seconds; .strict() rejects extras).
    // This is the L-22 structural enforcement guarantee — the spec
    // parser refuses the contradiction at parse time.
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ timeout: { action: "wait_indefinitely", seconds: 60 } })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.stepId === "needs_review"), JSON.stringify(issues));
  });

  test("timeout action=abort WITHOUT seconds rejected", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ timeout: { action: "abort" } })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.stepId === "needs_review"), JSON.stringify(issues));
  });

  test("timeout action=auto_approve WITHOUT seconds rejected", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ timeout: { action: "auto_approve" } })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.stepId === "needs_review"), JSON.stringify(issues));
  });

  test("timeout seconds out of range (negative, zero, or too large) rejected", () => {
    for (const seconds of [-1, 0, 2_592_001]) {
      const issues = validateAgentSpec(
        spec(minimalApprovalStep({ timeout: { action: "abort", seconds } })),
        emptyRegistry,
        testEventRegistry,
      );
      assert.ok(issues.some((i) => i.stepId === "needs_review"), `seconds=${seconds}: ${JSON.stringify(issues)}`);
    }
  });

  test("timeout missing entirely rejected", () => {
    const stepNoTimeout = minimalApprovalStep();
    delete (stepNoTimeout as Record<string, unknown>).timeout;
    const issues = validateAgentSpec(spec(stepNoTimeout), emptyRegistry, testEventRegistry);
    assert.ok(issues.some((i) => i.stepId === "needs_review"), JSON.stringify(issues));
  });
});

// ---------------------------------------------------------------------
// Context block bounds
// ---------------------------------------------------------------------

describe("request_approval context — bounds enforced", () => {
  test("title at length 120 OK; 121 rejected", () => {
    const ok = "a".repeat(120);
    const tooLong = "a".repeat(121);
    assert.ok(
      !validateAgentSpec(spec(minimalApprovalStep({ context: { title: ok, summary: "x" } })), emptyRegistry, testEventRegistry).some((i) => i.code === "spec_malformed"),
    );
    assert.ok(
      validateAgentSpec(spec(minimalApprovalStep({ context: { title: tooLong, summary: "x" } })), emptyRegistry, testEventRegistry).some((i) => i.stepId === "needs_review"),
    );
  });

  test("summary at length 600 OK; 601 rejected", () => {
    const ok = "a".repeat(600);
    const tooLong = "a".repeat(601);
    assert.ok(
      !validateAgentSpec(spec(minimalApprovalStep({ context: { title: "x", summary: ok } })), emptyRegistry, testEventRegistry).some((i) => i.code === "spec_malformed"),
    );
    assert.ok(
      validateAgentSpec(spec(minimalApprovalStep({ context: { title: "x", summary: tooLong } })), emptyRegistry, testEventRegistry).some((i) => i.stepId === "needs_review"),
    );
  });

  test("preview optional; at length 4000 OK; 4001 rejected", () => {
    const ok = "a".repeat(4000);
    const tooLong = "a".repeat(4001);
    assert.ok(
      !validateAgentSpec(
        spec(minimalApprovalStep({ context: { title: "x", summary: "y", preview: ok } })),
        emptyRegistry,
        testEventRegistry,
      ).some((i) => i.code === "spec_malformed"),
    );
    assert.ok(
      validateAgentSpec(
        spec(minimalApprovalStep({ context: { title: "x", summary: "y", preview: tooLong } })),
        emptyRegistry,
        testEventRegistry,
      ).some((i) => i.stepId === "needs_review"),
    );
  });

  test("metadata accepts arbitrary record", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ context: { title: "x", summary: "y", metadata: { recipientCount: 800, channel: "sms" } } })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "spec_malformed"), JSON.stringify(issues));
  });

  test("missing context rejected", () => {
    const stepNoCtx = minimalApprovalStep();
    delete (stepNoCtx as Record<string, unknown>).context;
    assert.ok(validateAgentSpec(spec(stepNoCtx), emptyRegistry, testEventRegistry).some((i) => i.stepId === "needs_review"));
  });

  test("empty title or summary rejected (min 1)", () => {
    assert.ok(
      validateAgentSpec(spec(minimalApprovalStep({ context: { title: "", summary: "x" } })), emptyRegistry, testEventRegistry).some((i) => i.stepId === "needs_review"),
    );
    assert.ok(
      validateAgentSpec(spec(minimalApprovalStep({ context: { title: "x", summary: "" } })), emptyRegistry, testEventRegistry).some((i) => i.stepId === "needs_review"),
    );
  });
});

// ---------------------------------------------------------------------
// Cross-ref edges
// ---------------------------------------------------------------------

describe("request_approval cross-ref — next_on_approve + next_on_reject must reference declared step ids", () => {
  test("both next_on_approve + next_on_reject pointing to existing steps OK", () => {
    const issues = validateAgentSpec(spec(minimalApprovalStep()), emptyRegistry, testEventRegistry);
    assert.ok(!issues.some((i) => i.code === "unknown_step_next"), JSON.stringify(issues));
  });

  test("next_on_approve = null (terminate) OK", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ next_on_approve: null })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "unknown_step_next"), JSON.stringify(issues));
  });

  test("next_on_reject = null (terminate) OK", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ next_on_reject: null })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(!issues.some((i) => i.code === "unknown_step_next"), JSON.stringify(issues));
  });

  test("next_on_approve referencing a non-existent step → unknown_step_next", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ next_on_approve: "missing_step" })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(
      issues.some((i) => i.code === "unknown_step_next" && i.path === "next_on_approve" && i.stepId === "needs_review"),
      JSON.stringify(issues),
    );
  });

  test("next_on_reject referencing a non-existent step → unknown_step_next", () => {
    const issues = validateAgentSpec(
      spec(minimalApprovalStep({ next_on_reject: "ghost" })),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(
      issues.some((i) => i.code === "unknown_step_next" && i.path === "next_on_reject" && i.stepId === "needs_review"),
      JSON.stringify(issues),
    );
  });

  test("missing next_on_approve rejected (required, parallel to branch.on_match_next)", () => {
    const stepNoApprove = minimalApprovalStep();
    delete (stepNoApprove as Record<string, unknown>).next_on_approve;
    assert.ok(validateAgentSpec(spec(stepNoApprove), emptyRegistry, testEventRegistry).some((i) => i.stepId === "needs_review"));
  });

  test("missing next_on_reject rejected (required, parallel to branch.on_no_match_next)", () => {
    const stepNoReject = minimalApprovalStep();
    delete (stepNoReject as Record<string, unknown>).next_on_reject;
    assert.ok(validateAgentSpec(spec(stepNoReject), emptyRegistry, testEventRegistry).some((i) => i.stepId === "needs_review"));
  });
});

// ---------------------------------------------------------------------
// Top-level .strict()
// ---------------------------------------------------------------------

describe("request_approval top-level .strict() — extra fields rejected", () => {
  test("extra top-level field rejected (e.g., 'priority')", () => {
    const issues = validateAgentSpec(
      spec({ ...minimalApprovalStep(), priority: "high" }),
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.stepId === "needs_review"), JSON.stringify(issues));
  });
});

// ---------------------------------------------------------------------
// Cycle detection compatibility (request_approval should be a graph node)
// ---------------------------------------------------------------------

describe("request_approval participates in cycle detection (parallel to branch)", () => {
  test("cycle through next_on_approve detected", () => {
    // Build: needs_review → next_on_approve: approve_target → next: needs_review (cycle)
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          minimalApprovalStep({ next_on_approve: "approve_target" }),
          { id: "approve_target", type: "wait", seconds: 0, next: "needs_review" },
          { id: "reject_target", type: "wait", seconds: 0, next: null },
        ],
      },
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.code === "graph_cycle"), JSON.stringify(issues.filter((i) => i.code === "graph_cycle")));
  });

  test("cycle through next_on_reject detected", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [
          minimalApprovalStep({ next_on_reject: "reject_target" }),
          { id: "approve_target", type: "wait", seconds: 0, next: null },
          { id: "reject_target", type: "wait", seconds: 0, next: "needs_review" },
        ],
      },
      emptyRegistry,
      testEventRegistry,
    );
    assert.ok(issues.some((i) => i.code === "graph_cycle"), JSON.stringify(issues.filter((i) => i.code === "graph_cycle")));
  });
});

// ---------------------------------------------------------------------
// Unsupported step type message updated to mention 9 types
// ---------------------------------------------------------------------

describe("validator's unsupported_step_type message lists 9 known types (count update for SLICE 10)", () => {
  test("unknown step type's message references nine types incl. request_approval", () => {
    const issues = validateAgentSpec(
      {
        name: "x",
        description: "x",
        trigger: { type: "event", event: "contact.created" },
        steps: [{ id: "weird", type: "made_up_type", next: null }],
      },
      emptyRegistry,
      testEventRegistry,
    );
    const unsup = issues.find((i) => i.code === "unsupported_step_type");
    assert.ok(unsup, "expected unsupported_step_type for made_up_type");
    assert.ok(
      unsup!.message.includes("request_approval"),
      `expected message to mention request_approval; got: ${unsup!.message}`,
    );
  });
});
