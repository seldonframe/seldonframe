// Self-Improving Generator — L5.3 — Task 6: the generator-lessons store.
//
// generator-lessons.ts is a thin compounding-memory layer ON TOP of the L1
// agent loop-memory (`AgentMemoryStore`): it records the `{pattern, mistake,
// correction}` triples the generation judge fixed / the operator corrected, so
// FUTURE generations can recall + honor them. It reuses the SAME DI'd store and
// the SAME org-scoped `memoryKey` seam — NO new table, NO new persistence.
//
// These tests pin the contract over a fake in-memory AgentMemoryStore (a Map),
// so there is NO Brain/Postgres in the loop:
//   • record-then-recall round-trips a lesson (fields intact);
//   • two records recall most-recent-first;
//   • an identical (pattern+correction) record is NOT double-stored (dedupe);
//   • recall honors `limit`; an empty/missing store → [] (never throws);
//   • a store whose read/write throws → record swallows it, recall returns [];
//   • lessonsToPromptHint renders the correction + pattern, "" for [].

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  recordGeneratorLesson,
  recallGeneratorLessons,
  lessonsToPromptHint,
  type GeneratorLesson,
} from "../../../../src/lib/agents/generate/generator-lessons";
import {
  memoryKey,
  type AgentMemoryEntry,
  type AgentMemoryStore,
} from "../../../../src/lib/agents/memory/agent-memory";

// The org-scoped key these lessons live at: agentKey "_generator", subject
// "lessons". Pinned here so a drift in the module's key is caught.
const LESSONS_KEY = memoryKey({
  orgId: "org_1",
  agentKey: "_generator",
  subjectKey: "lessons",
}); // → "agents/_generator/lessons"

// An in-memory fake AgentMemoryStore over a Map — mirrors the real store's
// read + append-to-array semantics so record/recall round-trip without I/O.
function makeFakeStore(seed?: Record<string, AgentMemoryEntry[]>): AgentMemoryStore & {
  data: Map<string, AgentMemoryEntry[]>;
} {
  const data = new Map<string, AgentMemoryEntry[]>(Object.entries(seed ?? {}));
  return {
    data,
    read: async (key) => data.get(key) ?? [],
    append: async (key, entry) => {
      const list = data.get(key) ?? [];
      list.push(entry);
      data.set(key, list);
    },
  };
}

// A store whose every method rejects — to prove record/recall never throw.
const throwingStore: AgentMemoryStore = {
  read: async () => {
    throw new Error("brain read exploded");
  },
  append: async () => {
    throw new Error("brain append exploded");
  },
};

const LESSON_A: GeneratorLesson = {
  pattern: "sentence says 'after a booking' but trigger is inbound",
  mistake: "wired an inbound trigger",
  correction: "use trigger.event = booking.completed",
};
const LESSON_B: GeneratorLesson = {
  pattern: "no quiet-hours guardrail on an SMS agent",
  mistake: "left guardrails empty",
  correction: "default quiet hours 21:00–09:00",
};

describe("recordGeneratorLesson + recallGeneratorLessons — round-trip", () => {
  test("record one lesson then recall → length 1, fields intact", async () => {
    const store = makeFakeStore();
    await recordGeneratorLesson(store, { orgId: "org_1", lesson: LESSON_A });
    const got = await recallGeneratorLessons(store, { orgId: "org_1" });
    assert.equal(got.length, 1);
    assert.deepEqual(got[0], LESSON_A);
  });

  test("record persists under the org-scoped _generator/lessons key", async () => {
    const store = makeFakeStore();
    await recordGeneratorLesson(store, { orgId: "org_1", lesson: LESSON_A });
    const raw = store.data.get(LESSONS_KEY);
    assert.ok(raw, `expected an entry at ${LESSONS_KEY}`);
    assert.equal(raw!.length, 1);
    // the lesson rides inside an AgentMemoryEntry payload
    assert.deepEqual(raw![0].data, LESSON_A as unknown as Record<string, unknown>);
  });

  test("record two, recall → both, most-recent-first", async () => {
    const store = makeFakeStore();
    await recordGeneratorLesson(store, { orgId: "org_1", lesson: LESSON_A });
    await recordGeneratorLesson(store, { orgId: "org_1", lesson: LESSON_B });
    const got = await recallGeneratorLessons(store, { orgId: "org_1" });
    assert.equal(got.length, 2);
    // most-recent (B) first
    assert.deepEqual(got[0], LESSON_B);
    assert.deepEqual(got[1], LESSON_A);
  });

  test("a duplicate (same pattern+correction) is NOT double-stored", async () => {
    const store = makeFakeStore();
    await recordGeneratorLesson(store, { orgId: "org_1", lesson: LESSON_A });
    await recordGeneratorLesson(store, { orgId: "org_1", lesson: LESSON_A });
    const got = await recallGeneratorLessons(store, { orgId: "org_1" });
    assert.equal(got.length, 1);
  });

  test("same pattern but a DIFFERENT correction IS stored (not a dup)", async () => {
    const store = makeFakeStore();
    await recordGeneratorLesson(store, { orgId: "org_1", lesson: LESSON_A });
    await recordGeneratorLesson(store, {
      orgId: "org_1",
      lesson: { ...LESSON_A, correction: "a different correction" },
    });
    const got = await recallGeneratorLessons(store, { orgId: "org_1" });
    assert.equal(got.length, 2);
  });

  test("recall respects `limit` (returns the most-recent N)", async () => {
    const store = makeFakeStore();
    await recordGeneratorLesson(store, { orgId: "org_1", lesson: LESSON_A });
    await recordGeneratorLesson(store, { orgId: "org_1", lesson: LESSON_B });
    const got = await recallGeneratorLessons(store, { orgId: "org_1", limit: 1 });
    assert.equal(got.length, 1);
    // limit keeps the MOST recent (B)
    assert.deepEqual(got[0], LESSON_B);
  });

  test("recall on an empty/missing store → [] (no throw)", async () => {
    const store = makeFakeStore();
    const got = await recallGeneratorLessons(store, { orgId: "org_1" });
    assert.deepEqual(got, []);
  });

  test("a store entry whose data is not a valid lesson is skipped", async () => {
    // a junk entry (wrong kind / non-lesson data) co-resident with a real one
    const store = makeFakeStore({
      [LESSONS_KEY]: [
        { kind: "noise", summary: "unrelated", data: { foo: "bar" } },
        { kind: "generator_lesson", summary: "real", data: LESSON_A as unknown as Record<string, unknown> },
      ],
    });
    const got = await recallGeneratorLessons(store, { orgId: "org_1" });
    assert.equal(got.length, 1);
    assert.deepEqual(got[0], LESSON_A);
  });
});

describe("fail-soft — a throwing store never breaks generation", () => {
  test("record swallows a store error (no throw)", async () => {
    await assert.doesNotReject(() =>
      recordGeneratorLesson(throwingStore, { orgId: "org_1", lesson: LESSON_A }),
    );
  });

  test("recall returns [] (never throws) when the store throws", async () => {
    const got = await recallGeneratorLessons(throwingStore, { orgId: "org_1" });
    assert.deepEqual(got, []);
  });
});

describe("lessonsToPromptHint — renders a short honor-these block", () => {
  test("empty lessons → ''", () => {
    assert.equal(lessonsToPromptHint([]), "");
  });

  test("contains the correction text + the pattern for each lesson", () => {
    const hint = lessonsToPromptHint([LESSON_A, LESSON_B]);
    assert.ok(hint.includes(LESSON_A.pattern), "missing lesson A pattern");
    assert.ok(hint.includes(LESSON_A.correction), "missing lesson A correction");
    assert.ok(hint.includes(LESSON_B.pattern), "missing lesson B pattern");
    assert.ok(hint.includes(LESSON_B.correction), "missing lesson B correction");
    // a header so the model knows what the block is
    assert.ok(/honor|correction/i.test(hint), "missing a header cue");
    // one bullet per lesson
    assert.equal(hint.split("\n").filter((l) => l.trim().startsWith("-")).length, 2);
  });

  test("includes the prior mistake as context (was: …)", () => {
    const hint = lessonsToPromptHint([LESSON_A]);
    assert.ok(hint.includes(LESSON_A.mistake), "missing the prior mistake for context");
  });
});
