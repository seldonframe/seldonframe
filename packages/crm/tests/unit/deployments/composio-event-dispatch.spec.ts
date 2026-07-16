// Email-agent slice (Part B1) — dispatchComposioEventToDeployments: fan a
// fired composio.* event (e.g. composio.gmail.new_message) out to the
// record-compiled deployments whose trigger matches, running each via the
// injected agentic-turn seam (prod = runStatelessAgentTurn, testMode:false —
// the same seam the action-only event-agent path uses).
//
// Verify-gate fix wave (2026-07-12):
//   FIX 1 — a per-deployment daily run cap (money-spend circuit breaker).
//   FIX 2 — an ATOMIC claim-before-run (no read-modify-write TOCTOU): the
//     orchestrator now calls ONE `claimRun` dep instead of separate
//     isAlreadyProcessed/markProcessed checks.
//   FIX 3 — a FAILED run releases its claim so a webhook redelivery can
//     retry a transient failure (no LLM key, timeout) instead of being
//     silently swallowed forever.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dispatchComposioEventToDeployments,
  type ComposioEventDeploymentMatch,
  type DispatchComposioEventDeps,
  type ClaimRunResult,
} from "../../../src/lib/deployments/composio-event-dispatch";

const ORG = "org_1";
const EVENT = "composio.gmail.new_message";

function match(overrides: Partial<ComposioEventDeploymentMatch> = {}): ComposioEventDeploymentMatch {
  return {
    deploymentId: "dep_1",
    orgId: ORG,
    agentKey: "tmpl_1",
    channel: "email",
    blueprint: { capabilities: [] } as never,
    ...overrides,
  };
}

function fakeDeps(overrides: Partial<DispatchComposioEventDeps> = {}): DispatchComposioEventDeps {
  return {
    listMatchingDeployments: async () => [match()],
    runAgenticTurn: async () => ({ ok: true }),
    claimRun: async () => ({ claimed: true }),
    releaseClaim: async () => {},
    ...overrides,
  };
}

test("match fires runAgenticTurn after a successful claim", async () => {
  const calls: unknown[] = [];
  let claimArgs: unknown = null;
  const deps = fakeDeps({
    claimRun: async (deploymentId, orgId, messageId) => {
      claimArgs = { deploymentId, orgId, messageId };
      return { claimed: true };
    },
    runAgenticTurn: async (args) => {
      calls.push(args);
      return { ok: true };
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(r.attempted, 1);
  assert.deepEqual(r.started, ["dep_1"]);
  assert.deepEqual(r.skipped, []);
  assert.equal(calls.length, 1);
  assert.deepEqual(claimArgs, { deploymentId: "dep_1", orgId: ORG, messageId: "msg_1" });
});

test("no matching deployments -> attempted:0", async () => {
  const deps = fakeDeps({ listMatchingDeployments: async () => [] });
  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: {},
  });
  assert.deepEqual(r, { attempted: 0, started: [], skipped: [] });
});

test("redelivery with the same messageId is skipped — claim reports already_processed, run never fires", async () => {
  let runCalls = 0;
  const deps = fakeDeps({
    claimRun: async (deploymentId, orgId, messageId) => {
      assert.equal(deploymentId, "dep_1");
      assert.equal(messageId, "msg_1");
      return { claimed: false, reason: "already_processed" };
    },
    runAgenticTurn: async () => {
      runCalls += 1;
      return { ok: true };
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(runCalls, 0);
  assert.deepEqual(r.skipped, ["dep_1"]);
  assert.deepEqual(r.started, []);
});

test("FIX 1 — cap reached: claim reports capped, deployment is skipped (not run) and a push_run_capped event is logged", async () => {
  let runCalls = 0;
  const logs: Array<{ event: string; data: Record<string, unknown> }> = [];
  const deps = fakeDeps({
    claimRun: async () => ({ claimed: false, reason: "capped" }),
    runAgenticTurn: async () => {
      runCalls += 1;
      return { ok: true };
    },
    log: (event, data) => {
      logs.push({ event, data });
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(runCalls, 0);
  assert.deepEqual(r.skipped, ["dep_1"]);
  assert.ok(
    logs.some((l) => l.event === "push_run_capped" && l.data.deploymentId === "dep_1"),
    `expected a push_run_capped log line, got: ${JSON.stringify(logs)}`,
  );
});

test("missing messageId -> still runs (defensive), claim called with null, and a structured warn is logged with payload keys only", async () => {
  let claimMessageId: string | null | undefined = undefined;
  const logs: Array<{ event: string; data: Record<string, unknown> }> = [];
  const deps = fakeDeps({
    claimRun: async (deploymentId, orgId, messageId) => {
      claimMessageId = messageId;
      return { claimed: true };
    },
    log: (event, data) => {
      logs.push({ event, data });
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { secretToken: "should-not-appear", subject: "hi" },
  });

  assert.deepEqual(r.started, ["dep_1"]);
  assert.equal(claimMessageId, null);
  const warnLog = logs.find((l) => l.event === "push_run_no_message_id");
  assert.ok(warnLog, `expected a push_run_no_message_id log line, got: ${JSON.stringify(logs)}`);
  // payload KEYS only, never values (no secret/content leakage).
  assert.deepEqual(new Set(warnLog!.data.payloadKeys as string[]), new Set(["secretToken", "subject"]));
  assert.equal(JSON.stringify(warnLog!.data).includes("should-not-appear"), false);
});

test("FIX 3 — a FAILED run (ok:false) releases its claim so a redelivery can retry", async () => {
  let releaseArgs: unknown = null;
  const deps = fakeDeps({
    runAgenticTurn: async () => ({ ok: false }),
    releaseClaim: async (deploymentId, messageId) => {
      releaseArgs = { deploymentId, messageId };
    },
  });

  await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.deepEqual(releaseArgs, { deploymentId: "dep_1", messageId: "msg_1" });
});

test("FIX 3 — a THROWING run also releases its claim", async () => {
  let releaseArgs: unknown = null;
  const deps = fakeDeps({
    runAgenticTurn: async () => {
      throw new Error("timeout");
    },
    releaseClaim: async (deploymentId, messageId) => {
      releaseArgs = { deploymentId, messageId };
    },
  });

  await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.deepEqual(releaseArgs, { deploymentId: "dep_1", messageId: "msg_1" });
});

test("a SUCCESSFUL run does NOT release its claim", async () => {
  let releaseCalled = false;
  const deps = fakeDeps({
    runAgenticTurn: async () => ({ ok: true }),
    releaseClaim: async () => {
      releaseCalled = true;
    },
  });

  await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(releaseCalled, false);
});

test("per-deployment error is isolated — one bad deployment never blocks the rest", async () => {
  const deps = fakeDeps({
    listMatchingDeployments: async () => [match({ deploymentId: "dep_bad" }), match({ deploymentId: "dep_ok" })],
    runAgenticTurn: async (args) => {
      if (args.deploymentId === "dep_bad") throw new Error("boom");
      return { ok: true };
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_2" },
  });

  assert.deepEqual(r.started.sort(), ["dep_bad", "dep_ok"].sort());
});

test("listMatchingDeployments throwing -> never throws, returns empty result", async () => {
  const deps = fakeDeps({
    listMatchingDeployments: async () => {
      throw new Error("db down");
    },
  });
  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: {},
  });
  assert.deepEqual(r, { attempted: 0, started: [], skipped: [] });
});

test("claimRun throwing -> treated as not-claimed, never throws the dispatcher", async () => {
  const deps = fakeDeps({
    claimRun: async () => {
      throw new Error("db down");
    },
  });
  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });
  assert.deepEqual(r.skipped, ["dep_1"]);
  assert.deepEqual(r.started, []);
});

// Agent receipts slice (Task 2a) — the optional writeReceipt DI hook.
test("a successful run calls writeReceipt with status ok + the turn's toolCalls/sourceRef", async () => {
  const receipts: Array<Record<string, unknown>> = [];
  const deps = fakeDeps({
    runAgenticTurn: async () => ({
      ok: true,
      toolCalls: [{ tool: "GMAIL_SEND_EMAIL", ok: true, note: "Sent." }],
      replyText: "Replied to the lead.",
    }),
    writeReceipt: async (args) => {
      receipts.push(args as unknown as Record<string, unknown>);
    },
  });

  await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].orgId, ORG);
  assert.equal(receipts[0].deploymentId, "dep_1");
  assert.equal(receipts[0].status, "ok");
  assert.equal(receipts[0].sourceRef, "msg_1");
  assert.deepEqual(receipts[0].toolCalls, [{ tool: "GMAIL_SEND_EMAIL", ok: true, note: "Sent." }]);
  assert.equal(receipts[0].replyText, "Replied to the lead.");
});

test("a failed run (ok:false) calls writeReceipt with status error", async () => {
  const receipts: Array<Record<string, unknown>> = [];
  const deps = fakeDeps({
    runAgenticTurn: async () => ({ ok: false }),
    writeReceipt: async (args) => {
      receipts.push(args as unknown as Record<string, unknown>);
    },
  });

  await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].status, "error");
});

test("a THROWING run also calls writeReceipt with status error (never blocks the release-claim path)", async () => {
  const receipts: Array<Record<string, unknown>> = [];
  let releaseArgs: unknown = null;
  const deps = fakeDeps({
    runAgenticTurn: async () => {
      throw new Error("timeout");
    },
    releaseClaim: async (deploymentId, messageId) => {
      releaseArgs = { deploymentId, messageId };
    },
    writeReceipt: async (args) => {
      receipts.push(args as unknown as Record<string, unknown>);
    },
  });

  await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].status, "error");
  assert.deepEqual(releaseArgs, { deploymentId: "dep_1", messageId: "msg_1" });
});

test("a SKIPPED deployment (claim not granted) never calls writeReceipt", async () => {
  const receipts: Array<Record<string, unknown>> = [];
  const deps = fakeDeps({
    claimRun: async () => ({ claimed: false, reason: "already_processed" }),
    writeReceipt: async (args) => {
      receipts.push(args as unknown as Record<string, unknown>);
    },
  });

  await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.equal(receipts.length, 0);
});

test("no writeReceipt dep provided -> dispatch still completes (default no-op, existing callers unaffected)", async () => {
  const deps = fakeDeps();
  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });
  assert.deepEqual(r.started, ["dep_1"]);
});

test("a throwing writeReceipt is swallowed — never affects the dispatch result or claim release", async () => {
  const deps = fakeDeps({
    runAgenticTurn: async () => ({ ok: false }),
    writeReceipt: async () => {
      throw new Error("receipt db down");
    },
  });

  const r = await dispatchComposioEventToDeployments(deps, {
    orgId: ORG,
    eventType: EVENT,
    payload: { messageId: "msg_1" },
  });

  assert.deepEqual(r.started, ["dep_1"]);
});

// Type-level sanity: ClaimRunResult is the discriminated union claimRun deps
// return — exercised implicitly by the fakes above, asserted here so the
// exported type stays part of the module's public contract.
test("ClaimRunResult shape", () => {
  const claimed: ClaimRunResult = { claimed: true };
  const notClaimed: ClaimRunResult = { claimed: false, reason: "capped" };
  assert.equal(claimed.claimed, true);
  assert.equal(notClaimed.claimed, false);
});
