// Deterministic replay — Reelier phase 2c slice 1 (OBSERVE MODE ONLY).
// writeWorkflowTrace: FAIL-SOFT BY CONTRACT — a throwing insert must resolve
// (never reject) and must never surface to the caller. Mirrors
// tests/unit/agent-receipts/write.spec.ts's contract exactly.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { writeWorkflowTrace, type WriteWorkflowTraceInput } from "@/lib/deployments/replay/persist";
import { makeMetaRecord } from "@/lib/deployments/replay/trace-format";

const ORG = "org_1";
const DEPLOYMENT = "dep_1";

function baseInput(overrides: Partial<WriteWorkflowTraceInput> = {}): WriteWorkflowTraceInput {
  return {
    orgId: ORG,
    deploymentId: DEPLOYMENT,
    triggerKind: "email",
    triggerKey: "msg_1",
    startedAt: new Date("2026-07-17T00:00:00.000Z"),
    finishedAt: new Date("2026-07-17T00:00:05.000Z"),
    ok: true,
    callCount: 1,
    records: [makeMetaRecord({ name: "email:dep_1", startedAt: "2026-07-17T00:00:00.000Z", wrapped: [] })],
    ...overrides,
  };
}

describe("writeWorkflowTrace — happy path", () => {
  test("inserts a row with the given fields, org-scoped", async () => {
    let inserted: unknown = null;
    await writeWorkflowTrace(baseInput(), {
      insert: async (row) => {
        inserted = row;
      },
    });
    assert.ok(inserted);
    const row = inserted as Record<string, unknown>;
    assert.equal(row.orgId, ORG);
    assert.equal(row.deploymentId, DEPLOYMENT);
    assert.equal(row.triggerKind, "email");
    assert.equal(row.triggerKey, "msg_1");
    assert.equal(row.ok, true);
    assert.equal(row.callCount, 1);
    assert.equal(row.inputTokens, 0);
    assert.equal(row.outputTokens, 0);
  });

  test("carries records through verbatim", async () => {
    let inserted: unknown = null;
    const records = baseInput().records;
    await writeWorkflowTrace(baseInput({ records }), {
      insert: async (row) => {
        inserted = row;
      },
    });
    const row = inserted as { records: unknown };
    assert.deepEqual(row.records, records);
  });

  test("null deploymentId / triggerKey pass through as null (not undefined)", async () => {
    let inserted: unknown = null;
    await writeWorkflowTrace(baseInput({ deploymentId: null, triggerKey: null }), {
      insert: async (row) => {
        inserted = row;
      },
    });
    const row = inserted as Record<string, unknown>;
    assert.equal(row.deploymentId, null);
    assert.equal(row.triggerKey, null);
  });
});

describe("writeWorkflowTrace — FAIL-SOFT BY CONTRACT", () => {
  test("a throwing insert resolves (never rejects) — the run must never be blocked", async () => {
    await assert.doesNotReject(
      writeWorkflowTrace(baseInput(), {
        insert: async () => {
          throw new Error("db unavailable");
        },
      }),
    );
  });

  test("missing/blank orgId short-circuits without ever calling insert", async () => {
    let insertCalled = false;
    await writeWorkflowTrace(baseInput({ orgId: "" }), {
      insert: async () => {
        insertCalled = true;
      },
    });
    assert.equal(insertCalled, false);
  });
});
