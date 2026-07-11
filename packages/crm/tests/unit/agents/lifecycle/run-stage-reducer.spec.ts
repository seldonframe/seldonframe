// T10 — the Run stage's reducer-extracted poll/append/terminal state machine.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runStageReducer,
  RUN_STAGE_IDLE,
  type RunStageState,
} from "@/app/(dashboard)/studio/agents/[id]/lifecycle/run-stage-reducer";
import type { SupervisedRunActionEvent } from "@/db/schema/agent-lifecycle";

const EVT: SupervisedRunActionEvent = { at: "t1", tool: "send_email", line: "Sent the email", status: "ok" };

describe("runStageReducer", () => {
  test("idle → starting on start_clicked", () => {
    const next = runStageReducer(RUN_STAGE_IDLE, { type: "start_clicked" });
    assert.deepEqual(next, { status: "starting" });
  });

  test("starting → running on started with status:running", () => {
    const starting: RunStageState = { status: "starting" };
    const next = runStageReducer(starting, {
      type: "started",
      runId: "run-1",
      status: "running",
      actionLog: [],
    });
    assert.deepEqual(next, { status: "running", runId: "run-1", actionLog: [] });
  });

  test("starting → succeeded when the action already resolved before the first poll", () => {
    const starting: RunStageState = { status: "starting" };
    const next = runStageReducer(starting, {
      type: "started",
      runId: "run-1",
      status: "succeeded",
      actionLog: [EVT],
    });
    assert.equal(next.status, "succeeded");
    if (next.status === "succeeded") {
      assert.equal(next.runId, "run-1");
      assert.deepEqual(next.actionLog, [EVT]);
    }
  });

  test("starting → start_failed on start_failed", () => {
    const starting: RunStageState = { status: "starting" };
    const next = runStageReducer(starting, { type: "start_failed", error: "already_running" });
    assert.deepEqual(next, { status: "start_failed", error: "already_running" });
  });

  test("running + poll_tick(running) → running, action log replaced with latest", () => {
    const running: RunStageState = { status: "running", runId: "run-1", actionLog: [] };
    const next = runStageReducer(running, {
      type: "poll_tick",
      runId: "run-1",
      status: "running",
      actionLog: [EVT],
      summary: null,
    });
    assert.deepEqual(next, { status: "running", runId: "run-1", actionLog: [EVT] });
  });

  test("running + poll_tick(succeeded) → succeeded, carries summary", () => {
    const running: RunStageState = { status: "running", runId: "run-1", actionLog: [EVT] };
    const next = runStageReducer(running, {
      type: "poll_tick",
      runId: "run-1",
      status: "succeeded",
      actionLog: [EVT],
      summary: "All good.",
    });
    assert.deepEqual(next, { status: "succeeded", runId: "run-1", actionLog: [EVT], summary: "All good." });
  });

  test("running + poll_tick(failed) → failed, fallback summary when null", () => {
    const running: RunStageState = { status: "running", runId: "run-1", actionLog: [] };
    const next = runStageReducer(running, {
      type: "poll_tick",
      runId: "run-1",
      status: "failed",
      actionLog: [],
      summary: null,
    });
    assert.equal(next.status, "failed");
    if (next.status === "failed") {
      assert.match(next.summary, /no summary/i);
    }
  });

  test("poll_tick for a stale/mismatched runId is a no-op", () => {
    const running: RunStageState = { status: "running", runId: "run-1", actionLog: [] };
    const next = runStageReducer(running, {
      type: "poll_tick",
      runId: "run-OTHER",
      status: "succeeded",
      actionLog: [EVT],
      summary: "stale",
    });
    assert.deepEqual(next, running);
  });

  test("poll_tick while idle is a no-op (out-of-order guard)", () => {
    const next = runStageReducer(RUN_STAGE_IDLE, {
      type: "poll_tick",
      runId: "run-1",
      status: "succeeded",
      actionLog: [],
      summary: "x",
    });
    assert.deepEqual(next, RUN_STAGE_IDLE);
  });

  test("poll_failed never terminates a running state", () => {
    const running: RunStageState = { status: "running", runId: "run-1", actionLog: [] };
    const next = runStageReducer(running, { type: "poll_failed" });
    assert.deepEqual(next, running);
  });

  test("started while not starting is a no-op (out-of-order guard)", () => {
    const succeeded: RunStageState = { status: "succeeded", runId: "run-1", actionLog: [], summary: "ok" };
    const next = runStageReducer(succeeded, {
      type: "started",
      runId: "run-2",
      status: "running",
      actionLog: [],
    });
    assert.deepEqual(next, succeeded);
  });
});
