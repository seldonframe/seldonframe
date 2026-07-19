// Deterministic replay — Reelier phase 2c slice 2. replayOrTurn: the DI'd
// decision seam proving the two safety-critical behaviors the design
// requires — a PASSED replay skips the agentic turn entirely (spy: runTurn
// never called), and a DIVERGED/skipped replay falls back to it (turn
// called, its result is the user-visible result).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { replayOrTurn, type ReplayOrTurnDeps } from "@/lib/deployments/replay/replay-or-turn";
import type { AttemptL0ReplayInput, AttemptL0ReplayResult } from "@/lib/deployments/replay/replay-before-llm";
import type { ReelierRunRecord } from "@seldonframe/reelier";

const INPUT: AttemptL0ReplayInput = {
  orgId: "org_1",
  deploymentId: "dep_1",
  orgSlug: "acme",
  timezone: "UTC",
  blueprint: {} as never,
};

function passRecord(): ReelierRunRecord {
  return {
    skill: "s",
    startedAt: "2026-07-17T00:00:00.000Z",
    finishedAt: "2026-07-17T00:00:01.000Z",
    passed: true,
    steps: [{ n: 1, title: "step", level: 0, outcome: "passed", ms: 1, failures: [] }],
    totals: { steps: 1, passed: 1, unchecked: 0, skipped: 0, failed: 0, ms: 1, llmInputTokens: 0, llmOutputTokens: 0 },
  };
}

function divergeRecord(): ReelierRunRecord {
  return {
    skill: "s",
    startedAt: "2026-07-17T00:00:00.000Z",
    finishedAt: "2026-07-17T00:00:01.000Z",
    passed: false,
    steps: [{ n: 1, title: "step", level: 0, outcome: "failed", ms: 1, failures: ["boom"] }],
    totals: { steps: 1, passed: 0, unchecked: 0, skipped: 0, failed: 1, ms: 1, llmInputTokens: 0, llmOutputTokens: 0 },
  };
}

function baseDeps(overrides: Partial<ReplayOrTurnDeps> = {}): {
  deps: ReplayOrTurnDeps;
  runTurnCalled: { count: number };
  persisted: AttemptL0ReplayResult[];
  markedSkillIds: string[];
} {
  const runTurnCalled = { count: 0 };
  const persisted: AttemptL0ReplayResult[] = [];
  const markedSkillIds: string[] = [];
  const deps: ReplayOrTurnDeps = {
    attemptL0Replay: async () => ({ kind: "skipped", reason: "no skill" }),
    runTurn: async () => {
      runTurnCalled.count++;
      return { ok: true, replyText: "turn ran" };
    },
    persistReplayRun: async (replay) => {
      persisted.push(replay);
    },
    markSkillReplayed: async (skillId) => {
      markedSkillIds.push(skillId);
    },
    ...overrides,
  };
  return { deps, runTurnCalled, persisted, markedSkillIds };
}

describe("replayOrTurn — replay PASS skips the agentic turn", () => {
  test("runTurn is NEVER called when replay passes", async () => {
    const { deps, runTurnCalled } = baseDeps({
      attemptL0Replay: async () => ({
        kind: "passed",
        skillId: "skill_1",
        record: passRecord(),
        toolCalls: [{ tool: "get_note", ok: true, note: "replay-l0: step" }],
        replyText: undefined,
      }),
    });
    const result = await replayOrTurn(deps, INPUT);
    assert.equal(runTurnCalled.count, 0);
    assert.equal(result.ok, true);
    assert.deepEqual(result.toolCalls, [{ tool: "get_note", ok: true, note: "replay-l0: step" }]);
  });

  test("a passed replay persists the run record AND marks the skill replayed", async () => {
    const { deps, persisted, markedSkillIds } = baseDeps({
      attemptL0Replay: async () => ({
        kind: "passed",
        skillId: "skill_1",
        record: passRecord(),
        toolCalls: [],
        replyText: undefined,
      }),
    });
    await replayOrTurn(deps, INPUT);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].kind, "passed");
    assert.deepEqual(markedSkillIds, ["skill_1"]);
  });
});

describe("replayOrTurn — DIVERGE falls back to the agentic turn", () => {
  test("runTurn IS called on a divergence, and its result is the user-visible result", async () => {
    const { deps, runTurnCalled } = baseDeps({
      attemptL0Replay: async () => ({
        kind: "diverged",
        skillId: "skill_1",
        record: divergeRecord(),
        failures: ["boom"],
      }),
    });
    const result = await replayOrTurn(deps, INPUT);
    assert.equal(runTurnCalled.count, 1);
    assert.equal(result.ok, true);
    assert.equal(result.replyText, "turn ran");
  });

  test("a divergence persists the failed run record but never marks the skill replayed", async () => {
    const { deps, persisted, markedSkillIds } = baseDeps({
      attemptL0Replay: async () => ({
        kind: "diverged",
        skillId: "skill_1",
        record: divergeRecord(),
        failures: ["boom"],
      }),
    });
    await replayOrTurn(deps, INPUT);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].kind, "diverged");
    assert.equal(markedSkillIds.length, 0);
  });
});

describe("replayOrTurn — skipped falls back WITHOUT persisting a run record", () => {
  test("runTurn IS called and nothing is persisted when replay was skipped (no enabled skill)", async () => {
    const { deps, runTurnCalled, persisted } = baseDeps({
      attemptL0Replay: async () => ({ kind: "skipped", reason: "no enabled skill" }),
    });
    const result = await replayOrTurn(deps, INPUT);
    assert.equal(runTurnCalled.count, 1);
    assert.equal(persisted.length, 0);
    assert.equal(result.replyText, "turn ran");
  });
});

describe("replayOrTurn — replay gate v2's asymmetric fallback (failed-post-send)", () => {
  test("runTurn is NEVER called on a post-send divergence — the whole point of the asymmetric policy", async () => {
    const { deps, runTurnCalled } = baseDeps({
      attemptL0Replay: async () => ({
        kind: "failed-post-send",
        skillId: "skill_1",
        record: divergeRecord(),
        failures: ["destructive step tool returned status 500"],
        destructiveStepN: 2,
      }),
    });
    const result = await replayOrTurn(deps, INPUT);
    assert.equal(runTurnCalled.count, 0, "a fresh agentic turn would risk a real double-send");
    assert.equal(result.ok, false);
    assert.ok(result.errorMessage?.includes("skill_1"));
    assert.ok(result.errorMessage?.includes("step 2"));
  });

  test("a post-send divergence still persists the run record (for ops visibility) but never marks the skill replayed", async () => {
    const { deps, persisted, markedSkillIds } = baseDeps({
      attemptL0Replay: async () => ({
        kind: "failed-post-send",
        skillId: "skill_1",
        record: divergeRecord(),
        failures: ["boom"],
        destructiveStepN: 2,
      }),
    });
    await replayOrTurn(deps, INPUT);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].kind, "failed-post-send");
    assert.equal(markedSkillIds.length, 0);
  });
});
