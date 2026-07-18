// Deterministic replay — Reelier phase 2c slice 2. attemptL0Replay: DI'd
// unit tests covering the org-scoped enabled-skill lookup, the all-read
// gate, a clean PASS, and a DIVERGE — all with fake reelier calls (no real
// parseSkill/runSkill import needed for most of these; passesAllReadGate IS
// exercised against real ReelierSkill-shaped fixtures).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  attemptL0Replay,
  passesAllReadGate,
  type AttemptL0ReplayDeps,
  type AttemptL0ReplayInput,
} from "@/lib/deployments/replay/replay-before-llm";
import type { ReelierSkill } from "@seldonframe/reelier/skill";
import type { ReelierRunRecord } from "@seldonframe/reelier";

const ORG = "org_1";
const DEPLOYMENT = "dep_1";

function baseInput(): AttemptL0ReplayInput {
  return {
    orgId: ORG,
    deploymentId: DEPLOYMENT,
    orgSlug: "acme",
    timezone: "America/Toronto",
    blueprint: { capabilities: [] } as never,
  };
}

function makeStep(overrides: Partial<ReelierSkill["steps"][number]> = {}): ReelierSkill["steps"][number] {
  return {
    n: 1,
    title: "step",
    intent: "do a thing",
    actionTool: "get_note",
    actionArgs: {},
    asserts: [],
    binds: [],
    effect: "read",
    line: 1,
    ...overrides,
  };
}

function passingRecord(skillName: string, stepCount: number): ReelierRunRecord {
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    n: i + 1,
    title: `step ${i + 1}`,
    level: 0,
    outcome: "passed" as const,
    ms: 5,
    failures: [],
  }));
  return {
    skill: skillName,
    startedAt: "2026-07-17T00:00:00.000Z",
    finishedAt: "2026-07-17T00:00:01.000Z",
    passed: true,
    steps,
    totals: { steps: stepCount, passed: stepCount, failed: 0, ms: 5 * stepCount, llmInputTokens: 0, llmOutputTokens: 0 },
  };
}

function divergedRecord(skillName: string): ReelierRunRecord {
  return {
    skill: skillName,
    startedAt: "2026-07-17T00:00:00.000Z",
    finishedAt: "2026-07-17T00:00:01.000Z",
    passed: false,
    steps: [
      { n: 1, title: "step 1", level: 0, outcome: "failed", ms: 5, failures: ["status == 200 failed: got 500"] },
    ],
    totals: { steps: 1, passed: 0, failed: 1, ms: 5, llmInputTokens: 0, llmOutputTokens: 0 },
  };
}

describe("passesAllReadGate — v1 policy", () => {
  test("all-read skill passes", () => {
    const skill = { steps: [makeStep({ effect: "read" }), makeStep({ n: 2, effect: "read" })] } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });

  test("read steps followed by ONE final non-read step passes", () => {
    const skill = {
      steps: [makeStep({ effect: "read" }), makeStep({ n: 2, effect: "idempotent-write" })],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });

  test("a single write-only step (last==only) passes", () => {
    const skill = { steps: [makeStep({ effect: "destructive" })] } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });

  test("a non-read step BEFORE the last step fails the gate", () => {
    const skill = {
      steps: [
        makeStep({ effect: "idempotent-write" }),
        makeStep({ n: 2, effect: "read" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), false);
  });

  test("two non-read steps fails the gate", () => {
    const skill = {
      steps: [
        makeStep({ effect: "idempotent-write" }),
        makeStep({ n: 2, effect: "destructive" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), false);
  });

  test("an empty skill (no steps) never passes", () => {
    assert.equal(passesAllReadGate({ steps: [] } as unknown as ReelierSkill), false);
  });
});

describe("attemptL0Replay — org-scoped enabled-skill lookup", () => {
  test("skips when no enabled skill exists for this org+deployment", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => null,
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "skipped");
  });

  test("passes the exact orgId + deploymentId through to the lookup (never a different org's skill)", async () => {
    let seenArgs: [string, string] | null = null;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async (orgId, deploymentId) => {
        seenArgs = [orgId, deploymentId];
        return null;
      },
    };
    await attemptL0Replay(baseInput(), deps);
    assert.deepEqual(seenArgs, [ORG, DEPLOYMENT]);
  });
});

describe("attemptL0Replay — all-read gate wired into the attempt", () => {
  test("a mixed-effect skill (non-read before last) is skipped WITHOUT ever calling runSkill", async () => {
    const skill: ReelierSkill = {
      name: "mixed",
      description: "d",
      steps: [
        makeStep({ effect: "idempotent-write" }),
        makeStep({ n: 2, effect: "read" }),
      ],
      preamble: "",
      trailing: "",
    };
    let runSkillCalled = false;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "irrelevant" }),
      parseSkill: async () => skill,
      runSkill: async () => {
        runSkillCalled = true;
        return passingRecord("mixed", 2);
      },
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "skipped");
    assert.equal(runSkillCalled, false);
  });
});

describe("attemptL0Replay — PASS", () => {
  test("a clean replay returns kind:'passed' with toolCalls tagged replay-l0", async () => {
    const skill: ReelierSkill = {
      name: "all-read",
      description: "d",
      steps: [makeStep({ effect: "read", actionTool: "get_note" })],
      preamble: "",
      trailing: "",
    };
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "irrelevant" }),
      parseSkill: async () => skill,
      buildTools: async () => ({}),
      runSkill: async () => passingRecord("all-read", 1),
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "passed");
    if (result.kind === "passed") {
      assert.equal(result.skillId, "skill_1");
      assert.equal(result.toolCalls.length, 1);
      assert.equal(result.toolCalls[0].tool, "get_note");
      assert.ok(result.toolCalls[0].note?.includes("replay-l0"));
    }
  });

  test("runSkill is called with maxLevel:0, allowDestructive:false, dryRun:true", async () => {
    const skill: ReelierSkill = {
      name: "s",
      description: "d",
      steps: [makeStep({ effect: "read" })],
      preamble: "",
      trailing: "",
    };
    let seenOptions: unknown = null;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => skill,
      buildTools: async () => ({}),
      runSkill: async (_skill, options) => {
        seenOptions = options;
        return passingRecord("s", 1);
      },
    };
    await attemptL0Replay(baseInput(), deps);
    const opts = seenOptions as { maxLevel?: number; allowDestructive?: boolean; dryRun?: boolean };
    assert.equal(opts.maxLevel, 0);
    assert.equal(opts.allowDestructive, false);
    assert.equal(opts.dryRun, true);
  });
});

describe("attemptL0Replay — DIVERGE / throw", () => {
  test("a failed run record returns kind:'diverged' with failures collected", async () => {
    const skill: ReelierSkill = {
      name: "s",
      description: "d",
      steps: [makeStep({ effect: "read" })],
      preamble: "",
      trailing: "",
    };
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => skill,
      buildTools: async () => ({}),
      runSkill: async () => divergedRecord("s"),
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "diverged");
    if (result.kind === "diverged") {
      assert.equal(result.skillId, "skill_1");
      assert.ok(result.failures.length > 0);
    }
  });

  test("a thrown runSkill is treated as a diverge, never propagates", async () => {
    const skill: ReelierSkill = {
      name: "s",
      description: "d",
      steps: [makeStep({ effect: "read" })],
      preamble: "",
      trailing: "",
    };
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => skill,
      buildTools: async () => ({}),
      runSkill: async () => {
        throw new Error("network blew up");
      },
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "diverged");
  });

  test("a throwing loadEnabledSkill degrades to skipped, never throws (fail-open)", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => {
        throw new Error("db down");
      },
    };
    await assert.doesNotReject(attemptL0Replay(baseInput(), deps));
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "skipped");
  });

  test("an unparseable skill_md is skipped, not thrown", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "not a skill" }),
      parseSkill: async () => {
        throw new Error("Frontmatter fence never closed");
      },
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "skipped");
  });
});
