import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  resolveLifecycleMode,
  resolveStageParam,
  resolveInitialStageId,
  nextIncompleteStageId,
  setupAdvanceReducer,
  type SetupAdvanceState,
} from "@/app/(dashboard)/studio/agents/[id]/lifecycle/setup-mode";
import type { LifecycleStage } from "@/app/(dashboard)/studio/agents/[id]/lifecycle/stage-derivation";

function stages(overrides: Partial<Record<LifecycleStage["id"], boolean>> = {}): LifecycleStage[] {
  const base: LifecycleStage[] = [
    { id: "learned", step: "01", title: "Learned", complete: true },
    { id: "verified", step: "02", title: "Verified", complete: false },
    { id: "connected", step: "03", title: "Connected", complete: false },
    { id: "run", step: "04", title: "Run", complete: false },
    { id: "sell", step: "05", title: "Sell", complete: false },
  ];
  return base.map((s) => (s.id in overrides ? { ...s, complete: overrides[s.id]! } : s));
}

describe("resolveLifecycleMode", () => {
  test("any stage incomplete -> setup", () => {
    assert.equal(resolveLifecycleMode({ stages: stages(), view: undefined }), "setup");
  });

  test("every stage complete -> home", () => {
    const allDone = stages({ verified: true, connected: true, run: true, sell: true });
    assert.equal(resolveLifecycleMode({ stages: allDone, view: undefined }), "home");
  });

  test("?view=full forces home even with incomplete stages", () => {
    assert.equal(resolveLifecycleMode({ stages: stages(), view: "full" }), "home");
  });

  test("?view=full as a string[] (Next.js repeated-param shape) still resolves", () => {
    assert.equal(resolveLifecycleMode({ stages: stages(), view: ["full"] }), "home");
  });

  test("an unrelated view value does not force home", () => {
    assert.equal(resolveLifecycleMode({ stages: stages(), view: "compact" }), "setup");
  });
});

describe("resolveStageParam", () => {
  test("a known stage id resolves", () => {
    assert.equal(resolveStageParam("connected", stages()), "connected");
  });

  test("an unknown id resolves to null", () => {
    assert.equal(resolveStageParam("bogus", stages()), null);
  });

  test("absent param resolves to null", () => {
    assert.equal(resolveStageParam(undefined, stages()), null);
  });
});

describe("resolveInitialStageId", () => {
  test("valid ?stage= wins over the default", () => {
    assert.equal(resolveInitialStageId("run", stages()), "run");
  });

  test("invalid/absent ?stage= falls back to the first incomplete stage", () => {
    assert.equal(resolveInitialStageId(undefined, stages()), "verified");
    assert.equal(resolveInitialStageId("bogus", stages()), "verified");
  });

  test("all complete -> falls back to the last stage", () => {
    const allDone = stages({ verified: true, connected: true, run: true, sell: true });
    assert.equal(resolveInitialStageId(undefined, allDone), "sell");
  });
});

describe("nextIncompleteStageId", () => {
  test("advances to the next incomplete stage in order", () => {
    const s = stages({ verified: true });
    assert.equal(nextIncompleteStageId("verified", s), "connected");
  });

  test("skips over already-complete later stages", () => {
    const s = stages({ verified: true, connected: true });
    assert.equal(nextIncompleteStageId("verified", s), "run");
  });

  test("nothing incomplete later -> falls back to the first incomplete anywhere", () => {
    const s = stages({ run: true, sell: true }); // verified/connected still incomplete
    assert.equal(nextIncompleteStageId("run", s), "verified");
  });

  test("everything complete -> stays on the last stage", () => {
    const allDone = stages({ verified: true, connected: true, run: true, sell: true });
    assert.equal(nextIncompleteStageId("sell", allDone), "sell");
  });
});

describe("setupAdvanceReducer", () => {
  const idle = (stageId: SetupAdvanceState["stageId"]): SetupAdvanceState => ({ stageId, beat: "idle" });

  test("STAGE_COMPLETED sets the success beat without moving the stage", () => {
    const next = setupAdvanceReducer(idle("verified"), { type: "STAGE_COMPLETED" });
    assert.deepEqual(next, { stageId: "verified", beat: "success" });
  });

  test("STAGE_COMPLETED is idempotent once already in the success beat", () => {
    const beat: SetupAdvanceState = { stageId: "verified", beat: "success" };
    const next = setupAdvanceReducer(beat, { type: "STAGE_COMPLETED" });
    assert.equal(next, beat); // same reference — no redundant re-render
  });

  test("CONTINUE advances to the next incomplete stage and resets the beat", () => {
    const beat: SetupAdvanceState = { stageId: "verified", beat: "success" };
    const next = setupAdvanceReducer(beat, { type: "CONTINUE", stages: stages({ verified: true }) });
    assert.deepEqual(next, { stageId: "connected", beat: "idle" });
  });

  test("GOTO jumps directly to a chosen stage, beat reset", () => {
    const beat: SetupAdvanceState = { stageId: "verified", beat: "success" };
    const next = setupAdvanceReducer(beat, { type: "GOTO", stageId: "sell" });
    assert.deepEqual(next, { stageId: "sell", beat: "idle" });
  });

  test("never a hard jump: completion alone (STAGE_COMPLETED) never changes stageId", () => {
    const before = idle("connected");
    const after = setupAdvanceReducer(before, { type: "STAGE_COMPLETED" });
    assert.equal(after.stageId, before.stageId);
  });
});
