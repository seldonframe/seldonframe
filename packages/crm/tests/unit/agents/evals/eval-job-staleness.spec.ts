import { test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveEvalJobStatus,
  STALE_EVAL_JOB_MS,
} from "../../../../src/lib/agents/evals/eval-job-staleness";

const NOW = new Date("2026-07-12T00:00:00.000Z");
const agoMs = (ms: number) => new Date(NOW.getTime() - ms);

test("fresh running job passes through untouched", () => {
  const d = resolveEvalJobStatus({ status: "running", startedAt: agoMs(60_000) }, NOW);
  assert.deepEqual(d, { kind: "as_is" });
});

test("running job just under the threshold still blocks-as-is", () => {
  const d = resolveEvalJobStatus(
    { status: "running", startedAt: agoMs(STALE_EVAL_JOB_MS - 1) },
    NOW,
  );
  assert.deepEqual(d, { kind: "as_is" });
});

test("running job at/over the threshold reads as stale_failed with an honest error", () => {
  const d = resolveEvalJobStatus(
    { status: "running", startedAt: agoMs(STALE_EVAL_JOB_MS) },
    NOW,
  );
  assert.equal(d.kind, "stale_failed");
  assert.match((d as { error: string }).error, /timed out \(stale\)/);
});

test("terminal rows are never rewritten, regardless of age", () => {
  for (const status of ["succeeded", "failed"]) {
    const d = resolveEvalJobStatus(
      { status, startedAt: agoMs(STALE_EVAL_JOB_MS * 10) },
      NOW,
    );
    assert.deepEqual(d, { kind: "as_is" }, status);
  }
});
