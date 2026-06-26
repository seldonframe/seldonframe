// Agent Loop-Memory (State) — Task T2: the Brain v2 store backing.
//
// brain-memory-store.ts persists an agent's loop-memory as a JSON array in a
// Brain note (`brain_notes`) at `memory/<key>.json`. These tests pin the PURE
// core (`makeBrainMemoryStore`) over a fake Brain-note seam — an in-memory
// Map<string,string> standing in for readBrainNote/writeBrainNote — so there is
// NO Postgres in the loop. The production factory (`makeBrainMemoryStoreForOrg`)
// is integration-only (wires the real Brain v2 lib); we only typecheck it here.
//
// Contract pinned:
//   • read(key) loads memory/<key>.json + JSON.parse → AgentMemoryEntry[];
//     missing / empty / malformed JSON → [] (never throws);
//   • a readNote that THROWS → [] (recall must not break the agent);
//   • append(key, entry) read-modify-writes the array back as pretty JSON;
//   • a writeNote that THROWS on append → no throw (record is best-effort);
//   • the note path is exactly `memory/agents/<agentKey>/<subjectKey>.json`
//     (the convention agent-memory.ts's memoryKey + this store agree on).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  makeBrainMemoryStore,
  makeBrainMemoryStoreForOrg,
  type BrainMemoryDeps,
} from "../../../../src/lib/agents/memory/brain-memory-store";
import { memoryKey, type AgentMemoryEntry } from "../../../../src/lib/agents/memory/agent-memory";

// A fake Brain-note seam over a Map<path, body>. Mirrors writeBrainNote's
// upsert-replace semantics (the body is whatever was last written) and
// readBrainNote's "body or null" return. Captures the paths it sees so tests
// can assert the `memory/<key>.json` convention.
function makeFakeBrain(seed?: Record<string, string>): BrainMemoryDeps & {
  store: Map<string, string>;
  readPaths: string[];
  writes: Array<{ path: string; body: string }>;
} {
  const store = new Map<string, string>(Object.entries(seed ?? {}));
  const readPaths: string[] = [];
  const writes: Array<{ path: string; body: string }> = [];
  return {
    orgId: "org_1",
    store,
    readPaths,
    writes,
    readNote: async (path) => {
      readPaths.push(path);
      return store.has(path) ? store.get(path)! : null;
    },
    writeNote: async (path, body) => {
      writes.push({ path, body });
      store.set(path, body);
    },
  };
}

const SUBJECT_KEY = memoryKey({
  orgId: "org_1",
  agentKey: "review-requester",
  subjectKey: "abc",
}); // → "agents/review-requester/abc"
const NOTE_PATH = `memory/${SUBJECT_KEY}.json`; // → "memory/agents/review-requester/abc.json"

describe("makeBrainMemoryStore — read", () => {
  test("read of a missing note → [] (no throw)", async () => {
    const brain = makeFakeBrain();
    const memory = makeBrainMemoryStore(brain);
    const got = await memory.read(SUBJECT_KEY);
    assert.deepEqual(got, []);
    // it looked under the memory/<key>.json path
    assert.deepEqual(brain.readPaths, [NOTE_PATH]);
  });

  test("read parses a stored JSON array of entries", async () => {
    const entries: AgentMemoryEntry[] = [
      { at: "2026-06-25T00:00:00.000Z", kind: "review_requested", summary: "asked Jordan" },
    ];
    const brain = makeFakeBrain({ [NOTE_PATH]: JSON.stringify(entries) });
    const memory = makeBrainMemoryStore(brain);
    assert.deepEqual(await memory.read(SUBJECT_KEY), entries);
  });

  test("an empty / whitespace note body → []", async () => {
    const brain = makeFakeBrain({ [NOTE_PATH]: "   " });
    const memory = makeBrainMemoryStore(brain);
    assert.deepEqual(await memory.read(SUBJECT_KEY), []);
  });

  test("a malformed JSON body → [] (never throws)", async () => {
    const brain = makeFakeBrain({ [NOTE_PATH]: "{not json[[" });
    const memory = makeBrainMemoryStore(brain);
    assert.deepEqual(await memory.read(SUBJECT_KEY), []);
  });

  test("a non-array JSON body (e.g. an object) → []", async () => {
    const brain = makeFakeBrain({ [NOTE_PATH]: JSON.stringify({ kind: "x" }) });
    const memory = makeBrainMemoryStore(brain);
    assert.deepEqual(await memory.read(SUBJECT_KEY), []);
  });

  test("a readNote that THROWS → [] (recall never breaks the agent)", async () => {
    const memory = makeBrainMemoryStore({
      orgId: "org_1",
      readNote: async () => {
        throw new Error("brain read exploded");
      },
      writeNote: async () => {},
    });
    assert.deepEqual(await memory.read(SUBJECT_KEY), []);
  });
});

describe("makeBrainMemoryStore — append", () => {
  test("append-then-read round-trips the entry", async () => {
    const brain = makeFakeBrain();
    const memory = makeBrainMemoryStore(brain);
    const entry: AgentMemoryEntry = {
      at: "2026-06-25T12:00:00.000Z",
      kind: "review_requested",
      summary: "asked Jordan for a review",
      data: { channel: "sms", messageId: "SM123" },
    };
    await memory.append(SUBJECT_KEY, entry);
    assert.deepEqual(await memory.read(SUBJECT_KEY), [entry]);
  });

  test("a second append accumulates (does not overwrite)", async () => {
    const brain = makeFakeBrain();
    const memory = makeBrainMemoryStore(brain);
    await memory.append(SUBJECT_KEY, { kind: "lead_contacted", summary: "one" });
    await memory.append(SUBJECT_KEY, { kind: "review_requested", summary: "two" });
    const got = await memory.read(SUBJECT_KEY);
    assert.equal(got.length, 2);
    assert.deepEqual(got.map((e) => e.summary), ["one", "two"]);
  });

  test("append onto a pre-seeded note keeps the prior entries", async () => {
    const prior: AgentMemoryEntry[] = [{ kind: "lead_contacted", summary: "earlier" }];
    const brain = makeFakeBrain({ [NOTE_PATH]: JSON.stringify(prior) });
    const memory = makeBrainMemoryStore(brain);
    await memory.append(SUBJECT_KEY, { kind: "review_requested", summary: "now" });
    assert.deepEqual(
      (await memory.read(SUBJECT_KEY)).map((e) => e.summary),
      ["earlier", "now"],
    );
  });

  test("PINNED: append writes to memory/agents/<agentKey>/<subjectKey>.json", async () => {
    const brain = makeFakeBrain();
    const memory = makeBrainMemoryStore(brain);
    await memory.append(SUBJECT_KEY, { kind: "review_requested", summary: "x" });
    assert.equal(brain.writes.length, 1);
    assert.equal(brain.writes[0].path, "memory/agents/review-requester/abc.json");
    // body is a JSON array (pretty-printed) the store can parse back.
    const parsed = JSON.parse(brain.writes[0].body);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed[0].kind, "review_requested");
  });

  test("a writeNote that THROWS on append → no throw (record is best-effort)", async () => {
    const memory = makeBrainMemoryStore({
      orgId: "org_1",
      readNote: async () => null,
      writeNote: async () => {
        throw new Error("brain write exploded");
      },
    });
    await assert.doesNotReject(() =>
      memory.append(SUBJECT_KEY, { kind: "review_requested", summary: "x" }),
    );
  });

  test("a readNote that THROWS during append → no throw (does not write garbage)", async () => {
    let wrote = false;
    const memory = makeBrainMemoryStore({
      orgId: "org_1",
      readNote: async () => {
        throw new Error("brain read exploded mid-append");
      },
      writeNote: async () => {
        wrote = true;
      },
    });
    await assert.doesNotReject(() =>
      memory.append(SUBJECT_KEY, { kind: "review_requested", summary: "x" }),
    );
    // the read blew up before we could safely modify+write — don't clobber.
    assert.equal(wrote, false);
  });
});

describe("makeBrainMemoryStoreForOrg — production factory (typecheck only)", () => {
  test("returns an AgentMemoryStore shape (not invoked — Brain v2/Postgres is integration-only)", () => {
    const store = makeBrainMemoryStoreForOrg("org_real");
    assert.equal(typeof store.read, "function");
    assert.equal(typeof store.append, "function");
  });
});
