import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runSupervised,
  buildKickoffMessage,
  resolveRunningRunGuard,
  isUniqueViolationError,
  STALE_RUNNING_MS,
} from "@/lib/agents/lifecycle/supervised-run";
import type { SupervisedRunActionEvent } from "@/db/schema/agent-lifecycle";

const ORG_ID = "org-1";
const TEMPLATE_ID = "tmpl-1";
const RUN_ID = "run-1";

function baseDeps(overrides: Partial<Parameters<typeof runSupervised>[0]> = {}) {
  const actionLog: SupervisedRunActionEvent[] = [];
  const finished: Array<{ runId: string; status: string; summary: string; actionLog: SupervisedRunActionEvent[] }> = [];
  return {
    deps: {
      hasRunningRun: async () => false,
      createRun: async () => ({ id: RUN_ID }),
      runTurn: async ({ onToolEvent }: { message: string; onToolEvent: (e: SupervisedRunActionEvent) => void }) => {
        onToolEvent({ at: "t1", tool: "gmail__check_inbox", status: "running", line: "Calling gmail…" });
        onToolEvent({ at: "t2", tool: "gmail__check_inbox", status: "ok", line: "gmail succeeded." });
        return { ok: true as const, reply: "Done — checked the inbox." };
      },
      appendActionEvent: async (_runId: string, event: SupervisedRunActionEvent) => {
        actionLog.push(event);
      },
      finishRun: async (runId: string, result: { status: "succeeded" | "failed"; summary: string; actionLog: SupervisedRunActionEvent[] }) => {
        finished.push({ runId, ...result });
      },
      ...overrides,
    },
    actionLog,
    finished,
  };
}

describe("buildKickoffMessage", () => {
  test("schedule trigger -> the 'your schedule just fired' kickoff", () => {
    assert.match(buildKickoffMessage({ kind: "schedule", cron: "0 * * * *", channel: "email" }), /schedule just fired/i);
  });

  test("inbound trigger -> the neutral 'run now' kickoff", () => {
    assert.doesNotMatch(buildKickoffMessage({ kind: "inbound", channel: "chat" }), /schedule/i);
  });

  test("null/undefined trigger -> the neutral kickoff, never throws", () => {
    assert.doesNotThrow(() => buildKickoffMessage(null));
    assert.doesNotThrow(() => buildKickoffMessage(undefined));
  });

  // T3 (2026-07-11 incident follow-up) — the kickoff must tell the agent it
  // HAS real connected tools, that the recorded steps describe the human's
  // browser path (not a script to narrate verbatim), its job is to
  // accomplish each step's OUTCOME with its tools right now, and to name
  // exactly which step it can't do and why instead of claiming success.

  function wordCount(s: string): number {
    return s.trim().split(/\s+/).length;
  }

  test("states it has real connected tools, the steps are the recorded human path, do the outcome now, and name the blocked step if one can't be done — under 80 words", () => {
    const msg = buildKickoffMessage(null);
    assert.match(msg, /real,? connected tools/i);
    assert.match(msg, /human path/i);
    assert.match(msg, /outcome/i);
    assert.match(msg, /which step and why/i);
    assert.ok(wordCount(msg) < 80, `expected < 80 words, got ${wordCount(msg)}`);
  });

  test("schedule-trigger kickoff keeps 'schedule just fired' PLUS the same honest framing", () => {
    const msg = buildKickoffMessage({ kind: "schedule", cron: "0 * * * *", channel: "email" });
    assert.match(msg, /schedule just fired/i);
    assert.match(msg, /real,? connected tools/i);
    assert.match(msg, /which step and why/i);
    assert.ok(wordCount(msg) < 80, `expected < 80 words, got ${wordCount(msg)}`);
  });
});

describe("runSupervised", () => {
  test("happy path: creates a run, streams tool events in order, finishes succeeded", async () => {
    const { deps, finished } = baseDeps();
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.runId, RUN_ID);
      assert.equal(result.status, "succeeded");
      // F-E (2026-07-11 incident: prod row 48e7fcc0-0e34-4447-bc3f-9bbdc811a9dc
      // had 4 real action_log events + a markdown summary, but the Run stage
      // UI rendered them as nothing — traced to runSupervised's own RETURN
      // VALUE never carrying actionLog back to the synchronous caller
      // (startSupervisedRunAction), which the client trusts immediately
      // without polling when the run already finished within the same
      // request. actionLog must be present on the ok:true result, matching
      // exactly what was durably written via finishRun.
      assert.deepEqual(result.actionLog, finished[0].actionLog);
      assert.equal(result.actionLog.length, 2);
    }
    assert.equal(finished.length, 1);
    assert.equal(finished[0].status, "succeeded");
    assert.equal(finished[0].actionLog.length, 2);
    assert.equal(finished[0].actionLog[0].tool, "gmail__check_inbox");
  });

  test("a tool error inside the turn still terminates — the failing action stays visible, status failed", async () => {
    const { deps } = baseDeps({
      runTurn: async ({ onToolEvent }) => {
        onToolEvent({ at: "t1", tool: "gmail__send", status: "running", line: "Calling gmail__send…" });
        onToolEvent({ at: "t2", tool: "gmail__send", status: "error", line: "gmail__send failed: no connection" });
        return { ok: false as const, reason: "llm_error" };
      },
    });
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.status, "failed");
  });

  // T2 (2026-07-11 incident: DB row 32a12952-c2ec-468b-8636-3aa5fd76ae7d) —
  // outcome.ok alone is NOT sufficient. A turn that replies without erroring
  // but takes ZERO real tool actions must finish 'failed' with an honest
  // summary, never 'succeeded' — the old behavior asserted here (before this
  // fix) is exactly what let that incident's row read status='succeeded'
  // with an empty action_log and a reply saying the agent couldn't act.
  test("THE INCIDENT: a run that produces no tool actions terminates FAILED (not succeeded), with the honest no-real-actions summary + the agent's reply", async () => {
    const { deps, finished } = baseDeps({
      runTurn: async () => ({
        ok: true as const,
        reply: "I can't actually execute the workflow steps.",
      }),
    });
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, "failed");
      assert.match(result.summary, /completed without taking any real actions in your connected apps/i);
      assert.match(result.summary, /I can't actually execute the workflow steps\./);
    }
    assert.deepEqual(finished[0].actionLog, []);
    assert.equal(finished[0].status, "failed");
  });

  test("only FAILED tool events (no 'ok') also terminates FAILED — not a single real action succeeded", async () => {
    const { deps, finished } = baseDeps({
      runTurn: async ({ onToolEvent }) => {
        onToolEvent({ at: "t1", tool: "composio__GMAIL_SEND_EMAIL", status: "running", line: "Calling gmail…" });
        onToolEvent({
          at: "t2",
          tool: "composio__GMAIL_SEND_EMAIL",
          status: "error",
          line: "Composio is not configured for this workspace",
        });
        return { ok: true as const, reply: "I tried but it failed." };
      },
    });
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, "failed");
      assert.match(result.summary, /completed without taking any real actions in your connected apps/i);
    }
    assert.equal(finished[0].status, "failed");
  });

  test("hard timeout → failed honestly, never hangs", async () => {
    const { deps, finished } = baseDeps({
      runWithTimeout: async () => "timeout" as const,
    });
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, "failed");
      assert.match(result.summary, /time/i);
    }
    assert.equal(finished[0].status, "failed");
  });

  test("second concurrent start is rejected — one running run per template", async () => {
    const { deps } = baseDeps({ hasRunningRun: async () => true });
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.deepEqual(result, { ok: false, error: "already_running" });
  });

  // ── F2 (Wave 1 review) — TOCTOU backstop: a unique-violation on the
  // createRun insert (the friendly hasRunningRun check raced and lost) maps
  // onto the same already_running result, by error CODE never by message.

  test("createRun throwing a 23505 unique-violation -> already_running, never propagates", async () => {
    const { deps } = baseDeps({
      createRun: async () => {
        const err = new Error("duplicate key value violates unique constraint") as Error & { code?: string };
        err.code = "23505";
        throw err;
      },
    });
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.deepEqual(result, { ok: false, error: "already_running" });
  });

  test("createRun throwing an UNRELATED error still propagates (not swallowed as already_running)", async () => {
    const { deps } = baseDeps({
      createRun: async () => {
        throw new Error("connection reset");
      },
    });
    await assert.rejects(
      runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" }),
      /connection reset/,
    );
  });

  test("runTurn itself throwing is caught — the run still finishes as failed, never propagates", async () => {
    const { deps, finished } = baseDeps({
      runTurn: async () => {
        throw new Error("network down");
      },
    });
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.status, "failed");
    assert.equal(finished[0].status, "failed");
  });
});

// ─── F1 (Wave 1 review) — stranded `running` row can't brick the Run button ──

describe("resolveRunningRunGuard", () => {
  const NOW = new Date("2026-07-11T12:00:00.000Z");

  test("no running row -> never blocks, nothing to reconcile", () => {
    assert.deepEqual(resolveRunningRunGuard(null, NOW), { blocks: false, staleRunId: null });
  });

  test("a fresh running row (well under STALE_RUNNING_MS) still blocks", () => {
    const startedAt = new Date(NOW.getTime() - 60_000); // 1 minute old
    assert.deepEqual(resolveRunningRunGuard({ id: "run-1", startedAt }, NOW), { blocks: true });
  });

  test("a running row exactly at the stale threshold no longer blocks (strict <, not <=)", () => {
    const startedAt = new Date(NOW.getTime() - STALE_RUNNING_MS);
    assert.deepEqual(resolveRunningRunGuard({ id: "run-1", startedAt }, NOW), {
      blocks: false,
      staleRunId: "run-1",
    });
  });

  test("a running row older than STALE_RUNNING_MS does NOT block, and is flagged for reconciliation", () => {
    const startedAt = new Date(NOW.getTime() - STALE_RUNNING_MS - 1);
    assert.deepEqual(resolveRunningRunGuard({ id: "run-1", startedAt }, NOW), {
      blocks: false,
      staleRunId: "run-1",
    });
  });

  test("a very old running row (hours) does NOT block", () => {
    const startedAt = new Date(NOW.getTime() - 3 * 60 * 60 * 1000);
    const decision = resolveRunningRunGuard({ id: "run-9", startedAt }, NOW);
    assert.equal(decision.blocks, false);
    if (!decision.blocks) assert.equal(decision.staleRunId, "run-9");
  });
});

describe("isUniqueViolationError", () => {
  test("true for a Postgres 23505 error object", () => {
    const err = new Error("dup") as Error & { code?: string };
    err.code = "23505";
    assert.equal(isUniqueViolationError(err), true);
  });

  test("false for a different PG code", () => {
    const err = new Error("fk violation") as Error & { code?: string };
    err.code = "23503";
    assert.equal(isUniqueViolationError(err), false);
  });

  test("false for an error whose MESSAGE merely mentions 'duplicate'/'unique' but has no code — code-only, never message sniffing", () => {
    assert.equal(isUniqueViolationError(new Error("duplicate key value violates unique constraint")), false);
  });

  test("false for null/undefined/non-object", () => {
    assert.equal(isUniqueViolationError(null), false);
    assert.equal(isUniqueViolationError(undefined), false);
    assert.equal(isUniqueViolationError("nope"), false);
  });
});

describe("DEFAULT_TIMEOUT_MS (app-side run timeout)", () => {
  test("stays below a 60s platform function ceiling with margin (Wave 1 review, F1)", async () => {
    // Exercised indirectly via buildKickoffMessage's neighbor export contract:
    // runSupervised's own default timeout path is covered by the "hard
    // timeout" test above via DI; here we just pin the constant's value so a
    // future edit can't silently drift back above the platform ceiling.
    const { deps } = baseDeps({
      runWithTimeout: async (fn, timeoutMs) => {
        assert.equal(timeoutMs, 55_000, "the DEFAULT_TIMEOUT_MS the action relies on must be 55s");
        return fn();
      },
    });
    await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
  });
});
