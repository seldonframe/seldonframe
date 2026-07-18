// Replay Ledger v1 — unit tests for ledger-queries.ts.
//
// Two layers, mirroring persist.spec.ts's style:
//   1. Pure math/shaping (computeLedgerSummary / toLedgerRecentRun) tested
//      directly against fixture rows — no DB, no DI.
//   2. The DI wrappers (getLedgerSummary / getLedgerSkillRows /
//      getLedgerRecentRuns) tested at spy level: assert the injected fetch
//      fn is called with the caller's orgId (the org-scoping contract),
//      same level persist.spec asserts writeWorkflowTrace's insert args.

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  computeLedgerSummary,
  toLedgerRecentRun,
  getLedgerSummary,
  getLedgerSkillRows,
  getLedgerRecentRuns,
  LEDGER_RECENT_RUNS_LIMIT,
  type LedgerTraceRow,
  type LedgerRecentRunSourceRow,
} from "@/lib/deployments/replay/ledger-queries";
import type { ReelierRunRecord } from "@seldonframe/reelier";

const ORG = "org_1";

function passingRunRecord(overrides: Partial<ReelierRunRecord["totals"]> = {}): ReelierRunRecord {
  return {
    skill: "email:dep_1",
    startedAt: "2026-07-17T00:00:00.000Z",
    finishedAt: "2026-07-17T00:00:01.000Z",
    passed: true,
    steps: [],
    totals: {
      steps: 3,
      passed: 2,
      unchecked: 1,
      skipped: 0,
      failed: 0,
      ms: 120,
      llmInputTokens: 0,
      llmOutputTokens: 0,
      ...overrides,
    },
  };
}

function failingRunRecord(): ReelierRunRecord {
  return {
    skill: "email:dep_1",
    startedAt: "2026-07-17T00:00:00.000Z",
    finishedAt: "2026-07-17T00:00:01.000Z",
    passed: false,
    steps: [],
    totals: {
      steps: 2,
      passed: 1,
      unchecked: 0,
      skipped: 0,
      failed: 1,
      ms: 40,
      llmInputTokens: 0,
      llmOutputTokens: 0,
    },
  };
}

describe("computeLedgerSummary — pure math over fixture rows", () => {
  test("empty input yields all-zero summary with agentTurnCount passed through", () => {
    const summary = computeLedgerSummary([], 5);
    assert.equal(summary.tracesRecorded, 0);
    assert.equal(summary.replayRunsTotal, 0);
    assert.equal(summary.llmTurnsAvoided, 0);
    assert.equal(summary.agentTurnCount, 5);
    assert.equal(summary.lastActivityAt, null);
  });

  test("counts legacy kind='trace' rows separately from replay-run rows", () => {
    const rows: LedgerTraceRow[] = [
      {
        id: "t1",
        kind: "trace",
        ok: true,
        callCount: 2,
        records: [],
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
      },
      {
        id: "t2",
        kind: "trace",
        ok: false,
        callCount: 1,
        records: [],
        createdAt: new Date("2026-07-17T00:01:00.000Z"),
      },
    ];
    const summary = computeLedgerSummary(rows, 0);
    assert.equal(summary.tracesRecorded, 2);
    assert.equal(summary.replayRunsTotal, 0);
    assert.equal(summary.llmTurnsAvoided, 0);
  });

  test("llmTurnsAvoided = count of ok=true replay-run rows, never an estimate", () => {
    const rows: LedgerTraceRow[] = [
      {
        id: "r1",
        kind: "replay-run",
        ok: true,
        callCount: 0,
        records: passingRunRecord(),
        createdAt: new Date("2026-07-17T00:02:00.000Z"),
      },
      {
        id: "r2",
        kind: "replay-run",
        ok: true,
        callCount: 0,
        records: passingRunRecord({ passed: 4, unchecked: 0 }),
        createdAt: new Date("2026-07-17T00:03:00.000Z"),
      },
      {
        id: "r3",
        kind: "replay-run",
        ok: false,
        callCount: 0,
        records: failingRunRecord(),
        createdAt: new Date("2026-07-17T00:04:00.000Z"),
      },
    ];
    const summary = computeLedgerSummary(rows, 10);
    assert.equal(summary.replayRunsTotal, 3);
    assert.equal(summary.replayRunsOk, 2);
    assert.equal(summary.replayRunsFailed, 1);
    assert.equal(summary.llmTurnsAvoided, 2);
    // Steps split — passed/unchecked NEVER merged into one figure.
    assert.equal(summary.stepsPassed, 2 + 4 + 1);
    assert.equal(summary.stepsUnchecked, 1 + 0 + 0);
    assert.equal(summary.stepsFailed, 0 + 0 + 1);
    assert.equal(summary.totalReplayMs, 120 + 120 + 40);
    assert.equal(summary.agentTurnCount, 10);
  });

  test("lastActivityAt is the max createdAt across all rows regardless of kind", () => {
    const rows: LedgerTraceRow[] = [
      {
        id: "t1",
        kind: "trace",
        ok: true,
        callCount: 1,
        records: [],
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
      },
      {
        id: "r1",
        kind: "replay-run",
        ok: true,
        callCount: 0,
        records: passingRunRecord(),
        createdAt: new Date("2026-07-18T00:00:00.000Z"),
      },
    ];
    const summary = computeLedgerSummary(rows, 0);
    assert.equal(summary.lastActivityAt?.toISOString(), "2026-07-18T00:00:00.000Z");
  });

  test("a replay-run row whose records blob isn't a RunRecord contributes 0 step totals (never throws)", () => {
    const rows: LedgerTraceRow[] = [
      {
        id: "r1",
        kind: "replay-run",
        ok: true,
        callCount: 0,
        // Malformed on purpose — the reader must degrade honestly, not crash.
        records: [] as unknown as ReelierRunRecord,
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
      },
    ];
    const summary = computeLedgerSummary(rows, 0);
    assert.equal(summary.replayRunsTotal, 1);
    assert.equal(summary.replayRunsOk, 1);
    assert.equal(summary.stepsPassed, 0);
  });

  test("a legacy RunRecord with `totals` but missing unchecked/skipped fields folds those as 0 via ?? 0 (never undefined/NaN)", () => {
    // Simulates an older reelier RunRecord shape (pre-unchecked/skipped totals
    // fields) landing in a stored row — the ?? 0 fallback in computeLedgerSummary
    // must degrade honestly rather than propagate `undefined` into a sum.
    const legacyRecord = {
      skill: "email:dep_1",
      startedAt: "2026-07-17T00:00:00.000Z",
      finishedAt: "2026-07-17T00:00:01.000Z",
      passed: true,
      steps: [],
      totals: {
        steps: 2,
        passed: 2,
        // unchecked / skipped intentionally OMITTED — legacy shape.
        failed: 0,
        ms: 50,
        llmInputTokens: 0,
        llmOutputTokens: 0,
      },
    } as unknown as ReelierRunRecord;
    const rows: LedgerTraceRow[] = [
      {
        id: "r1",
        kind: "replay-run",
        ok: true,
        callCount: 0,
        records: legacyRecord,
        createdAt: new Date("2026-07-17T00:00:00.000Z"),
      },
    ];
    const summary = computeLedgerSummary(rows, 0);
    assert.equal(summary.stepsPassed, 2);
    assert.equal(summary.stepsUnchecked, 0);
    assert.equal(summary.stepsSkipped, 0);
    assert.equal(summary.stepsFailed, 0);
    assert.equal(summary.totalReplayMs, 50);
    // No NaN/undefined ever leaks into the summary.
    assert.equal(Number.isFinite(summary.stepsUnchecked), true);
    assert.equal(Number.isFinite(summary.stepsSkipped), true);
  });
});

describe("toLedgerRecentRun — pure shaping", () => {
  test("kind='trace' row carries callCount, stepTotals null", () => {
    const row: LedgerRecentRunSourceRow = {
      id: "t1",
      kind: "trace",
      deploymentId: "dep_1",
      deploymentName: "Acme HVAC",
      ok: true,
      callCount: 3,
      records: [],
      createdAt: new Date("2026-07-17T00:00:00.000Z"),
    };
    const run = toLedgerRecentRun(row);
    assert.equal(run.callCount, 3);
    assert.equal(run.stepTotals, null);
    assert.equal(run.deploymentName, "Acme HVAC");
  });

  test("kind='replay-run' row carries stepTotals from records.totals", () => {
    const row: LedgerRecentRunSourceRow = {
      id: "r1",
      kind: "replay-run",
      deploymentId: "dep_1",
      deploymentName: "Acme HVAC",
      ok: true,
      callCount: 0,
      records: passingRunRecord(),
      createdAt: new Date("2026-07-17T00:00:00.000Z"),
    };
    const run = toLedgerRecentRun(row);
    assert.deepEqual(run.stepTotals, {
      steps: 3,
      passed: 2,
      unchecked: 1,
      skipped: 0,
      failed: 0,
      ms: 120,
    });
  });
});

describe("getLedgerSummary — org-scoped DI wrapper", () => {
  test("calls both fetch fns with the caller's orgId", async () => {
    const seenOrgIds: string[] = [];
    const summary = await getLedgerSummary(ORG, {
      fetchTraceRows: async (orgId) => {
        seenOrgIds.push(orgId);
        return [];
      },
      fetchAgentTurnCount: async (orgId) => {
        seenOrgIds.push(orgId);
        return 7;
      },
    });
    assert.deepEqual(seenOrgIds, [ORG, ORG]);
    assert.equal(summary.agentTurnCount, 7);
  });
});

describe("getLedgerSkillRows — org-scoped DI wrapper", () => {
  test("calls fetchSkillRows with the caller's orgId and passes rows through", async () => {
    let seenOrgId: string | null = null;
    const fakeRow = {
      id: "s1",
      deploymentId: "dep_1",
      deploymentName: "Acme HVAC",
      name: "email:dep_1",
      status: "enabled" as const,
      triggerFilter: null,
      healCount: 0,
      lastReplayAt: null,
      sourceTraceId: "t1",
      createdAt: new Date("2026-07-17T00:00:00.000Z"),
    };
    const rows = await getLedgerSkillRows(ORG, {
      fetchSkillRows: async (orgId) => {
        seenOrgId = orgId;
        return [fakeRow];
      },
    });
    assert.equal(seenOrgId, ORG);
    assert.deepEqual(rows, [fakeRow]);
  });
});

describe("getLedgerRecentRuns — org-scoped DI wrapper", () => {
  test("calls fetchRecentRunRows with the caller's orgId and the default limit", async () => {
    let seenArgs: [string, number] | null = null;
    const runs = await getLedgerRecentRuns(ORG, {
      fetchRecentRunRows: async (orgId, limit) => {
        seenArgs = [orgId, limit];
        return [];
      },
    });
    assert.deepEqual(seenArgs, [ORG, LEDGER_RECENT_RUNS_LIMIT]);
    assert.deepEqual(runs, []);
  });

  test("shapes fetched rows through toLedgerRecentRun", async () => {
    const runs = await getLedgerRecentRuns(ORG, {
      fetchRecentRunRows: async () => [
        {
          id: "r1",
          kind: "replay-run",
          deploymentId: "dep_1",
          deploymentName: "Acme HVAC",
          ok: true,
          callCount: 0,
          records: passingRunRecord(),
          createdAt: new Date("2026-07-17T00:00:00.000Z"),
        },
      ],
    });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].stepTotals?.passed, 2);
  });
});
