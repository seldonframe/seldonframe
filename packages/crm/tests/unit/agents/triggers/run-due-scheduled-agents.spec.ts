// P2.1-T1 — tests for the schedule-cron orchestration (lib/agents/triggers/
// schedule-agents.ts::runDueScheduledAgents). The loop is PURE + DI'd, so these
// pin the fire/skip/idempotency/fail-soft logic with a fake list + fake
// runEventAgent + fake markFired — no Postgres, no Twilio/Resend.
//
// Pinned contract:
//   • a DUE deployment (cron hits this window, never fired) → runEventAgent
//     called with the schedule.fired event for its org + markFired stamped;
//   • a NOT-DUE deployment (cron doesn't hit this window) → skipped (no fire);
//   • an ALREADY-FIRED-THIS-WINDOW deployment → skipped (idempotent), even though
//     the cron is due;
//   • a THROWING runEventAgent → counted in `errors`, NOT marked, and the loop
//     CONTINUES so sibling deployments still fire;
//   • a throwing markFired → the fire still counts (the agent ran), the error is
//     counted, and the loop continues;
//   • the whole run NEVER throws.

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  runDueScheduledAgents,
  firedWithinWindow,
  SCHEDULE_FIRED_EVENT,
  type ScheduledAgentDeployment,
  type RunDueScheduledAgentsDeps,
} from "../../../../src/lib/agents/triggers/schedule-agents";
import type { FiredEvent, RunEventAgentResult } from "../../../../src/lib/agents/triggers/run-event-agent";

// A Monday 09:02 UTC — the daily/weekly "0 9 * * *" / "0 9 * * 1" hit is 2 min
// ago, well inside the 15-min default window. 2026-06-29 is a Monday.
const NOW = new Date("2026-06-29T09:02:00.000Z");
const NOW_MS = NOW.getTime();

/** A scheduled-agent deployment fixture (daily 9am, UTC, never fired). */
function dep(over: Partial<ScheduledAgentDeployment> = {}): ScheduledAgentDeployment {
  return {
    deploymentId: over.deploymentId ?? "dep-1",
    orgId: over.orgId ?? "org-1",
    agentKey: over.agentKey ?? "tmpl-1",
    cron: over.cron ?? "0 9 * * *",
    tz: over.tz ?? "UTC",
    lastFiredAt: over.lastFiredAt ?? null,
  };
}

type MarkCall = { deploymentId: string; firedAt: Date };

/** Recording fakes for the three injected seams. `runEventAgent` returns a benign
 *  summary by default; pass `throwFor` to make specific deployment ids throw. */
function makeDeps(
  list: ScheduledAgentDeployment[],
  opts: {
    throwRunFor?: Set<string>;
    throwMarkFor?: Set<string>;
    windowMinutes?: number;
  } = {},
): {
  deps: RunDueScheduledAgentsDeps;
  fired: FiredEvent[];
  marks: MarkCall[];
} {
  const fired: FiredEvent[] = [];
  const marks: MarkCall[] = [];
  const deps: RunDueScheduledAgentsDeps = {
    list: async () => list,
    runEventAgent: async (event: FiredEvent): Promise<RunEventAgentResult> => {
      fired.push(event);
      const depId = (event.payload as { deploymentId?: string }).deploymentId ?? "";
      if (opts.throwRunFor?.has(depId)) throw new Error(`run boom for ${depId}`);
      return { matched: 1, sent: 0, skipped: 0, throttled: 0, scheduled: 0, blocked: 0, actionOnly: 1, failed: 0 };
    },
    markFired: async (deploymentId: string, firedAt: Date) => {
      marks.push({ deploymentId, firedAt });
      if (opts.throwMarkFor?.has(deploymentId)) throw new Error(`mark boom for ${deploymentId}`);
    },
    ...(opts.windowMinutes !== undefined ? { windowMinutes: opts.windowMinutes } : {}),
  };
  return { deps, fired, marks };
}

/** Silence the expected console.warn for the failing-path tests. */
async function withSilencedWarn<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.warn;
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.warn = original;
  }
}

describe("runDueScheduledAgents — fires due deployments", () => {
  test("a DUE deployment → runEventAgent called with schedule.fired for its org + markFired stamped", async () => {
    const { deps, fired, marks } = makeDeps([dep({ deploymentId: "d1", orgId: "org-7" })]);

    const result = await runDueScheduledAgents(NOW_MS, deps);

    assert.equal(fired.length, 1, "the due deployment fired once");
    assert.equal(fired[0].type, SCHEDULE_FIRED_EVENT);
    assert.equal(fired[0].orgId, "org-7");
    assert.equal(fired[0].contactId, null, "a scheduled poster is not 1:1 to a contact");
    assert.equal(
      (fired[0].payload as { deploymentId?: string }).deploymentId,
      "d1",
      "the payload carries the deployment id",
    );

    assert.equal(marks.length, 1, "lastFiredAt was stamped after the fire");
    assert.equal(marks[0].deploymentId, "d1");
    assert.equal(marks[0].firedAt.getTime(), NOW_MS, "stamped with the tick's now");

    assert.deepEqual(result, { scanned: 1, fired: 1, skipped: 0, errors: 0 });
  });

  test("a weekly cron (0 9 * * 1) due on Monday 09:02 fires", async () => {
    const { deps, fired } = makeDeps([dep({ deploymentId: "wk", cron: "0 9 * * 1" })]);
    const result = await runDueScheduledAgents(NOW_MS, deps);
    assert.equal(fired.length, 1);
    assert.deepEqual(result, { scanned: 1, fired: 1, skipped: 0, errors: 0 });
  });
});

describe("runDueScheduledAgents — skips", () => {
  test("a NOT-DUE deployment (cron doesn't hit this window) is skipped, no fire", async () => {
    // "0 8 * * *" (8am) is NOT due at 09:02 with a 15-min window.
    const { deps, fired, marks } = makeDeps([dep({ deploymentId: "off", cron: "0 8 * * *" })]);
    const result = await runDueScheduledAgents(NOW_MS, deps);
    assert.equal(fired.length, 0, "a not-due cron must not fire");
    assert.equal(marks.length, 0, "and must not be stamped");
    assert.deepEqual(result, { scanned: 1, fired: 0, skipped: 1, errors: 0 });
  });

  test("a weekly cron on the WRONG day (Tuesday) is skipped on Monday", async () => {
    // "0 9 * * 2" is Tuesday 9am — not due on our Monday NOW.
    const { deps, fired } = makeDeps([dep({ cron: "0 9 * * 2" })]);
    const result = await runDueScheduledAgents(NOW_MS, deps);
    assert.equal(fired.length, 0);
    assert.equal(result.skipped, 1);
  });

  test("an ALREADY-FIRED-THIS-WINDOW deployment is skipped (idempotent) though due", async () => {
    // lastFiredAt 1 minute ago → inside the 15-min window → skip the re-fire.
    const lastFired = new Date(NOW_MS - 60_000).toISOString();
    const { deps, fired, marks } = makeDeps([
      dep({ deploymentId: "dup", lastFiredAt: lastFired }),
    ]);
    const result = await runDueScheduledAgents(NOW_MS, deps);
    assert.equal(fired.length, 0, "already fired this window → no second fire");
    assert.equal(marks.length, 0);
    assert.deepEqual(result, { scanned: 1, fired: 0, skipped: 1, errors: 0 });
  });

  test("a deployment fired LONG ago (yesterday) is NOT throttled — it fires again", async () => {
    const lastFired = new Date(NOW_MS - 24 * 60 * 60_000).toISOString();
    const { deps, fired } = makeDeps([dep({ deploymentId: "fresh", lastFiredAt: lastFired })]);
    const result = await runDueScheduledAgents(NOW_MS, deps);
    assert.equal(fired.length, 1, "a stale stamp does not block today's fire");
    assert.deepEqual(result, { scanned: 1, fired: 1, skipped: 0, errors: 0 });
  });
});

describe("runDueScheduledAgents — fail-soft isolation", () => {
  test("a throwing runEventAgent is counted in errors, NOT marked, others still fire", async () => {
    const { deps, fired, marks } = await (async () =>
      makeDeps(
        [
          dep({ deploymentId: "boom", orgId: "org-a" }),
          dep({ deploymentId: "ok", orgId: "org-b" }),
        ],
        { throwRunFor: new Set(["boom"]) },
      ))();

    const result = await withSilencedWarn(() => runDueScheduledAgents(NOW_MS, deps));

    // Both were attempted (error isolation — the first throw didn't stop the loop).
    assert.equal(fired.length, 2, "both due deployments were attempted");
    // The throwing one was NOT stamped (it never ran → retry next tick).
    assert.ok(!marks.some((m) => m.deploymentId === "boom"), "a failed run is not stamped");
    // The healthy one fired + was stamped.
    assert.ok(marks.some((m) => m.deploymentId === "ok"), "the healthy deployment was stamped");

    assert.deepEqual(result, { scanned: 2, fired: 1, skipped: 0, errors: 1 });
  });

  test("a throwing markFired still counts the fire (agent ran) + counts the error", async () => {
    const { deps, fired, marks } = makeDeps([dep({ deploymentId: "m" })], {
      throwMarkFor: new Set(["m"]),
    });
    const result = await withSilencedWarn(() => runDueScheduledAgents(NOW_MS, deps));
    assert.equal(fired.length, 1, "the agent ran");
    assert.equal(marks.length, 1, "the mark was attempted");
    assert.deepEqual(result, { scanned: 1, fired: 1, skipped: 0, errors: 1 });
  });

  test("a throwing list() → zeroed summary, no throw", async () => {
    const deps: RunDueScheduledAgentsDeps = {
      list: async () => {
        throw new Error("db down");
      },
      runEventAgent: async () => ({}) as RunEventAgentResult,
      markFired: async () => {},
    };
    const result = await withSilencedWarn(() => runDueScheduledAgents(NOW_MS, deps));
    assert.deepEqual(result, { scanned: 0, fired: 0, skipped: 0, errors: 0 });
  });

  test("empty list → zeroed summary, no fire, no throw", async () => {
    const { deps, fired } = makeDeps([]);
    const result = await runDueScheduledAgents(NOW_MS, deps);
    assert.equal(fired.length, 0);
    assert.deepEqual(result, { scanned: 0, fired: 0, skipped: 0, errors: 0 });
  });

  test("the run never throws even when both run AND mark throw", async () => {
    const { deps } = makeDeps([dep({ deploymentId: "x" })], {
      throwRunFor: new Set(["x"]),
      throwMarkFor: new Set(["x"]),
    });
    await withSilencedWarn(async () => {
      await assert.doesNotReject(() => runDueScheduledAgents(NOW_MS, deps));
    });
  });
});

// Agent receipts slice (Task 2b) — the optional writeReceipt DI hook.
describe("runDueScheduledAgents — writeReceipt DI hook (agent receipts)", () => {
  test("a successful fire calls writeReceipt with status ok + a summary of the run result", async () => {
    const receipts: Array<Record<string, unknown>> = [];
    const { deps } = makeDeps([dep({ deploymentId: "ok-1", orgId: "org-9" })]);
    deps.writeReceipt = async (args) => {
      receipts.push(args as unknown as Record<string, unknown>);
    };
    await runDueScheduledAgents(NOW_MS, deps);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].orgId, "org-9");
    assert.equal(receipts[0].deploymentId, "ok-1");
    assert.equal(receipts[0].status, "ok");
    assert.match(receipts[0].summary as string, /matched 1/);
  });

  test("a throwing runEventAgent calls writeReceipt with status error", async () => {
    const receipts: Array<Record<string, unknown>> = [];
    const { deps } = makeDeps([dep({ deploymentId: "bad-1" })], {
      throwRunFor: new Set(["bad-1"]),
    });
    deps.writeReceipt = async (args) => {
      receipts.push(args as unknown as Record<string, unknown>);
    };
    await withSilencedWarn(() => runDueScheduledAgents(NOW_MS, deps));
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].status, "error");
    assert.match(receipts[0].summary as string, /failed:/);
  });

  test("a skipped deployment (not due) never calls writeReceipt", async () => {
    const receipts: Array<Record<string, unknown>> = [];
    const { deps } = makeDeps([dep({ deploymentId: "skip-1", cron: "0 0 1 1 *" })]);
    deps.writeReceipt = async (args) => {
      receipts.push(args as unknown as Record<string, unknown>);
    };
    await runDueScheduledAgents(NOW_MS, deps);
    assert.equal(receipts.length, 0);
  });

  test("no writeReceipt dep provided → run still completes (default no-op)", async () => {
    const { deps } = makeDeps([dep({ deploymentId: "no-hook" })]);
    await assert.doesNotReject(() => runDueScheduledAgents(NOW_MS, deps));
  });

  test("a throwing writeReceipt is swallowed — never affects the run's result/errors count", async () => {
    const { deps } = makeDeps([dep({ deploymentId: "hook-throws" })]);
    deps.writeReceipt = async () => {
      throw new Error("receipt db down");
    };
    const result = await withSilencedWarn(() => runDueScheduledAgents(NOW_MS, deps));
    assert.deepEqual(result, { scanned: 1, fired: 1, skipped: 0, errors: 0 });
  });
});

describe("firedWithinWindow — the idempotency predicate (pure)", () => {
  test("a stamp inside the window → true (skip the re-fire)", () => {
    assert.equal(firedWithinWindow(new Date(NOW_MS - 5 * 60_000).toISOString(), NOW_MS, 15), true);
  });

  test("a stamp exactly at the window edge (15 min) → false (a prior window)", () => {
    assert.equal(firedWithinWindow(new Date(NOW_MS - 15 * 60_000).toISOString(), NOW_MS, 15), false);
  });

  test("a stamp older than the window → false (allow the fire)", () => {
    assert.equal(firedWithinWindow(new Date(NOW_MS - 60 * 60_000).toISOString(), NOW_MS, 15), false);
  });

  test("null / blank / junk lastFiredAt → false (never fired / untrusted stamp)", () => {
    assert.equal(firedWithinWindow(null, NOW_MS, 15), false);
    assert.equal(firedWithinWindow("", NOW_MS, 15), false);
    assert.equal(firedWithinWindow("   ", NOW_MS, 15), false);
    assert.equal(firedWithinWindow("not-a-date", NOW_MS, 15), false);
  });
});
