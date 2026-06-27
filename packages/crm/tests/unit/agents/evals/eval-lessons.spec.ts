// Agent Eval Harness — E3: eval failures → Brain lessons.
//
// recordEvalLessons records a {pattern, mistake, correction} lesson for every
// FAILED scenario (passed:false) via the L5.3 recordGeneratorLesson — passed
// scenarios record nothing — and is best-effort (a throwing store is swallowed).
// These tests pin that off a FAKE in-memory AgentMemoryStore — NO network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { recordEvalLessons } from "../../../../src/lib/agents/evals/eval-lessons";
import type { AgentMemoryStore, AgentMemoryEntry } from "../../../../src/lib/agents/memory/agent-memory";
import type { EvalScenario, EvalScore } from "../../../../src/lib/agents/evals/eval-types";

/** An in-memory AgentMemoryStore that records every append (keyed) — the same
 *  read/append surface generator-lessons rides. */
function fakeStore(): AgentMemoryStore & { appends: Array<{ key: string; entry: AgentMemoryEntry }> } {
  const data = new Map<string, AgentMemoryEntry[]>();
  const appends: Array<{ key: string; entry: AgentMemoryEntry }> = [];
  return {
    appends,
    read: async (key: string) => data.get(key) ?? [],
    append: async (key: string, entry: AgentMemoryEntry) => {
      const arr = data.get(key) ?? [];
      arr.push(entry);
      data.set(key, arr);
      appends.push({ key, entry });
    },
  };
}

function scenario(overrides: Partial<EvalScenario> = {}): EvalScenario {
  return {
    id: "s1",
    title: "No-heat emergency at 11pm",
    persona: "A homeowner whose furnace died.",
    opening: "My furnace just died.",
    successCriteria: ["books an emergency visit"],
    mustDo: [],
    mustNotDo: [],
    ...overrides,
  };
}

function failScore(overrides: Partial<EvalScore> = {}): EvalScore {
  return {
    scenarioId: "s1",
    passed: false,
    score: 0.5,
    checks: [
      { name: "mustNotDo: quote a firm price", passed: false, detail: "matched firm $<digit> price" },
      { name: "criteria: books an emergency visit", passed: false, detail: "grader: criterion not met" },
    ],
    ...overrides,
  };
}

function passScore(overrides: Partial<EvalScore> = {}): EvalScore {
  return {
    scenarioId: "s2",
    passed: true,
    score: 1,
    checks: [{ name: "safety: unfilled placeholder", passed: true }],
    ...overrides,
  };
}

describe("recordEvalLessons — only failures become lessons", () => {
  test("one failed + one passed result → exactly one lesson recorded (the failure)", async () => {
    const store = fakeStore();
    const failed = { scenario: scenario({ id: "s1", title: "No-heat emergency at 11pm" }), score: failScore() };
    const passed = { scenario: scenario({ id: "s2", title: "Routine tune-up" }), score: passScore() };

    await recordEvalLessons(store, {
      orgId: "org-1",
      agentKey: "hvac-receptionist",
      results: [failed, passed],
    });

    // Exactly one append — only the FAILED scenario produced a lesson.
    assert.equal(store.appends.length, 1);
    const entry = store.appends[0].entry;
    const data = entry.data as { pattern?: string; mistake?: string; correction?: string };
    // pattern = the scenario title.
    assert.equal(data.pattern, "No-heat emergency at 11pm");
    // mistake names the failed checks.
    assert.ok(data.mistake?.startsWith("failed eval:"));
    assert.ok(data.mistake?.includes("quote a firm price"), "mistake should cite the failed check");
    // correction names the success criteria to satisfy.
    assert.ok(data.correction?.startsWith("satisfy:"));
    assert.ok(data.correction?.includes("books an emergency visit"));
  });

  test("all-passed results → no lessons recorded", async () => {
    const store = fakeStore();
    await recordEvalLessons(store, {
      orgId: "org-1",
      agentKey: "a",
      results: [
        { scenario: scenario({ id: "s2" }), score: passScore() },
        { scenario: scenario({ id: "s3" }), score: passScore({ scenarioId: "s3" }) },
      ],
    });
    assert.equal(store.appends.length, 0);
  });
});

describe("recordEvalLessons — best-effort", () => {
  test("a throwing store is swallowed (never throws)", async () => {
    const throwingStore: AgentMemoryStore = {
      read: async () => {
        throw new Error("read boom");
      },
      append: async () => {
        throw new Error("append boom");
      },
    };
    await assert.doesNotReject(async () => {
      await recordEvalLessons(throwingStore, {
        orgId: "org-1",
        agentKey: "a",
        results: [{ scenario: scenario(), score: failScore() }],
      });
    });
  });

  test("empty results → no-op, no throw", async () => {
    const store = fakeStore();
    await assert.doesNotReject(async () => {
      await recordEvalLessons(store, { orgId: "org-1", agentKey: "a", results: [] });
    });
    assert.equal(store.appends.length, 0);
  });

  test("a failed scenario with no nameable checks still records a usable lesson", async () => {
    const store = fakeStore();
    // Empty-transcript shape: passed:false, no checks, a note.
    const emptyScore: EvalScore = {
      scenarioId: "s1",
      passed: false,
      score: 0,
      checks: [],
      notes: "No agent turns in transcript — nothing to score (agent never responded).",
    };
    await recordEvalLessons(store, {
      orgId: "org-1",
      agentKey: "a",
      results: [{ scenario: scenario(), score: emptyScore }],
    });
    assert.equal(store.appends.length, 1);
    const data = store.appends[0].entry.data as { mistake?: string; correction?: string };
    // Falls back to the note when there are no nameable failing checks.
    assert.ok(data.mistake && data.mistake.length > "failed eval: ".length);
    assert.ok(data.correction && data.correction.startsWith("satisfy:"));
  });
});
