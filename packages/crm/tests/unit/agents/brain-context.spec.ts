// Stage B — the shared agent brain helper (read patterns + write outcomes).
//
// loadAgentBrainContext: pulls top workspace notes + top global patterns,
// reads each (which ticks `uses` — the consumption signal) and returns the
// bodies (to inject into the prompt) + the consumed note ids (to feed back via
// markBrainOutcome on a win). Best-effort: any failure yields what was gathered.
//
// recordAgentBrainOutcome: emits a brain_outcomes row (logBrainEvent) and, on a
// WIN with consumed ids, bumps those notes' wins/confidence (markBrainOutcome).
//
// All deps are injected so this is testable without DB / analytics.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  loadAgentBrainContext,
  recordAgentBrainOutcome,
} from "../../../src/lib/agents/brain-context";

// Minimal BrainNote-ish shapes for the injected fakes.
const wsDir = [
  { id: "ws-1", path: "patterns/hvac/objection-price", confidence: 0.9 },
  { id: "ws-2", path: "patterns/hvac/emergency-triage", confidence: 0.8 },
];
const globalDir = [{ id: "g-1", path: "patterns/global/confirm-before-booking", confidence: 0.95 }];

describe("loadAgentBrainContext", () => {
  test("loads workspace + global notes, returns bodies + consumed ids, ticks uses via read", async () => {
    const readCalls: Array<{ scope: string; path: string; orgId: string | null }> = [];
    const ctx = await loadAgentBrainContext({
      orgId: "org-1",
      deps: {
        list: async ({ scope }) =>
          (scope === "workspace" ? wsDir : globalDir) as never,
        read: async ({ orgId, scope, path }) => {
          readCalls.push({ scope, path, orgId });
          const id =
            scope === "workspace"
              ? wsDir.find((n) => n.path === path)!.id
              : globalDir.find((n) => n.path === path)!.id;
          return { id, body: `BODY:${path}` } as never;
        },
      },
    });

    // Bodies injected in order: workspace first, then global.
    assert.deepEqual(ctx.notes, [
      "BODY:patterns/hvac/objection-price",
      "BODY:patterns/hvac/emergency-triage",
      "BODY:patterns/global/confirm-before-booking",
    ]);
    assert.deepEqual(ctx.consumedNoteIds, ["ws-1", "ws-2", "g-1"]);
    // read() is the consumption signal — must be called once per picked note.
    assert.equal(readCalls.length, 3);
    // global read uses orgId=null scope=global.
    assert.deepEqual(readCalls[2], { scope: "global", path: "patterns/global/confirm-before-booking", orgId: null });
  });

  test("is best-effort: a throwing list yields empty context, never throws", async () => {
    const ctx = await loadAgentBrainContext({
      orgId: "org-1",
      deps: {
        list: async () => {
          throw new Error("brain store down");
        },
        read: async () => null,
      },
    });
    assert.deepEqual(ctx.notes, []);
    assert.deepEqual(ctx.consumedNoteIds, []);
  });

  test("skips notes that read returns null for", async () => {
    const ctx = await loadAgentBrainContext({
      orgId: "org-1",
      deps: {
        list: async ({ scope }) => (scope === "workspace" ? wsDir : []) as never,
        read: async ({ path }) =>
          path.endsWith("objection-price") ? ({ id: "ws-1", body: "B" } as never) : null,
      },
    });
    assert.deepEqual(ctx.notes, ["B"]);
    assert.deepEqual(ctx.consumedNoteIds, ["ws-1"]);
  });
});

describe("recordAgentBrainOutcome", () => {
  test("emits a brain_outcomes row and bumps consumed notes on a WIN", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test captures, mutated inside injected closures (avoids the let-narrows-to-never quirk)
    let emitted: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test capture
    let marked: any = null;
    await recordAgentBrainOutcome({
      orgId: "org-1",
      vertical: "hvac",
      eventType: "voice_booking",
      outcome: "win",
      valueCents: 15000,
      noteIds: ["ws-1", "g-1"],
      context: { service: "ac repair" },
      deps: {
        emit: (p) => {
          emitted = p as unknown as Record<string, unknown>;
        },
        mark: async (a) => {
          marked = a;
        },
      },
    });
    assert.ok(emitted, "should emit a brain event");
    assert.equal(emitted!.orgId, "org-1");
    assert.equal(emitted!.eventType, "voice_booking");
    assert.equal(emitted!.outcome, "win");
    assert.equal(emitted!.outcomeValueCents, 15000);
    assert.equal(emitted!.vertical, "hvac");
    assert.ok(marked, "should bump consumed notes on a win");
    assert.deepEqual(marked!.noteIds, ["ws-1", "g-1"]);
    assert.equal(marked!.outcome, "win");
  });

  test("on a LOSS, emits the event but does NOT bump notes", async () => {
    let marked = false;
    await recordAgentBrainOutcome({
      orgId: "org-1",
      eventType: "voice_abandoned",
      outcome: "loss",
      noteIds: ["ws-1"],
      deps: {
        emit: () => {},
        mark: async () => {
          marked = true;
        },
      },
    });
    assert.equal(marked, false);
  });

  test("a WIN with no consumed notes emits but does not bump", async () => {
    let marked = false;
    await recordAgentBrainOutcome({
      orgId: "org-1",
      eventType: "voice_booking",
      outcome: "win",
      noteIds: [],
      deps: { emit: () => {}, mark: async () => { marked = true; } },
    });
    assert.equal(marked, false);
  });

  test("best-effort: a throwing emit does not throw out", async () => {
    await recordAgentBrainOutcome({
      orgId: "org-1",
      eventType: "voice_booking",
      outcome: "win",
      noteIds: ["ws-1"],
      deps: {
        emit: () => {
          throw new Error("analytics down");
        },
        mark: async () => {},
      },
    });
    // reaching here without throwing = pass
  });
});
