// Replay gate v2 — attemptL0Replay's v2 execution branch
// (docs/superpowers/plans/2026-07-18-replay-gate-v2-spec.md §2, §3).
// Deliberately does NOT override `runSkill` in deps — unlike
// replay-before-llm.spec.ts's v1 tests (which fake runSkill entirely to
// isolate gate logic), these tests let the REAL @seldonframe/reelier
// runSkill execute against a FAKE tool registry, because the property
// under test IS the integration between the claim wrapper
// (wrapToolWithSendClaim, module-private) and reelier's real per-step
// loop — faking runSkill too would test nothing but our own mock.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { attemptL0Replay, type AttemptL0ReplayDeps } from "@/lib/deployments/replay/replay-before-llm";
import type { ReelierSkill } from "@seldonframe/reelier/skill";
import type { ReelierObservation, ReelierTool, ReelierToolRunCtx } from "@seldonframe/reelier";

const ORG = "org_1";
const DEPLOYMENT = "dep_1";
const SKILL_ID = "skill_1";
const MESSAGE_ID = "msg_123";

function baseInput() {
  return {
    orgId: ORG,
    deploymentId: DEPLOYMENT,
    orgSlug: "acme",
    timezone: "UTC",
    blueprint: { capabilities: [] } as never,
    trigger: { messageId: MESSAGE_ID, sender: "a@b.com", subject: "hi" },
  };
}

function makeStep(overrides: Partial<ReelierSkill["steps"][number]> = {}): ReelierSkill["steps"][number] {
  return {
    n: 1,
    title: "step",
    intent: "do a thing",
    actionTool: "look_up_availability",
    actionArgs: {},
    asserts: ["status == 200"],
    binds: [],
    effect: "read",
    line: 1,
    ...overrides,
  };
}

/** A v2-eligible 3-step skill: read -> destructive (step 2) -> idempotent-write. */
function v2Skill(): ReelierSkill {
  return {
    name: "v2-forwarder",
    description: "d",
    steps: [
      makeStep({ n: 1, title: "lookup", actionTool: "look_up_availability", effect: "read" }),
      makeStep({ n: 2, title: "send", actionTool: "take_message", effect: "destructive" }),
      makeStep({ n: 3, title: "escalate", actionTool: "escalate_to_human", effect: "idempotent-write" }),
    ],
    preamble: "",
    trailing: "",
  };
}

/** A v1-ELIGIBLE skill too (single destructive step, LAST) — used to prove
 *  "v2 refuses -> falls through to v1, byte-identical" without needing a
 *  golden-file diff: same skill, only the v2 preconditions vary. */
function v1AndV2EligibleSkill(): ReelierSkill {
  return {
    name: "v1-or-v2",
    description: "d",
    steps: [
      makeStep({ n: 1, title: "lookup", actionTool: "look_up_availability", effect: "read" }),
      makeStep({ n: 2, title: "send", actionTool: "take_message", effect: "destructive" }),
    ],
    preamble: "",
    trailing: "",
  };
}

function fakeTool(run: (args: unknown, ctx: ReelierToolRunCtx) => Promise<ReelierObservation>): ReelierTool {
  return { effect: "destructive", run };
}

const OK: ReelierObservation = { status: 200, headers: {}, body: "{}" };
const FAIL: ReelierObservation = { status: 500, headers: {}, body: JSON.stringify({ error: "boom" }) };

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.SF_REPLAY_GATE_V2;
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.SF_REPLAY_GATE_V2;
  else process.env.SF_REPLAY_GATE_V2 = savedFlag;
});

describe("attemptL0Replay — v2 happy path", () => {
  test("claim goes unknown->sent, and the POST-send step still executes for real", async () => {
    process.env.SF_REPLAY_GATE_V2 = "1";

    let lookupCalls = 0;
    let sendCalls = 0;
    let escalateCalls = 0;
    const claimCalls: Array<{ orgId: string; skillId: string; stepN: number; idempotencyKey: string }> = [];
    const markCalls: Array<{ claimId: string; outcome: string }> = [];

    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: SKILL_ID,
        skillMd: "irrelevant",
        idempotency: { stepN: 2, keyVar: "message_id" },
      }),
      parseSkill: async () => v2Skill(),
      buildTools: async () => ({
        look_up_availability: fakeTool(async () => {
          lookupCalls++;
          return OK;
        }),
        take_message: fakeTool(async () => {
          sendCalls++;
          return OK;
        }),
        escalate_to_human: fakeTool(async () => {
          escalateCalls++;
          return OK;
        }),
      }),
      claimSendStep: async (input) => {
        claimCalls.push(input);
        return { claimed: true, claimId: "claim_1" };
      },
      markSendClaimOutcome: async (claimId, outcome) => {
        markCalls.push({ claimId, outcome });
      },
    };

    const result = await attemptL0Replay(baseInput(), deps);

    assert.equal(result.kind, "passed");
    assert.equal(lookupCalls, 1);
    assert.equal(sendCalls, 1, "the real send tool must run exactly once on a fresh claim");
    assert.equal(escalateCalls, 1, "a post-send step must still execute for real");
    assert.deepEqual(claimCalls, [
      { orgId: ORG, skillId: SKILL_ID, stepN: 2, idempotencyKey: MESSAGE_ID },
    ]);
    assert.deepEqual(markCalls, [{ claimId: "claim_1", outcome: "sent" }]);

    if (result.kind === "passed") {
      const sendCall = result.toolCalls.find((c) => c.tool === "take_message");
      assert.ok(sendCall);
      assert.ok(!sendCall!.note?.includes("skipped-claimed"));
    }
  });
});

describe("attemptL0Replay — pre-send divergence still falls back", () => {
  test("a read-step failure BEFORE the destructive step -> kind:'diverged' (never failed-post-send), send never attempted", async () => {
    process.env.SF_REPLAY_GATE_V2 = "1";

    let sendCalls = 0;
    const claimCalls: unknown[] = [];

    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: SKILL_ID,
        skillMd: "irrelevant",
        idempotency: { stepN: 2, keyVar: "message_id" },
      }),
      parseSkill: async () => v2Skill(),
      buildTools: async () => ({
        look_up_availability: fakeTool(async () => FAIL), // step 1 fails its assert
        take_message: fakeTool(async () => {
          sendCalls++;
          return OK;
        }),
        escalate_to_human: fakeTool(async () => OK),
      }),
      claimSendStep: async (input) => {
        claimCalls.push(input);
        return { claimed: true, claimId: "claim_1" };
      },
      markSendClaimOutcome: async () => {},
    };

    const result = await attemptL0Replay(baseInput(), deps);

    assert.equal(result.kind, "diverged");
    assert.equal(sendCalls, 0, "the destructive step must never even be attempted");
    assert.equal(claimCalls.length, 0, "no claim is ever taken before the destructive step runs");
  });
});

describe("attemptL0Replay — send tool error", () => {
  test("a failing send -> failed-post-send, claim outcome=failed, post-send steps never run", async () => {
    process.env.SF_REPLAY_GATE_V2 = "1";

    let escalateCalls = 0;
    const markCalls: Array<{ claimId: string; outcome: string }> = [];

    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: SKILL_ID,
        skillMd: "irrelevant",
        idempotency: { stepN: 2, keyVar: "message_id" },
      }),
      parseSkill: async () => v2Skill(),
      buildTools: async () => ({
        look_up_availability: fakeTool(async () => OK),
        take_message: fakeTool(async () => FAIL), // the send itself fails
        escalate_to_human: fakeTool(async () => {
          escalateCalls++;
          return OK;
        }),
      }),
      claimSendStep: async () => ({ claimed: true, claimId: "claim_1" }),
      markSendClaimOutcome: async (claimId, outcome) => {
        markCalls.push({ claimId, outcome });
      },
    };

    const result = await attemptL0Replay(baseInput(), deps);

    assert.equal(result.kind, "failed-post-send");
    if (result.kind === "failed-post-send") {
      assert.equal(result.destructiveStepN, 2);
    }
    assert.deepEqual(markCalls, [{ claimId: "claim_1", outcome: "failed" }]);
    assert.equal(escalateCalls, 0, "steps after a diverged destructive step are skipped by reelier itself");
  });
});

describe("attemptL0Replay — claim-error fails closed", () => {
  test("an ambiguous claim (claim-error) refuses to execute the send at all", async () => {
    process.env.SF_REPLAY_GATE_V2 = "1";

    let sendCalls = 0;

    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: SKILL_ID,
        skillMd: "irrelevant",
        idempotency: { stepN: 2, keyVar: "message_id" },
      }),
      parseSkill: async () => v2Skill(),
      buildTools: async () => ({
        look_up_availability: fakeTool(async () => OK),
        take_message: fakeTool(async () => {
          sendCalls++;
          return OK;
        }),
        escalate_to_human: fakeTool(async () => OK),
      }),
      claimSendStep: async () => ({ claimed: false, reason: "claim-error" }),
      markSendClaimOutcome: async () => {},
    };

    const result = await attemptL0Replay(baseInput(), deps);

    assert.equal(result.kind, "failed-post-send");
    assert.equal(sendCalls, 0, "an ambiguous claim must never execute the real send tool");
  });
});

describe("attemptL0Replay — redelivery convergence", () => {
  test("already-claimed (redelivery) -> the send is skipped-claimed, but post-send steps still run for real", async () => {
    process.env.SF_REPLAY_GATE_V2 = "1";

    let sendCalls = 0;
    let escalateCalls = 0;

    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: SKILL_ID,
        skillMd: "irrelevant",
        idempotency: { stepN: 2, keyVar: "message_id" },
      }),
      parseSkill: async () => v2Skill(),
      buildTools: async () => ({
        look_up_availability: fakeTool(async () => OK),
        take_message: fakeTool(async () => {
          sendCalls++;
          return OK;
        }),
        escalate_to_human: fakeTool(async () => {
          escalateCalls++;
          return OK;
        }),
      }),
      claimSendStep: async () => ({ claimed: false, reason: "already-claimed" }),
      markSendClaimOutcome: async () => {},
    };

    const result = await attemptL0Replay(baseInput(), deps);

    assert.equal(result.kind, "passed");
    assert.equal(sendCalls, 0, "the real send tool must NEVER run on a redelivery");
    assert.equal(escalateCalls, 1, "post-send steps must still run — redelivery convergence");

    if (result.kind === "passed") {
      const sendCall = result.toolCalls.find((c) => c.tool === "take_message");
      assert.ok(sendCall?.note?.includes("skipped-claimed"));
    }
  });
});

describe("attemptL0Replay — v2 gate refuses -> falls through to v1, byte-identical", () => {
  test("SF_REPLAY_GATE_V2 off -> v1 path runs unchanged, the claim ledger is never touched", async () => {
    delete process.env.SF_REPLAY_GATE_V2;

    const claimCalls: unknown[] = [];
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: SKILL_ID,
        skillMd: "irrelevant",
        idempotency: { stepN: 2, keyVar: "message_id" }, // config present but flag is off
      }),
      parseSkill: async () => v1AndV2EligibleSkill(),
      buildTools: async () => ({}),
      runSkill: async () => ({
        skill: "v1-or-v2",
        startedAt: "2026-07-18T00:00:00.000Z",
        finishedAt: "2026-07-18T00:00:01.000Z",
        passed: true,
        steps: [
          { n: 1, title: "lookup", level: 0, outcome: "passed", ms: 1, failures: [] },
          { n: 2, title: "send", level: 0, outcome: "passed", ms: 1, failures: [] },
        ],
        totals: { steps: 2, passed: 2, unchecked: 0, skipped: 0, failed: 0, ms: 2, llmInputTokens: 0, llmOutputTokens: 0 },
      }),
      claimSendStep: async (input) => {
        claimCalls.push(input);
        return { claimed: true, claimId: "should-never-happen" };
      },
    };

    const result = await attemptL0Replay(baseInput(), deps);

    assert.equal(result.kind, "passed");
    assert.equal(claimCalls.length, 0, "the claim ledger must never engage when the flag is off");
    if (result.kind === "passed") {
      assert.ok(result.toolCalls.every((c) => c.note?.startsWith("replay-l0:")), "v1's own toolCalls note format, not v2's");
    }
  });

  test("keyVar 'sender' (forbidden key material) -> config invalid -> v1 path runs unchanged", async () => {
    process.env.SF_REPLAY_GATE_V2 = "1";

    const claimCalls: unknown[] = [];
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: SKILL_ID,
        skillMd: "irrelevant",
        idempotency: { stepN: 2, keyVar: "sender" },
      }),
      parseSkill: async () => v1AndV2EligibleSkill(),
      buildTools: async () => ({}),
      runSkill: async () => ({
        skill: "v1-or-v2",
        startedAt: "2026-07-18T00:00:00.000Z",
        finishedAt: "2026-07-18T00:00:01.000Z",
        passed: true,
        steps: [{ n: 1, title: "lookup", level: 0, outcome: "passed", ms: 1, failures: [] }, { n: 2, title: "send", level: 0, outcome: "passed", ms: 1, failures: [] }],
        totals: { steps: 2, passed: 2, unchecked: 0, skipped: 0, failed: 0, ms: 2, llmInputTokens: 0, llmOutputTokens: 0 },
      }),
      claimSendStep: async (input) => {
        claimCalls.push(input);
        return { claimed: true, claimId: "should-never-happen" };
      },
    };

    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "passed");
    assert.equal(claimCalls.length, 0);
  });

  test("missing idempotency config -> v1 path runs unchanged", async () => {
    process.env.SF_REPLAY_GATE_V2 = "1";

    const claimCalls: unknown[] = [];
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: SKILL_ID, skillMd: "irrelevant" }), // no idempotency field at all
      parseSkill: async () => v1AndV2EligibleSkill(),
      buildTools: async () => ({}),
      runSkill: async () => ({
        skill: "v1-or-v2",
        startedAt: "2026-07-18T00:00:00.000Z",
        finishedAt: "2026-07-18T00:00:01.000Z",
        passed: true,
        steps: [{ n: 1, title: "lookup", level: 0, outcome: "passed", ms: 1, failures: [] }, { n: 2, title: "send", level: 0, outcome: "passed", ms: 1, failures: [] }],
        totals: { steps: 2, passed: 2, unchecked: 0, skipped: 0, failed: 0, ms: 2, llmInputTokens: 0, llmOutputTokens: 0 },
      }),
      claimSendStep: async (input) => {
        claimCalls.push(input);
        return { claimed: true, claimId: "should-never-happen" };
      },
    };

    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "passed");
    assert.equal(claimCalls.length, 0);
  });

  test("two destructive steps -> passesGateV2 refuses -> falls through to v1's OWN refusal, identical reason text", async () => {
    process.env.SF_REPLAY_GATE_V2 = "1";

    const twoDestructive: ReelierSkill = {
      name: "two-destructive",
      description: "d",
      steps: [
        makeStep({ n: 1, title: "lookup", actionTool: "look_up_availability", effect: "read" }),
        makeStep({ n: 2, title: "send1", actionTool: "take_message", effect: "destructive" }),
        makeStep({ n: 3, title: "send2", actionTool: "book_appointment", effect: "destructive" }),
      ],
      preamble: "",
      trailing: "",
    };

    const claimCalls: unknown[] = [];
    let runSkillCalled = false;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: SKILL_ID,
        skillMd: "irrelevant",
        idempotency: { stepN: 2, keyVar: "message_id" },
      }),
      parseSkill: async () => twoDestructive,
      runSkill: async () => {
        runSkillCalled = true;
        throw new Error("should never be called — v1's own all-read gate must refuse first");
      },
      claimSendStep: async (input) => {
        claimCalls.push(input);
        return { claimed: true, claimId: "should-never-happen" };
      },
    };

    const result = await attemptL0Replay(baseInput(), deps);

    assert.equal(result.kind, "skipped");
    if (result.kind === "skipped") {
      assert.match(result.reason, /all-read gate refused/);
    }
    assert.equal(claimCalls.length, 0);
    assert.equal(runSkillCalled, false);
  });
});
