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
  scrubSecretShapes,
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

describe("deriveReceiptSummary — agent truth: error notes (Task 1)", () => {
  test("an errorMessage takes priority and is prefixed 'error: '", () => {
    const summary = deriveReceiptSummary({
      errorMessage: "anthropic 401: invalid x-api-key",
      toolCalls: [{ tool: "GMAIL_SEND_EMAIL", ok: true, note: "should be ignored" }],
      replyText: "should also be ignored",
    });
    assert.equal(summary, "error: anthropic 401: invalid x-api-key");
  });

  test("only the first line of a multi-line errorMessage is kept", () => {
    const summary = deriveReceiptSummary({
      errorMessage: "anthropic 401: invalid x-api-key\nat resolveClient (client.ts:42)\nat runTurn",
    });
    assert.equal(summary, "error: anthropic 401: invalid x-api-key");
  });

  test("a long errorMessage is truncated to the 140-char summary limit (incl. the 'error: ' prefix)", () => {
    const summary = deriveReceiptSummary({ errorMessage: "x".repeat(200) });
    assert.equal(summary.length, 140);
    assert.equal(summary, `error: ${"x".repeat(133)}`);
  });

  test("blank errorMessage is ignored — falls through to the ok-path derivation", () => {
    const summary = deriveReceiptSummary({ errorMessage: "   ", replyText: "fine" });
    assert.equal(summary, "fine");
  });

  test("an ok-but-actionless turn (no errorMessage) is UNCHANGED: 'ran with no actions'", () => {
    const summary = deriveReceiptSummary({});
    assert.equal(summary, "ran with no actions");
  });

  test("a secret-shaped errorMessage is scrubbed before it ever becomes a summary", () => {
    const summary = deriveReceiptSummary({
      errorMessage: "connect failed: postgres://user:sk-abcDEF12345@host/db",
    });
    assert.equal(summary.includes("sk-abcDEF12345"), false);
    assert.equal(summary.includes("postgres://user:"), false);
    assert.match(summary, /^error: /);
  });
});

describe("scrubSecretShapes — L-10 credential shapes never survive into a receipt summary", () => {
  const cases: Array<{ label: string; input: string }> = [
    { label: "postgres://", input: "postgres://user:pass@host:5432/db" },
    { label: "postgresql://", input: "postgresql://user:pass@host:5432/db" },
    { label: "sk-", input: "key is sk-abcDEF1234567890" },
    { label: "sk_", input: "key is sk_abcDEF1234567890" },
    { label: "wst_", input: "token wst_abcDEF1234567890" },
    { label: "ghp_", input: "token ghp_abcDEF1234567890" },
    { label: "Bearer ", input: "Authorization: Bearer abcDEF1234567890" },
  ];

  for (const { label, input } of cases) {
    test(`redacts a ${label} shape`, () => {
      const scrubbed = scrubSecretShapes(input);
      assert.equal(scrubbed.includes("abcDEF1234567890"), false);
      assert.equal(scrubbed.includes("pass@host"), false);
    });
  }

  test("leaves ordinary text untouched", () => {
    assert.equal(scrubSecretShapes("anthropic 401: invalid x-api-key"), "anthropic 401: invalid x-api-key");
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

  test("agent truth: an errorMessage (no explicit summary) is derived + scrubbed into the written row", async () => {
    let inserted: unknown = null;
    await writeRunReceipt(
      baseInput({
        status: "error",
        summary: undefined,
        errorMessage: "anthropic 401: invalid x-api-key",
      }),
      {
        insert: async (row) => {
          inserted = row;
        },
      },
    );
    const row = inserted as Record<string, unknown>;
    assert.equal(row.summary, "error: anthropic 401: invalid x-api-key");
  });

  test("agent truth: an explicit summary still overrides an errorMessage", async () => {
    let inserted: unknown = null;
    await writeRunReceipt(
      baseInput({
        status: "error",
        summary: "custom override",
        errorMessage: "anthropic 401: invalid x-api-key",
      }),
      {
        insert: async (row) => {
          inserted = row;
        },
      },
    );
    const row = inserted as Record<string, unknown>;
    assert.equal(row.summary, "custom override");
  });
});
