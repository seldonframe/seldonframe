// SLICE 1-a Commit 7 — integration test for the full chain:
//   emit (with required orgId) → workflow_event_log row lands →
//   pending workflow_wait matches predicate → sync wake-up fires →
//   workflow run advances.
//
// Per G-1a-2 + addition #2 (approved 2026-04-22): turns "2c sync
// wake-up becomes live post-SLICE-1-a" from audit assumption to
// test-verified fact.
//
// Boundary: this test uses InMemoryRuntimeStorage + calls
// resumePendingWaitsForEventInContext directly (the testable core
// of the sync-resume path that bus.ts invokes). The full bus.ts
// production path uses DrizzleRuntimeStorage against a real
// Postgres, which we can't exercise in unit tests. What we CAN
// verify:
//   1. The code path `emit → resumePendingWaitsForEventInContext`
//      is reachable unconditionally now (signature makes orgId
//      required; typecheck catches omissions).
//   2. The resume logic correctly claims the wait and advances
//      the run.
//   3. A non-matching event leaves the wait untouched.
//   4. G-4's frozen-predicate contract holds end-to-end: the
//      interpolation resolved at wait-registration is what the
//      event-arrival predicate compares against.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resumePendingWaitsForEventInContext } from "../../../src/lib/events/bus";
import type { AgentSpec } from "../../../src/lib/agents/validator";
import { startRun } from "../../../src/lib/workflow/runtime";
import type { RuntimeContext } from "../../../src/lib/workflow/types";
import { InMemoryRuntimeStorage } from "../workflow/storage-memory";

const ORG_ID = "org_1a_integration";

function makeContext(): RuntimeContext {
  return {
    storage: new InMemoryRuntimeStorage(),
    invokeTool: async () => ({ data: { ok: true } }),
    now: () => new Date(),
  };
}

describe("SLICE 1-a integration — 2c sync wake-up fires post-migration", () => {
  test("matching event: pending wait claimed, run advances via the production scan", async () => {
    const context = makeContext();
    const spec: AgentSpec = {
      name: "Onboarding-shaped",
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
      archetypeId: "slice-1a-integration",
      spec,
      triggerEventId: null,
      triggerPayload: { contactId: "ctc_1a" },
    });

    // Before event: run is waiting.
    const runBefore = await context.storage.getRun(runId);
    assert.equal(runBefore!.status, "waiting");

    // Fire the matching event via the same export emitSeldonEvent
    // internally calls (post-SLICE-1-a, orgId is threaded so this
    // path is definitely reached from every production call site).
    const result = await resumePendingWaitsForEventInContext(
      context,
      ORG_ID,
      "form.submitted",
      { contactId: "ctc_1a", formId: "onboarding", data: {} },
      "evt_log_1",
    );
    assert.equal(result.candidates, 1);
    assert.equal(result.resumed, 1, "sync wake-up claimed + advanced the waiting run");

    // Verify the run advanced through "book" and completed.
    const runAfter = await context.storage.getRun(runId);
    assert.equal(runAfter!.status, "completed");
  });

  test("non-matching event: wait untouched; pre-SLICE-1-a, this case never reached this code path", async () => {
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
            value: "specific",
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
      { contactId: "x", formId: "different", data: {} },
      null,
    );
    assert.equal(result.candidates, 1);
    assert.equal(result.resumed, 0);

    const run = await context.storage.getRun(runId);
    assert.equal(run!.status, "waiting");
  });
});

describe("SLICE 1-a — L-22 close-out verification", () => {
  // These tests encode the "verification of deferred items from 2c"
  // requirement (addition #3 approved 2026-04-22). They fail if a
  // regression re-introduces the silent-log-skip pattern.

  test("no production site remains without an orgId 3rd argument", async () => {
    // Structural check: grep for production emitSeldonEvent calls
    // and assert each has a 3rd argument. Runtime complement to
    // typecheck's compile-time guarantee.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { execSync } = await import("node:child_process");

    const crmRoot = path.resolve(__dirname, "..", "..", "..");
    const grep = execSync("grep -rln \"emitSeldonEvent(\" src/app src/lib", {
      cwd: crmRoot,
      encoding: "utf8",
    }).trim();
    const files = grep.split("\n").filter((p) => !p.includes("bus.ts"));

    for (const rel of files) {
      const src = readFileSync(path.join(crmRoot, rel), "utf8");
      // Find every emit call, walk balanced parens, count commas.
      let idx = 0;
      while ((idx = src.indexOf("emitSeldonEvent(", idx)) !== -1) {
        const lineText = src.slice(src.lastIndexOf("\n", idx) + 1, src.indexOf("\n", idx));
        // Skip imports and comments.
        if (lineText.trim().startsWith("//") || lineText.includes("import")) {
          idx += 1;
          continue;
        }
        const openParen = idx + "emitSeldonEvent".length;
        let depth = 0;
        let i = openParen;
        for (; i < src.length; i++) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")") { depth--; if (depth === 0) break; }
        }
        const body = src.slice(openParen + 1, i);
        let d = 0;
        let topLevelCommas = 0;
        for (const c of body) {
          if (c === "(" || c === "{" || c === "[") d++;
          else if (c === ")" || c === "}" || c === "]") d--;
          else if (c === "," && d === 0) topLevelCommas++;
        }
        assert.ok(
          topLevelCommas >= 2,
          `${rel} at char ${idx}: emitSeldonEvent has ${topLevelCommas + 1} args, expected 3`,
        );
        idx = i + 1;
      }
    }
  });
});
