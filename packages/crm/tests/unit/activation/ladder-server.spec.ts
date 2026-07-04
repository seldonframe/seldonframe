// Unit tests for lib/activation/ladder-server.ts — Task 6 of the win-ladder +
// SeldonChat plan. All DB/Composio/PostHog dependencies are injected so this
// spec never touches a real database or network.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { resolveLadderInputs, stampLadderEvent, markShareUsed, type LadderServerDeps } from "../../../src/lib/activation/ladder-server";

function deps(overrides: Partial<LadderServerDeps> = {}): LadderServerDeps {
  return {
    hasBooking: async () => false,
    landingVersionCount: async () => 0,
    calendarConnected: async () => false,
    copilotEverUsed: async () => false,
    readActivationSettings: async () => ({ domainAttached: false, shareUsed: false }),
    extraAgentCount: async () => 0,
    ...overrides,
  };
}

describe("resolveLadderInputs", () => {
  test("maps dep results onto the LadderInputs shape", async () => {
    const inputs = await resolveLadderInputs(
      "org_1",
      deps({
        hasBooking: async () => true,
        landingVersionCount: async () => 2,
        calendarConnected: async () => true,
        copilotEverUsed: async () => true,
        readActivationSettings: async () => ({ domainAttached: true, shareUsed: true }),
        extraAgentCount: async () => 3,
      }),
    );

    assert.deepEqual(inputs, {
      hasBooking: true,
      calendarConnected: true,
      landingVersionCount: 2,
      copilotEverUsed: true,
      domainAttached: true,
      shareUsed: true,
      extraAgentCount: 3,
    });
  });

  test("all-false/zero deps map to all-false/zero inputs", async () => {
    const inputs = await resolveLadderInputs("org_2", deps());
    assert.deepEqual(inputs, {
      hasBooking: false,
      calendarConnected: false,
      landingVersionCount: 0,
      copilotEverUsed: false,
      domainAttached: false,
      shareUsed: false,
      extraAgentCount: 0,
    });
  });

  test("calendarConnected resolves false when the dep throws (fail-soft)", async () => {
    const inputs = await resolveLadderInputs(
      "org_3",
      deps({
        calendarConnected: async () => {
          throw new Error("composio unreachable");
        },
      }),
    );
    assert.equal(inputs.calendarConnected, false);
  });

  test("landingVersionCount passes the raw count through (not clamped to boolean)", async () => {
    const inputs = await resolveLadderInputs("org_4", deps({ landingVersionCount: async () => 1 }));
    assert.equal(inputs.landingVersionCount, 1);
  });

  test("extraAgentCount reflects the templates dep (Task 10 starter agents write agentTemplates, not `agents`)", async () => {
    // The reviewer's CRITICAL fix: defaultExtraAgentCount now also counts the
    // org's agentTemplates rows with an event trigger, since enableStarterAgentAction
    // (agent-picks-actions.ts) creates ONLY agent_templates rows. This spec
    // asserts resolveLadderInputs faithfully passes that combined count through —
    // a DI case standing in for "the templates dep returns 1".
    const inputs = await resolveLadderInputs("org_5", deps({ extraAgentCount: async () => 1 }));
    assert.equal(inputs.extraAgentCount, 1);
  });
});

describe("stampLadderEvent", () => {
  test("stamps + captures exactly once when the step was previously absent", async () => {
    let stamped: string | null = null;
    const captured: Array<{ event: string; distinctId: string; properties?: Record<string, unknown> }> = [];

    await stampLadderEvent("org_5", "test_booking", {
      wasStepStamped: async () => false,
      stampStep: async (_orgId, step) => {
        stamped = step;
      },
      captureEvent: (input) => {
        captured.push(input);
      },
    });

    assert.equal(stamped, "test_booking");
    assert.equal(captured.length, 1);
    assert.deepEqual(captured[0], {
      event: "activation_step_completed",
      distinctId: "org_5",
      properties: { step: "test_booking" },
    });
  });

  test("is a no-op (no write, no capture) when the step was already stamped", async () => {
    let stampCalls = 0;
    let captureCalls = 0;

    await stampLadderEvent("org_6", "go_live", {
      wasStepStamped: async () => true,
      stampStep: async () => {
        stampCalls += 1;
      },
      captureEvent: () => {
        captureCalls += 1;
      },
    });

    assert.equal(stampCalls, 0);
    assert.equal(captureCalls, 0);
  });
});

describe("markShareUsed", () => {
  test("writes settings.activation.shareUsedAt only when absent, and never captures", async () => {
    let stampCalls = 0;
    let stamped = false;

    await markShareUsed("org_7", {
      wasShareUsedStamped: async () => stamped,
      stampShareUsed: async () => {
        stampCalls += 1;
        stamped = true;
      },
    });
    assert.equal(stampCalls, 1);

    await markShareUsed("org_7", {
      wasShareUsedStamped: async () => stamped,
      stampShareUsed: async () => {
        stampCalls += 1;
      },
    });
    assert.equal(stampCalls, 1);
  });
});
