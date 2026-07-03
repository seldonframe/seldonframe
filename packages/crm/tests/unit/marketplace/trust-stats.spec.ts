// Improve verb + trust rail (2026-07-02) — Task 13: the platform-verified
// eval badge's PURE build decision.
//
// `buildTrustStats` maps the T2 read surface (`getLatestEvalRun` +
// `listEvalRunsForSubject`'s count) onto the T1 `ListingTrustStats` snapshot
// cached on a marketplace_listings row. Anti-gaming by construction: it is
// impossible to produce a non-null badge from a subject that has never been
// run — `latest: null` must ALWAYS map to `null`, never a fabricated zero
// badge. `improveAcceptRate` is a declared stub for this task (the improve
// verb's accept-rate wiring is a later follow-on) and must stay `null`.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { buildTrustStats } from "@/lib/marketplace/trust-stats";
import type { EvalRun } from "@/db/schema/eval-runs";

function fakeEvalRun(overrides: Partial<EvalRun> = {}): EvalRun {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    orgId: "11111111-1111-1111-1111-111111111111",
    subjectKind: "template",
    subjectId: "22222222-2222-2222-2222-222222222222",
    kind: "publish_gate",
    passRate: 92,
    scenarioCount: 24,
    passedCount: 22,
    graderModel: "claude-haiku-4-5",
    blueprintVersion: null,
    resultsSummary: [],
    createdAt: new Date("2026-07-02T18:30:00.000Z"),
    ...overrides,
  };
}

describe("buildTrustStats", () => {
  test("NEVER fakes a badge: latest null -> null, regardless of runsCount", () => {
    assert.equal(buildTrustStats({ latest: null, runsCount: 0 }), null);
    // Even a caller-supplied nonzero runsCount with no latest run must still
    // resolve to null — the badge's existence is gated on a REAL run, not on
    // a count that could be wrong/stale.
    assert.equal(buildTrustStats({ latest: null, runsCount: 5 }), null);
  });

  test("maps a real latest run onto the ListingTrustStats snapshot", () => {
    const latest = fakeEvalRun({ passRate: 92, scenarioCount: 24, graderModel: "claude-haiku-4-5" });
    const out = buildTrustStats({ latest, runsCount: 7 });

    assert.notEqual(out, null);
    assert.equal(out!.evalPassRate, 92);
    assert.equal(out!.scenarioCount, 24);
    assert.equal(out!.graderModel, "claude-haiku-4-5");
    assert.equal(out!.runsCount, 7);
  });

  test("lastRunAt is the latest run's createdAt, serialized to ISO", () => {
    const latest = fakeEvalRun({ createdAt: new Date("2026-06-30T09:15:00.000Z") });
    const out = buildTrustStats({ latest, runsCount: 1 });

    assert.equal(out!.lastRunAt, "2026-06-30T09:15:00.000Z");
    assert.equal(typeof out!.lastRunAt, "string");
  });

  test("improveAcceptRate stays null (declared stub — not wired in this task)", () => {
    const out = buildTrustStats({ latest: fakeEvalRun(), runsCount: 3 });
    assert.equal(out!.improveAcceptRate, null);
  });

  test("graderModel passes through null when the run has none", () => {
    const latest = fakeEvalRun({ graderModel: null });
    const out = buildTrustStats({ latest, runsCount: 1 });
    assert.equal(out!.graderModel, null);
  });

  test("runsCount carries the caller's count verbatim, not re-derived from the run", () => {
    const latest = fakeEvalRun();
    assert.equal(buildTrustStats({ latest, runsCount: 1 })!.runsCount, 1);
    assert.equal(buildTrustStats({ latest, runsCount: 42 })!.runsCount, 42);
  });

  test("is pure: same input twice produces deep-equal output", () => {
    const latest = fakeEvalRun();
    const first = buildTrustStats({ latest, runsCount: 4 });
    const second = buildTrustStats({ latest, runsCount: 4 });
    assert.deepEqual(first, second);
  });

  test("clamps a caller-supplied out-of-range passRate to [0, 100] (defensive — the column is already clamped, but the badge must never render >100% or negative%)", () => {
    const over = buildTrustStats({ latest: fakeEvalRun({ passRate: 150 }), runsCount: 1 });
    assert.equal(over!.evalPassRate, 100);

    const under = buildTrustStats({ latest: fakeEvalRun({ passRate: -10 }), runsCount: 1 });
    assert.equal(under!.evalPassRate, 0);
  });
});
