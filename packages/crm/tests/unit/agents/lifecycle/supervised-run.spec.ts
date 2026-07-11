import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { runSupervised, buildKickoffMessage } from "@/lib/agents/lifecycle/supervised-run";
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
});

describe("runSupervised", () => {
  test("happy path: creates a run, streams tool events in order, finishes succeeded", async () => {
    const { deps, finished } = baseDeps();
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.runId, RUN_ID);
      assert.equal(result.status, "succeeded");
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

  test("a run that produces no actions still terminates (succeeded, empty log)", async () => {
    const { deps, finished } = baseDeps({
      runTurn: async () => ({ ok: true as const, reply: "Nothing to do right now." }),
    });
    const result = await runSupervised(deps, { orgId: ORG_ID, templateId: TEMPLATE_ID, kickoffMessage: "run it" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.status, "succeeded");
    assert.deepEqual(finished[0].actionLog, []);
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
