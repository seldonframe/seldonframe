// Agent Loop-Memory (State) — Task T1: the pure memory model.
//
// agent-memory.ts is the pure core of an agent's loop-memory: it owns the
// memory-key derivation, the recall/record helpers (DI'd over a store), and
// the "already-did" predicate that generalizes the bespoke review throttle.
// It performs NO I/O and reads NO clock — callers stamp `at` and the store
// owns persistence + org scoping. These tests pin that contract:
//   • memoryKey sanitizes each segment into a filesystem/path-safe slug
//     (lowercase, only [a-z0-9._-], no "--" runs, no leading/trailing -/.,
//     empty → "_") and namespaces under `agents/<agentKey>/<subjectKey>`;
//   • the key is STORE-SCOPED by org — orgId is NOT baked into the key
//     (the store scopes reads/writes per org), pinned explicitly below;
//   • recall reads via the store and NEVER throws (store error → []);
//   • record appends via the store and NEVER throws (append error → swallow);
//   • hasDone is true iff some entry carries the exact kind.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  memoryKey,
  recallAgentMemory,
  recordAgentMemory,
  hasDone,
  type AgentMemoryEntry,
  type AgentMemoryStore,
} from "../../../../src/lib/agents/memory/agent-memory";

// An in-memory fake AgentMemoryStore over a Map. Mirrors the real store's
// append-to-array semantics so recall/record round-trip without I/O.
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

// A store whose every method rejects — to prove recall/record never throw.
const throwingStore: AgentMemoryStore = {
  read: async () => {
    throw new Error("brain read exploded");
  },
  append: async () => {
    throw new Error("brain append exploded");
  },
};

describe("memoryKey — sanitizes + namespaces each segment", () => {
  test("a messy phone subject becomes a path-safe slug (no spaces/parens, no -- runs, no edge -)", () => {
    const key = memoryKey({
      orgId: "org_1",
      agentKey: "review-requester",
      subjectKey: "+1 (325) 413-2487",
    });
    // namespaced under agents/<agentKey>/
    assert.ok(key.startsWith("agents/review-requester/"), `unexpected namespace: ${key}`);
    const subject = key.slice("agents/review-requester/".length);
    // no whitespace
    assert.ok(!/\s/.test(subject), `subject has whitespace: ${JSON.stringify(subject)}`);
    // no parens / + / other disallowed chars — only [a-z0-9._-]
    assert.ok(/^[a-z0-9._-]+$/.test(subject), `subject has illegal chars: ${JSON.stringify(subject)}`);
    // no collapsed-dash runs
    assert.ok(!subject.includes("--"), `subject has a -- run: ${JSON.stringify(subject)}`);
    // no leading/trailing - or .
    assert.ok(!/^[-.]|[-.]$/.test(subject), `subject has an edge -/.: ${JSON.stringify(subject)}`);
  });

  test("uppercase agentKey is lowercased", () => {
    const key = memoryKey({ orgId: "org_1", agentKey: "Review_Requester", subjectKey: "abc" });
    assert.equal(key, "agents/review_requester/abc");
  });

  test("an empty subjectKey falls back to '_'", () => {
    const key = memoryKey({ orgId: "org_1", agentKey: "review-requester", subjectKey: "" });
    assert.equal(key, "agents/review-requester/_");
  });

  test("a whitespace-only subjectKey also falls back to '_'", () => {
    const key = memoryKey({ orgId: "org_1", agentKey: "review-requester", subjectKey: "   " });
    assert.equal(key, "agents/review-requester/_");
  });

  test("an empty agentKey falls back to '_'", () => {
    const key = memoryKey({ orgId: "org_1", agentKey: "", subjectKey: "abc" });
    assert.equal(key, "agents/_/abc");
  });

  test("PINNED: orgId is NOT part of the key (the store scopes by org)", () => {
    const a = memoryKey({ orgId: "org_AAA", agentKey: "k", subjectKey: "s" });
    const b = memoryKey({ orgId: "org_BBB", agentKey: "k", subjectKey: "s" });
    assert.equal(a, b, "key must not vary with orgId — scoping is the store's job");
    assert.equal(a, "agents/k/s");
  });

  test("is deterministic for the same inputs", () => {
    const args = { orgId: "org_1", agentKey: "Foo Bar!!", subjectKey: "Sub Ject??" };
    assert.equal(memoryKey(args), memoryKey(args));
  });
});

describe("recallAgentMemory — reads via the store, never throws", () => {
  test("returns the store's entries for the derived key", async () => {
    const entries: AgentMemoryEntry[] = [
      { kind: "review_requested", summary: "asked Jordan for a review" },
    ];
    const store = makeFakeStore({ "agents/review-requester/abc": entries });
    const got = await recallAgentMemory(store, {
      orgId: "org_1",
      agentKey: "review-requester",
      subjectKey: "abc",
    });
    assert.deepEqual(got, entries);
  });

  test("returns [] when nothing is stored for that key", async () => {
    const store = makeFakeStore();
    const got = await recallAgentMemory(store, {
      orgId: "org_1",
      agentKey: "review-requester",
      subjectKey: "never-seen",
    });
    assert.deepEqual(got, []);
  });

  test("returns [] (never throws) when the store throws", async () => {
    const got = await recallAgentMemory(throwingStore, {
      orgId: "org_1",
      agentKey: "review-requester",
      subjectKey: "abc",
    });
    assert.deepEqual(got, []);
  });
});

describe("recordAgentMemory — appends via the store, never throws", () => {
  test("calls append with the derived key and the exact entry", async () => {
    const store = makeFakeStore();
    const entry: AgentMemoryEntry = {
      at: "2026-06-25T12:00:00.000Z",
      kind: "review_requested",
      summary: "asked Jordan for a review",
      data: { channel: "sms", messageId: "SM123" },
    };
    await recordAgentMemory(store, {
      orgId: "org_1",
      agentKey: "review-requester",
      subjectKey: "abc",
      entry,
    });
    assert.deepEqual(store.data.get("agents/review-requester/abc"), [entry]);
  });

  test("a second record appends (does not overwrite)", async () => {
    const store = makeFakeStore();
    const args = { orgId: "org_1", agentKey: "review-requester", subjectKey: "abc" };
    await recordAgentMemory(store, { ...args, entry: { kind: "review_requested", summary: "one" } });
    await recordAgentMemory(store, { ...args, entry: { kind: "review_requested", summary: "two" } });
    const stored = store.data.get("agents/review-requester/abc");
    assert.equal(stored?.length, 2);
    assert.deepEqual(stored?.map((e) => e.summary), ["one", "two"]);
  });

  test("record then recall round-trips through the same key", async () => {
    const store = makeFakeStore();
    const args = { orgId: "org_1", agentKey: "speed-to-lead", subjectKey: "+1 (325) 413-2487" };
    const entry: AgentMemoryEntry = { kind: "lead_contacted", summary: "texted the new lead" };
    await recordAgentMemory(store, { ...args, entry });
    const got = await recallAgentMemory(store, args);
    assert.deepEqual(got, [entry]);
  });

  test("does not throw when append throws", async () => {
    await assert.doesNotReject(() =>
      recordAgentMemory(throwingStore, {
        orgId: "org_1",
        agentKey: "review-requester",
        subjectKey: "abc",
        entry: { kind: "review_requested", summary: "asked" },
      }),
    );
  });
});

describe("hasDone — the generalized 'already did it' predicate", () => {
  const entries: AgentMemoryEntry[] = [
    { kind: "lead_contacted", summary: "texted" },
    { kind: "review_requested", summary: "asked for a review" },
  ];

  test("true when an entry of that exact kind exists", () => {
    assert.equal(hasDone(entries, "review_requested"), true);
    assert.equal(hasDone(entries, "lead_contacted"), true);
  });

  test("false when no entry has that kind", () => {
    assert.equal(hasDone(entries, "note"), false);
  });

  test("false on an empty list", () => {
    assert.equal(hasDone([], "review_requested"), false);
  });

  test("matches exactly (not a substring / case-insensitive)", () => {
    assert.equal(hasDone(entries, "review"), false);
    assert.equal(hasDone(entries, "Review_Requested"), false);
  });
});
