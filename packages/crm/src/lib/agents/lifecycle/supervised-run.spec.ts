// TDD for T2 (honest supervised-run verdict) — the 2026-07-11 incident (DB row
// 32a12952-c2ec-468b-8636-3aa5fd76ae7d): a supervised run whose turn returned
// ok:true but took ZERO real tool actions (actionLog []) was marked
// 'succeeded'. `outcome.ok` alone is not sufficient — the verdict must be
// deterministic on the actionLog: at least one 'ok' tool event -> succeeded;
// zero tool events OR only failed events -> failed, with an honest summary.

import { test } from "node:test";
import assert from "node:assert/strict";

import { runSupervised, buildKickoffMessage, type SupervisedRunDeps } from "./supervised-run";
import type { SupervisedRunActionEvent } from "@/db/schema/agent-lifecycle";
import type { AgentTrigger } from "@/lib/agents/triggers/agent-trigger";

function baseDeps(overrides: Partial<SupervisedRunDeps> = {}): SupervisedRunDeps {
  return {
    hasRunningRun: async () => false,
    createRun: async () => ({ id: "run-1" }),
    runTurn: async () => ({ ok: true, reply: "Done!" }),
    appendActionEvent: async () => {},
    finishRun: async () => {},
    ...overrides,
  };
}

test("THE INCIDENT: ok turn with an empty action log finishes as 'failed', not 'succeeded'", async () => {
  let finished: { status: string; summary: string; actionLog: SupervisedRunActionEvent[] } | null = null;
  const deps = baseDeps({
    runTurn: async () => ({ ok: true, reply: "I can't actually execute the workflow steps." }),
    finishRun: async (_runId, result) => {
      finished = result;
    },
  });

  const result = await runSupervised(deps, {
    orgId: "org-1",
    templateId: "tmpl-1",
    kickoffMessage: "go",
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.status, "failed");
  assert.match(
    result.summary,
    /completed without taking any real actions in your connected apps/i,
  );
  // The agent's reply is still surfaced (so the operator sees what it said)
  assert.match(result.summary, /I can't actually execute the workflow steps\./);
  assert.equal(finished!.status, "failed");
  assert.deepEqual(finished!.actionLog, []);
});

test("at least one 'ok' tool event -> succeeded", async () => {
  const okEvent: SupervisedRunActionEvent = {
    at: "2026-07-11T00:00:00.000Z",
    tool: "composio__GMAIL_SEND_EMAIL",
    line: "Sent the invoice email",
    status: "ok",
  };
  const deps = baseDeps({
    runTurn: async (args) => {
      args.onToolEvent(okEvent);
      return { ok: true, reply: "Sent it." };
    },
  });

  const result = await runSupervised(deps, {
    orgId: "org-1",
    templateId: "tmpl-1",
    kickoffMessage: "go",
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.status, "succeeded");
  assert.equal(result.summary, "Sent it.");
});

test("only failed tool events (no 'ok') -> failed, with the honest no-real-actions summary", async () => {
  const errorEvent: SupervisedRunActionEvent = {
    at: "2026-07-11T00:00:00.000Z",
    tool: "composio__GMAIL_SEND_EMAIL",
    line: "Composio is not configured for this workspace",
    status: "error",
  };
  const deps = baseDeps({
    runTurn: async (args) => {
      args.onToolEvent(errorEvent);
      return { ok: true, reply: "I tried but it failed." };
    },
  });

  const result = await runSupervised(deps, {
    orgId: "org-1",
    templateId: "tmpl-1",
    kickoffMessage: "go",
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.status, "failed");
  assert.match(
    result.summary,
    /completed without taking any real actions in your connected apps/i,
  );
});

test("outcome.ok:false (turn error) still finishes 'failed' with the existing reason-based summary, unchanged", async () => {
  const deps = baseDeps({
    runTurn: async () => ({ ok: false, reason: "LLM key missing" }),
  });

  const result = await runSupervised(deps, {
    orgId: "org-1",
    templateId: "tmpl-1",
    kickoffMessage: "go",
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.status, "failed");
  assert.equal(result.summary, "Run failed: LLM key missing");
});

test("timeout still finishes 'failed' with the existing timeout summary, unchanged", async () => {
  const deps = baseDeps({
    runWithTimeout: async () => "timeout" as const,
    timeoutMs: 5000,
  });

  const result = await runSupervised(deps, {
    orgId: "org-1",
    templateId: "tmpl-1",
    kickoffMessage: "go",
  });

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assert.equal(result.status, "failed");
  assert.equal(result.summary, "Run timed out after 5s.");
});

// ─── buildKickoffMessage (T3 — honest kickoff framing) ────────────────────────

function wordCount(s: string): number {
  return s.trim().split(/\s+/).length;
}

test("non-schedule kickoff: has real tools, browser steps = the recorded human path, do the OUTCOME now, name the blocked step if one can't be done — under 80 words", () => {
  const msg = buildKickoffMessage(null);
  assert.match(msg, /real,? connected tools/i);
  assert.match(msg, /human path/i);
  assert.match(msg, /outcome/i);
  assert.match(msg, /which step and why/i);
  assert.ok(wordCount(msg) < 80, `expected < 80 words, got ${wordCount(msg)}`);
});

test("schedule-trigger kickoff keeps the 'schedule just fired' line, plus the same honest framing", () => {
  const trigger = { kind: "schedule" } as unknown as AgentTrigger;
  const msg = buildKickoffMessage(trigger);
  assert.match(msg, /schedule just fired/i);
  assert.match(msg, /real,? connected tools/i);
  assert.match(msg, /which step and why/i);
  assert.ok(wordCount(msg) < 80, `expected < 80 words, got ${wordCount(msg)}`);
});
