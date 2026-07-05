// Unit tests for lib/activation/ladder.ts — pure win-ladder state engine.
// Task 5 of the win-ladder + SeldonChat plan (Phase B foundation).

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { computeLadderState, type LadderInputs } from "../../../src/lib/activation/ladder";
import { shouldAutoRefresh } from "../../../src/components/activation/ladder-auto-refresh";

function inputs(overrides: Partial<LadderInputs> = {}): LadderInputs {
  return {
    hasBooking: false,
    calendarConnected: false,
    landingVersionCount: 0,
    copilotEverUsed: false,
    domainAttached: false,
    shareUsed: false,
    extraAgentCount: 0,
    ...overrides,
  };
}

describe("computeLadderState", () => {
  test("all-false inputs: current is test_booking, 0 completed", () => {
    const state = computeLadderState(inputs());
    assert.equal(state.current, "test_booking");
    assert.equal(state.completedCount, 0);
    assert.deepEqual(
      state.steps.map((s) => s.id),
      ["test_booking", "make_it_yours", "go_live", "hire_agent"],
    );
    assert.deepEqual(
      state.steps.map((s) => s.done),
      [false, false, false, false],
    );
  });

  test("booking only (no calendar connected): test_booking done, current make_it_yours", () => {
    const state = computeLadderState(inputs({ hasBooking: true, calendarConnected: false }));
    const step1 = state.steps.find((s) => s.id === "test_booking")!;
    assert.equal(step1.done, true);
    assert.equal(state.current, "make_it_yours");
    assert.equal(state.completedCount, 1);
  });

  test("calendarConnected passes through to state so the UI can render a confirmed indicator", () => {
    const connected = computeLadderState(inputs({ calendarConnected: true }));
    assert.equal(connected.calendarConnected, true);

    const notConnected = computeLadderState(inputs({ calendarConnected: false }));
    assert.equal(notConnected.calendarConnected, false);
  });

  test("landingVersionCount >= 1 without copilot use marks make_it_yours done", () => {
    const state = computeLadderState(
      inputs({ hasBooking: true, landingVersionCount: 1, copilotEverUsed: false }),
    );
    const step2 = state.steps.find((s) => s.id === "make_it_yours")!;
    assert.equal(step2.done, true);
    assert.equal(state.current, "go_live");
    assert.equal(state.completedCount, 2);
  });

  test("go_live satisfied by domainAttached OR shareUsed (either alone suffices)", () => {
    const viaDomain = computeLadderState(
      inputs({
        hasBooking: true,
        landingVersionCount: 1,
        domainAttached: true,
        shareUsed: false,
      }),
    );
    assert.equal(viaDomain.steps.find((s) => s.id === "go_live")!.done, true);

    const viaShare = computeLadderState(
      inputs({
        hasBooking: true,
        landingVersionCount: 1,
        domainAttached: false,
        shareUsed: true,
      }),
    );
    assert.equal(viaShare.steps.find((s) => s.id === "go_live")!.done, true);
  });

  test("all done: current is null, completedCount is 4", () => {
    const state = computeLadderState(
      inputs({
        hasBooking: true,
        calendarConnected: true,
        landingVersionCount: 2,
        copilotEverUsed: true,
        domainAttached: true,
        shareUsed: true,
        extraAgentCount: 1,
      }),
    );
    assert.equal(state.current, null);
    assert.equal(state.completedCount, 4);
    assert.deepEqual(
      state.steps.map((s) => s.done),
      [true, true, true, true],
    );
  });

  test("extraAgentCount semantics: resolver already excludes default chatbot + workspace_copilot, so 0 never counts as hire_agent done even with copilot used", () => {
    const state = computeLadderState(
      inputs({
        hasBooking: true,
        landingVersionCount: 1,
        domainAttached: true,
        copilotEverUsed: true, // copilot use does NOT satisfy hire_agent
        extraAgentCount: 0,
      }),
    );
    const step4 = state.steps.find((s) => s.id === "hire_agent")!;
    assert.equal(step4.done, false);
    assert.equal(state.current, "hire_agent");
    assert.equal(state.completedCount, 3);

    const withExtraAgent = computeLadderState(
      inputs({
        hasBooking: true,
        landingVersionCount: 1,
        domainAttached: true,
        extraAgentCount: 1,
      }),
    );
    assert.equal(withExtraAgent.steps.find((s) => s.id === "hire_agent")!.done, true);
    assert.equal(withExtraAgent.current, null);
    assert.equal(withExtraAgent.completedCount, 4);
  });
});

describe("shouldAutoRefresh", () => {
  test("returns true when lastMs is null (no refresh has happened yet this page-load)", () => {
    assert.equal(shouldAutoRefresh(100_000, null, 60_000), true);
  });

  test("returns false when elapsed since lastMs is under minGapMs", () => {
    assert.equal(shouldAutoRefresh(100_000, 50_000, 60_000), false); // 50s elapsed < 60s min
  });

  test("returns true when elapsed since lastMs meets minGapMs exactly", () => {
    assert.equal(shouldAutoRefresh(110_000, 50_000, 60_000), true); // 60s elapsed == 60s min
  });

  test("returns true when elapsed since lastMs exceeds minGapMs", () => {
    assert.equal(shouldAutoRefresh(200_000, 50_000, 60_000), true); // 150s elapsed > 60s min
  });
});
