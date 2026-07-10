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
