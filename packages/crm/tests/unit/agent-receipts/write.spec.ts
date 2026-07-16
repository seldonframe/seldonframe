// Agent receipts slice (Task 2) — writeRunReceipt: the fail-soft receipt
// writer. Spec: docs/superpowers/specs/2026-07-16-agent-receipts-design.md.
//
// FAIL-SOFT BY CONTRACT: a throwing insert must resolve (never reject) and
// must never surface to the caller — a receipt failure must NEVER fail or
// retry the underlying agent run.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  writeRunReceipt,
  deriveReceiptSummary,
  type WriteRunReceiptInput,
} from "../../../src/lib/agent-receipts/write";

const ORG = "org_1";
const DEPLOYMENT = "dep_1";

function baseInput(overrides: Partial<WriteRunReceiptInput> = {}): WriteRunReceiptInput {
  return {
    orgId: ORG,
    deploymentId: DEPLOYMENT,
    triggerKind: "push",
    sourceRef: "msg_1",
    status: "ok",
    ...overrides,
  };
}

describe("writeRunReceipt — happy path", () => {
  test("inserts a row with the given fields", async () => {
    let inserted: unknown = null;
    await writeRunReceipt(baseInput({ summary: "Forwarded to a@b.com" }), {
      insert: async (row) => {
        inserted = row;
      },
    });
    assert.ok(inserted);
    const row = inserted as Record<string, unknown>;
    assert.equal(row.orgId, ORG);
    assert.equal(row.deploymentId, DEPLOYMENT);
    assert.equal(row.triggerKind, "push");
    assert.equal(row.sourceRef, "msg_1");
    assert.equal(row.status, "ok");
    assert.equal(row.summary, "Forwarded to a@b.com");
    assert.deepEqual(row.toolCalls, []);
  });

  test("carries toolCalls through verbatim", async () => {
    let inserted: unknown = null;
    await writeRunReceipt(
      baseInput({
        toolCalls: [{ tool: "GMAIL_SEND_EMAIL", ok: true, note: "GMAIL_SEND_EMAIL succeeded." }],
      }),
      {
        insert: async (row) => {
          inserted = row;
        },
      },
    );
    const row = inserted as Record<string, unknown>;
    assert.deepEqual(row.toolCalls, [
      { tool: "GMAIL_SEND_EMAIL", ok: true, note: "GMAIL_SEND_EMAIL succeeded." },
    ]);
  });
});

describe("writeRunReceipt — fail-soft by contract", () => {
  test("a throwing insert resolves (never rejects) and never fails the caller", async () => {
    await assert.doesNotReject(async () => {
      await writeRunReceipt(baseInput(), {
        insert: async () => {
          throw new Error("db down");
        },
      });
    });
  });

  test("the caller's run path continues after a throwing insert (wrapping test)", async () => {
    let runCompleted = false;
    async function fakeCallerRun() {
      await writeRunReceipt(baseInput(), {
        insert: async () => {
          throw new Error("db down");
        },
      });
      runCompleted = true;
    }
    await fakeCallerRun();
    assert.equal(runCompleted, true);
  });

  test("missing orgId -> resolves without inserting (never throws)", async () => {
    let insertCalled = false;
    await assert.doesNotReject(async () => {
      await writeRunReceipt(baseInput({ orgId: "" }), {
        insert: async () => {
          insertCalled = true;
        },
      });
    });
    assert.equal(insertCalled, false);
  });
});

describe("deriveReceiptSummary", () => {
  test("uses the first tool call's note when present", () => {
    const summary = deriveReceiptSummary({
      toolCalls: [
        { tool: "GMAIL_SEND_EMAIL", ok: true, note: "GMAIL_SEND_EMAIL succeeded (abc123)." },
        { tool: "GMAIL_ADD_LABEL", ok: true, note: "GMAIL_ADD_LABEL succeeded." },
      ],
    });
    assert.equal(summary, "GMAIL_SEND_EMAIL succeeded (abc123).");
  });

  test("falls back to reply text truncated to 140 chars when no tool calls", () => {
    const longText = "x".repeat(200);
    const summary = deriveReceiptSummary({ replyText: longText });
    assert.equal(summary.length, 140);
    assert.equal(summary, "x".repeat(140));
  });

  test("falls back to 'ran with no actions' when neither is present", () => {
    const summary = deriveReceiptSummary({});
    assert.equal(summary, "ran with no actions");
  });

  test("blank replyText also falls back to 'ran with no actions'", () => {
    const summary = deriveReceiptSummary({ replyText: "   " });
    assert.equal(summary, "ran with no actions");
  });
});

describe("writeRunReceipt — summary derivation wiring", () => {
  test("derives the summary when not explicitly provided", async () => {
    let inserted: unknown = null;
    await writeRunReceipt(
      baseInput({
        summary: undefined,
        toolCalls: [{ tool: "GMAIL_SEND_EMAIL", ok: true, note: "Sent." }],
      }),
      {
        insert: async (row) => {
          inserted = row;
        },
      },
    );
    const row = inserted as Record<string, unknown>;
    assert.equal(row.summary, "Sent.");
  });

  test("an explicit summary overrides derivation", async () => {
    let inserted: unknown = null;
    await writeRunReceipt(
      baseInput({
        summary: "matched 1, sent 1",
        toolCalls: [{ tool: "GMAIL_SEND_EMAIL", ok: true, note: "Sent." }],
      }),
      {
        insert: async (row) => {
          inserted = row;
        },
      },
    );
    const row = inserted as Record<string, unknown>;
    assert.equal(row.summary, "matched 1, sent 1");
  });
});
