// packages/crm/tests/unit/recordings/recorder-machine.spec.ts
//
// Pure reducer tests — direct invocation, no rendering. One test per
// transition rule named in the plan (Task 9), plus a full happy-path
// sequence ending phase === "recap".

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  initialRecorderState,
  recorderReducer,
  type RecorderState,
} from "../../../src/app/(public)/record/recorder-machine";
import { MAX_RECORDINGS_PER_SESSION } from "../../../src/lib/recordings/policy";
import type { FlowModel } from "../../../src/lib/recordings/trace-schema";

function fixtureFlowModel(overrides?: Partial<FlowModel>): FlowModel {
  return {
    title: "Book a job",
    goal: "Book a plumbing job from an inbound call",
    apps: ["gmail"],
    steps: [
      {
        index: 0,
        app: "gmail",
        action: "send confirmation email",
        intent: "confirm the booking",
        dataIn: ["customer email"],
        dataOut: ["confirmation sent"],
        checks: ["email address is valid"],
      },
    ],
    variables: [],
    constants: [],
    branches: [],
    openQuestions: [],
    recordingsSeen: 1,
    coverage: [],
    ...overrides,
  };
}

describe("initialRecorderState", () => {
  test("starts on landing with MAX_RECORDINGS_PER_SESSION empty slots", () => {
    const state = initialRecorderState();
    assert.equal(state.phase, "landing");
    assert.equal(state.sessionId, null);
    assert.equal(state.token, null);
    assert.equal(state.slots.length, MAX_RECORDINGS_PER_SESSION);
    for (const [i, slot] of state.slots.entries()) {
      assert.equal(slot.slotIndex, i);
      assert.equal(slot.status, "empty");
      assert.equal(slot.label, null);
    }
    assert.equal(state.flowModel, null);
    assert.deepEqual(state.coverage, []);
    assert.deepEqual(state.openQuestions, []);
    assert.deepEqual(state.interview, []);
    assert.equal(state.activeSlot, null);
  });
});

describe("SESSION_READY", () => {
  test("stores sessionId/token and moves to capturing", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, {
      type: "SESSION_READY",
      sessionId: "sess-1",
      token: "raw-token",
    });
    assert.equal(next.sessionId, "sess-1");
    assert.equal(next.token, "raw-token");
    assert.equal(next.phase, "capturing");
  });
});

describe("REHYDRATED", () => {
  test("status 'recapped' + flowModel → phase recap, sessionId/token set", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, {
      type: "REHYDRATED",
      sessionId: "sess-r",
      token: "tok-r",
      status: "recapped",
      flowModel: fixtureFlowModel(),
      openQuestions: ["what if it fails?"],
      slots: [],
    });
    assert.equal(next.sessionId, "sess-r");
    assert.equal(next.token, "tok-r");
    assert.equal(next.phase, "recap");
    assert.ok(next.flowModel);
    assert.deepEqual(next.openQuestions, ["what if it fails?"]);
  });

  test("status 'approved' + flowModel → phase approved", () => {
    const next = recorderReducer(initialRecorderState(), {
      type: "REHYDRATED",
      sessionId: "s",
      token: "t",
      status: "approved",
      flowModel: fixtureFlowModel(),
      openQuestions: [],
      slots: [],
    });
    assert.equal(next.phase, "approved");
  });

  test("status 'compiled' + flowModel → phase approved", () => {
    const next = recorderReducer(initialRecorderState(), {
      type: "REHYDRATED",
      sessionId: "s",
      token: "t",
      status: "compiled",
      flowModel: fixtureFlowModel(),
      openQuestions: [],
      slots: [],
    });
    assert.equal(next.phase, "approved");
  });

  test("no flowModel → phase capturing regardless of status", () => {
    const next = recorderReducer(initialRecorderState(), {
      type: "REHYDRATED",
      sessionId: "s",
      token: "t",
      status: "recapped",
      flowModel: null,
      openQuestions: [],
      slots: [],
    });
    assert.equal(next.phase, "capturing");
    assert.equal(next.flowModel, null);
  });

  test("status 'recording' + no flowModel → phase capturing", () => {
    const next = recorderReducer(initialRecorderState(), {
      type: "REHYDRATED",
      sessionId: "s",
      token: "t",
      status: "recording",
      flowModel: null,
      openQuestions: [],
      slots: [],
    });
    assert.equal(next.phase, "capturing");
  });

  test("maps slot rows: traced stays traced, failed gets a re-record error, uploaded (stale) resets to empty", () => {
    const next = recorderReducer(initialRecorderState(), {
      type: "REHYDRATED",
      sessionId: "s",
      token: "t",
      status: "recapped",
      flowModel: fixtureFlowModel(),
      openQuestions: [],
      slots: [
        { slotIndex: 0, label: "Happy path", status: "traced" },
        { slotIndex: 1, label: "Edge case 1", status: "failed" },
        { slotIndex: 2, label: "Edge case 2", status: "uploaded" },
      ],
    });
    assert.equal(next.slots[0].status, "traced");
    assert.equal(next.slots[0].label, "Happy path");
    assert.equal(next.slots[0].error, undefined);

    assert.equal(next.slots[1].status, "failed");
    assert.equal(next.slots[1].label, "Edge case 1");
    assert.equal(next.slots[1].error, "compile failed — re-record");

    assert.equal(next.slots[2].status, "empty");
    assert.equal(next.slots[2].label, "Edge case 2");
    assert.equal(next.slots[2].error, undefined);

    // slots not present in the rehydration payload are left untouched
    assert.equal(next.slots[3].status, "empty");
    assert.equal(next.slots[3].label, null);
  });

  test("coverage is derived from flowModel.coverage", () => {
    const model = fixtureFlowModel({
      coverage: [{ stepIndex: 0, tier: "green", toolkit: "gmail", reason: "matched gmail" }],
    });
    const next = recorderReducer(initialRecorderState(), {
      type: "REHYDRATED",
      sessionId: "s",
      token: "t",
      status: "recapped",
      flowModel: model,
      openQuestions: [],
      slots: [],
    });
    assert.equal(next.coverage.length, 1);
  });

  // B-1 regression: the authed post-claim return must land where the
  // "Compile my agent" button renders (phase "approved"), never back on the
  // claim CTA (phase "recap") — that loops the operator through /signup
  // forever.
  test("status 'recapped' + flowModel + claimed → phase approved (post-claim return)", () => {
    const next = recorderReducer(initialRecorderState(), {
      type: "REHYDRATED",
      sessionId: "s",
      token: "t",
      status: "recapped",
      flowModel: fixtureFlowModel(),
      openQuestions: [],
      slots: [],
      claimed: true,
    });
    assert.equal(next.phase, "approved");
  });

  test("claimed does NOT rescue a session with no flowModel → still capturing", () => {
    const next = recorderReducer(initialRecorderState(), {
      type: "REHYDRATED",
      sessionId: "s",
      token: "t",
      status: "recapped",
      flowModel: null,
      openQuestions: [],
      slots: [],
      claimed: true,
    });
    assert.equal(next.phase, "capturing");
  });
});

describe("START_RECORDING", () => {
  test("sets the target slot to recording + activeSlot", () => {
    const state = recorderReducer(initialRecorderState(), {
      type: "SESSION_READY",
      sessionId: "s",
      token: "t",
    });
    const next = recorderReducer(state, { type: "START_RECORDING", slotIndex: 0 });
    assert.equal(next.slots[0].status, "recording");
    assert.equal(next.activeSlot, 0);
  });

  test("no-op (same state) when another slot is already busy", () => {
    const started = recorderReducer(initialRecorderState(), {
      type: "START_RECORDING",
      slotIndex: 0,
    });
    const next = recorderReducer(started, { type: "START_RECORDING", slotIndex: 1 });
    assert.equal(next, started);
    assert.equal(next.slots[1].status, "empty");
  });

  test("busy check also covers uploading/compiling statuses", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, { type: "START_RECORDING", slotIndex: 0 });
    state = recorderReducer(state, { type: "STOP_RECORDING", slotIndex: 0 }); // -> uploading
    const attempted = recorderReducer(state, { type: "START_RECORDING", slotIndex: 2 });
    assert.equal(attempted, state);
  });

  test("out-of-range slotIndex is a no-op", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, {
      type: "START_RECORDING",
      slotIndex: MAX_RECORDINGS_PER_SESSION,
    });
    assert.equal(next, state);
    const negative = recorderReducer(state, { type: "START_RECORDING", slotIndex: -1 });
    assert.equal(negative, state);
  });
});

describe("STOP_RECORDING", () => {
  test("moves the slot to uploading", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, { type: "START_RECORDING", slotIndex: 1 });
    const next = recorderReducer(state, { type: "STOP_RECORDING", slotIndex: 1 });
    assert.equal(next.slots[1].status, "uploading");
  });

  test("out-of-range slotIndex is a no-op", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, {
      type: "STOP_RECORDING",
      slotIndex: MAX_RECORDINGS_PER_SESSION,
    });
    assert.equal(next, state);
  });
});

describe("UPLOADED", () => {
  test("moves the slot to compiling", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, { type: "START_RECORDING", slotIndex: 2 });
    state = recorderReducer(state, { type: "STOP_RECORDING", slotIndex: 2 });
    const next = recorderReducer(state, { type: "UPLOADED", slotIndex: 2 });
    assert.equal(next.slots[2].status, "compiling");
  });

  test("out-of-range slotIndex is a no-op", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, {
      type: "UPLOADED",
      slotIndex: MAX_RECORDINGS_PER_SESSION,
    });
    assert.equal(next, state);
  });
});

describe("TRACED", () => {
  test("marks the slot traced, stores flowModel/coverage/openQuestions/whatChanged", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, { type: "START_RECORDING", slotIndex: 0 });
    state = recorderReducer(state, { type: "STOP_RECORDING", slotIndex: 0 });
    state = recorderReducer(state, { type: "UPLOADED", slotIndex: 0 });
    const model = fixtureFlowModel();
    const next = recorderReducer(state, {
      type: "TRACED",
      slotIndex: 0,
      flowModel: model,
      coverage: [{ stepIndex: 0, tier: "green", toolkit: "gmail", reason: "matched gmail" }],
      whatChanged: ["Learned the happy path: Book a job"],
      openQuestions: ["what if the customer cancels?"],
    });
    assert.equal(next.slots[0].status, "traced");
    assert.deepEqual(next.slots[0].whatChanged, ["Learned the happy path: Book a job"]);
    assert.equal(next.flowModel, model);
    assert.equal(next.coverage.length, 1);
    assert.deepEqual(next.openQuestions, ["what if the customer cancels?"]);
    assert.equal(next.activeSlot, null);
  });

  test("moves phase to recap when it's the first traced slot", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, { type: "START_RECORDING", slotIndex: 0 });
    assert.equal(state.phase, "landing");
    const next = recorderReducer(state, {
      type: "TRACED",
      slotIndex: 0,
      flowModel: fixtureFlowModel(),
      coverage: [],
      whatChanged: [],
      openQuestions: [],
    });
    assert.equal(next.phase, "recap");
  });

  test("stays in recap (does not regress) on a second traced slot", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, {
      type: "TRACED",
      slotIndex: 0,
      flowModel: fixtureFlowModel(),
      coverage: [],
      whatChanged: [],
      openQuestions: [],
    });
    assert.equal(state.phase, "recap");
    const next = recorderReducer(state, {
      type: "TRACED",
      slotIndex: 1,
      flowModel: fixtureFlowModel({ recordingsSeen: 2 }),
      coverage: [],
      whatChanged: ["merged"],
      openQuestions: [],
    });
    assert.equal(next.phase, "recap");
    assert.equal(next.slots[1].status, "traced");
  });

  test("out-of-range slotIndex is a no-op", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, {
      type: "TRACED",
      slotIndex: MAX_RECORDINGS_PER_SESSION,
      flowModel: fixtureFlowModel(),
      coverage: [],
      whatChanged: [],
      openQuestions: [],
    });
    assert.equal(next, state);
  });
});

describe("SLOT_FAILED", () => {
  test("returns the slot to empty with the error kept", () => {
    let state = initialRecorderState();
    state = recorderReducer(state, { type: "START_RECORDING", slotIndex: 3 });
    const next = recorderReducer(state, {
      type: "SLOT_FAILED",
      slotIndex: 3,
      error: "upload failed",
    });
    assert.equal(next.slots[3].status, "empty");
    assert.equal(next.slots[3].error, "upload failed");
    assert.equal(next.activeSlot, null);
  });

  test("out-of-range slotIndex is a no-op", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, {
      type: "SLOT_FAILED",
      slotIndex: MAX_RECORDINGS_PER_SESSION,
      error: "x",
    });
    assert.equal(next, state);
  });
});

describe("SET_LABEL", () => {
  test("sets the slot's label", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, { type: "SET_LABEL", slotIndex: 4, label: "Edge case: refund" });
    assert.equal(next.slots[4].label, "Edge case: refund");
  });

  test("out-of-range slotIndex is a no-op", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, {
      type: "SET_LABEL",
      slotIndex: MAX_RECORDINGS_PER_SESSION,
      label: "x",
    });
    assert.equal(next, state);
  });
});

describe("INTERVIEW_TURN", () => {
  test("appends the user + seldon turns and updates openQuestions", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, {
      type: "INTERVIEW_TURN",
      user: "What happens if the part isn't in stock?",
      seldon: "Got it — I'll flag that as a branch.",
      openQuestions: [],
    });
    assert.deepEqual(next.interview, [
      { role: "user", text: "What happens if the part isn't in stock?" },
      { role: "seldon", text: "Got it — I'll flag that as a branch." },
    ]);
    assert.deepEqual(next.openQuestions, []);
  });
});

describe("MODEL_UPDATED", () => {
  test("swaps flowModel/coverage/openQuestions from the interview's merged model", () => {
    const state: RecorderState = {
      ...initialRecorderState(),
      phase: "recap",
      flowModel: fixtureFlowModel(),
      coverage: [],
      openQuestions: ["old question"],
    };
    const updatedModel = fixtureFlowModel({
      constants: ["always cc the office manager"],
      coverage: [{ stepIndex: 0, tier: "green", toolkit: "gmail", reason: "matched gmail" }],
    });
    const next = recorderReducer(state, {
      type: "MODEL_UPDATED",
      flowModel: updatedModel,
      openQuestions: [],
    });
    assert.equal(next.flowModel, updatedModel);
    assert.deepEqual(next.coverage, updatedModel.coverage);
    assert.deepEqual(next.openQuestions, []);
  });

  test("preserves phase and slots — this is not a new recording", () => {
    const state: RecorderState = {
      ...initialRecorderState(),
      phase: "approved",
      flowModel: fixtureFlowModel(),
    };
    const slotsBefore = state.slots;
    const next = recorderReducer(state, {
      type: "MODEL_UPDATED",
      flowModel: fixtureFlowModel({ goal: "an updated goal" }),
      openQuestions: [],
    });
    assert.equal(next.phase, "approved");
    assert.equal(next.slots, slotsBefore);
  });
});

describe("GO_RECAP", () => {
  test("moves phase to recap", () => {
    const state = initialRecorderState();
    const next = recorderReducer(state, { type: "GO_RECAP" });
    assert.equal(next.phase, "recap");
  });
});

describe("APPROVED", () => {
  test("only transitions from recap", () => {
    const landing = initialRecorderState();
    const noop = recorderReducer(landing, { type: "APPROVED" });
    assert.equal(noop, landing);
    assert.equal(noop.phase, "landing");

    const recap = recorderReducer(landing, { type: "GO_RECAP" });
    const approved = recorderReducer(recap, { type: "APPROVED" });
    assert.equal(approved.phase, "approved");
  });
});

describe("happy-path sequence", () => {
  test("session -> record -> stop -> upload -> traced ends in recap", () => {
    let state: RecorderState = initialRecorderState();
    state = recorderReducer(state, { type: "SESSION_READY", sessionId: "sess-9", token: "tok-9" });
    state = recorderReducer(state, { type: "START_RECORDING", slotIndex: 0 });
    state = recorderReducer(state, { type: "SET_LABEL", slotIndex: 0, label: "Happy path" });
    state = recorderReducer(state, { type: "STOP_RECORDING", slotIndex: 0 });
    state = recorderReducer(state, { type: "UPLOADED", slotIndex: 0 });
    state = recorderReducer(state, {
      type: "TRACED",
      slotIndex: 0,
      flowModel: fixtureFlowModel(),
      coverage: [{ stepIndex: 0, tier: "green", toolkit: "gmail", reason: "matched gmail" }],
      whatChanged: ["Learned the happy path: Book a job"],
      openQuestions: [],
    });

    assert.equal(state.phase, "recap");
    assert.equal(state.slots[0].status, "traced");
    assert.equal(state.slots[0].label, "Happy path");
    assert.ok(state.flowModel);
    assert.equal(state.coverage.length, 1);
  });
});
