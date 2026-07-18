// Deterministic replay — Reelier phase 2c slice 2. attemptL0Replay: DI'd
// unit tests covering the org-scoped enabled-skill lookup, the all-read
// gate, a clean PASS, and a DIVERGE — all with fake reelier calls (no real
// parseSkill/runSkill import needed for most of these; passesAllReadGate IS
// exercised against real ReelierSkill-shaped fixtures).

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  attemptL0Replay,
  passesAllReadGate,
  type AttemptL0ReplayDeps,
  type AttemptL0ReplayInput,
} from "@/lib/deployments/replay/replay-before-llm";
import type { ReelierSkill } from "@seldonframe/reelier/skill";
import type { ReelierRunRecord } from "@seldonframe/reelier";

const ORG = "org_1";
const DEPLOYMENT = "dep_1";

function baseInput(): AttemptL0ReplayInput {
  return {
    orgId: ORG,
    deploymentId: DEPLOYMENT,
    orgSlug: "acme",
    timezone: "America/Toronto",
    blueprint: { capabilities: [] } as never,
  };
}

function makeStep(overrides: Partial<ReelierSkill["steps"][number]> = {}): ReelierSkill["steps"][number] {
  return {
    n: 1,
    title: "step",
    intent: "do a thing",
    actionTool: "get_note",
    actionArgs: {},
    asserts: [],
    binds: [],
    effect: "read",
    line: 1,
    ...overrides,
  };
}

function passingRecord(skillName: string, stepCount: number): ReelierRunRecord {
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    n: i + 1,
    title: `step ${i + 1}`,
    level: 0,
    outcome: "passed" as const,
    ms: 5,
    failures: [],
  }));
  return {
    skill: skillName,
    startedAt: "2026-07-17T00:00:00.000Z",
    finishedAt: "2026-07-17T00:00:01.000Z",
    passed: true,
    steps,
    totals: {
      steps: stepCount,
      passed: stepCount,
      unchecked: 0,
      skipped: 0,
      failed: 0,
      ms: 5 * stepCount,
      llmInputTokens: 0,
      llmOutputTokens: 0,
    },
  };
}

function divergedRecord(skillName: string): ReelierRunRecord {
  return {
    skill: skillName,
    startedAt: "2026-07-17T00:00:00.000Z",
    finishedAt: "2026-07-17T00:00:01.000Z",
    passed: false,
    steps: [
      { n: 1, title: "step 1", level: 0, outcome: "failed", ms: 5, failures: ["status == 200 failed: got 500"] },
    ],
    totals: { steps: 1, passed: 0, unchecked: 0, skipped: 0, failed: 1, ms: 5, llmInputTokens: 0, llmOutputTokens: 0 },
  };
}

describe("passesAllReadGate — v1 policy", () => {
  test("all-read skill passes", () => {
    const skill = {
      steps: [
        makeStep({ effect: "read", actionTool: "look_up_availability" }),
        makeStep({ n: 2, effect: "read", actionTool: "look_up_availability" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });

  test("read steps followed by ONE final non-read step passes", () => {
    const skill = {
      steps: [
        makeStep({ effect: "read", actionTool: "look_up_availability" }),
        makeStep({ n: 2, effect: "idempotent-write" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });

  test("a single write-only step (last==only) passes", () => {
    const skill = { steps: [makeStep({ effect: "destructive" })] } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });

  test("a non-read step BEFORE the last step fails the gate", () => {
    const skill = {
      steps: [
        makeStep({ effect: "idempotent-write" }),
        makeStep({ n: 2, effect: "read" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), false);
  });

  test("two non-read steps fails the gate", () => {
    const skill = {
      steps: [
        makeStep({ effect: "idempotent-write" }),
        makeStep({ n: 2, effect: "destructive" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), false);
  });

  test("an empty skill (no steps) never passes", () => {
    assert.equal(passesAllReadGate({ steps: [] } as unknown as ReelierSkill), false);
  });
});

describe("passesAllReadGate — tool-effects allowlist wired in (the search_and_purge attack)", () => {
  test("an ALLOWLISTED destructive tool declared 'read' in skill_md is NOT trusted — gate fails when it isn't the last step", () => {
    // book_appointment is allowlisted 'destructive' (tool-effects.ts). A
    // compiler bug or a hand-edited skill_md could still claim effect:'read'
    // for it — the allowlist must win over that text.
    const skill = {
      steps: [
        makeStep({ effect: "read", actionTool: "book_appointment" }),
        makeStep({ n: 2, effect: "read", actionTool: "look_up_availability" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), false);
  });

  test("an UNKNOWN tool declared 'read' in skill_md is NEVER trusted — gate fails even though skill_md says read (the literal attack)", () => {
    // A hypothetical tool like `search_and_purge` isn't in the allowlist at
    // all. Under the OLD gate (trusting skill_md's effect line directly),
    // this would have passed as 'read' anywhere in the sequence — exactly
    // reelier's verb-prefix heuristic misclassifying a destructive tool
    // because its name starts with "search". The allowlist forces any
    // UNKNOWN tool to 'destructive', so it can only ever be the bounded
    // final step, never a mid-sequence "read".
    const skill = {
      steps: [
        makeStep({ effect: "read", actionTool: "search_and_purge" }),
        makeStep({ n: 2, effect: "read", actionTool: "look_up_availability" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), false);
  });

  test("an UNKNOWN tool as the sole/final step still passes (bounded exactly like a known-destructive final step)", () => {
    const skill = {
      steps: [makeStep({ effect: "read", actionTool: "search_and_purge" })],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });

  test("an allowlisted read tool passes even when skill_md's own effect line disagrees", () => {
    // look_up_availability is allowlisted 'read' — trusted regardless of
    // what skill_md's (untrusted) effect line claims.
    const skill = {
      steps: [
        makeStep({ effect: "destructive", actionTool: "look_up_availability" }),
        makeStep({ n: 2, effect: "read", actionTool: "look_up_availability" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });
});

describe("passesAllReadGate — recorded actionTool names carry an MCP-server prefix", () => {
  test("an all-read skill whose action tools are composio__-prefixed passes the gate", () => {
    const skill = {
      steps: [
        makeStep({ effect: "read", actionTool: "composio__GMAIL_FETCH_EMAILS" }),
        makeStep({ n: 2, effect: "read", actionTool: "composio__GMAIL_LIST_LABELS" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });

  test("a composio__-prefixed destructive send mid-sequence still fails the gate", () => {
    const skill = {
      steps: [
        makeStep({ effect: "read", actionTool: "composio__GMAIL_SEND_EMAIL" }),
        makeStep({ n: 2, effect: "read", actionTool: "composio__GMAIL_FETCH_EMAILS" }),
      ],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), false);
  });

  test("a composio__-prefixed destructive send as the sole/final step still passes (bounded)", () => {
    const skill = {
      steps: [makeStep({ effect: "read", actionTool: "composio__GMAIL_SEND_EMAIL" })],
    } as ReelierSkill;
    assert.equal(passesAllReadGate(skill), true);
  });
});

describe("attemptL0Replay — org-scoped enabled-skill lookup", () => {
  test("skips when no enabled skill exists for this org+deployment", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => null,
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "skipped");
  });

  test("passes the exact orgId + deploymentId through to the lookup (never a different org's skill)", async () => {
    let seenArgs: [string, string] | null = null;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async (orgId, deploymentId) => {
        seenArgs = [orgId, deploymentId];
        return null;
      },
    };
    await attemptL0Replay(baseInput(), deps);
    assert.deepEqual(seenArgs, [ORG, DEPLOYMENT]);
  });
});

describe("attemptL0Replay — all-read gate wired into the attempt", () => {
  test("a mixed-effect skill (non-read before last) is skipped WITHOUT ever calling runSkill", async () => {
    const skill: ReelierSkill = {
      name: "mixed",
      description: "d",
      steps: [
        makeStep({ effect: "idempotent-write" }),
        makeStep({ n: 2, effect: "read" }),
      ],
      preamble: "",
      trailing: "",
    };
    let runSkillCalled = false;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "irrelevant" }),
      parseSkill: async () => skill,
      runSkill: async () => {
        runSkillCalled = true;
        return passingRecord("mixed", 2);
      },
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "skipped");
    assert.equal(runSkillCalled, false);
  });
});

describe("attemptL0Replay — PASS", () => {
  test("a clean replay returns kind:'passed' with toolCalls tagged replay-l0", async () => {
    const skill: ReelierSkill = {
      name: "all-read",
      description: "d",
      steps: [makeStep({ effect: "read", actionTool: "get_note" })],
      preamble: "",
      trailing: "",
    };
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "irrelevant" }),
      parseSkill: async () => skill,
      buildTools: async () => ({}),
      runSkill: async () => passingRecord("all-read", 1),
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "passed");
    if (result.kind === "passed") {
      assert.equal(result.skillId, "skill_1");
      assert.equal(result.toolCalls.length, 1);
      assert.equal(result.toolCalls[0].tool, "get_note");
      assert.ok(result.toolCalls[0].note?.includes("replay-l0"));
    }
  });

  test("runSkill is called with maxLevel:0, allowDestructive:false, dryRun:true", async () => {
    const skill: ReelierSkill = {
      name: "s",
      description: "d",
      steps: [makeStep({ effect: "read" })],
      preamble: "",
      trailing: "",
    };
    let seenOptions: unknown = null;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => skill,
      buildTools: async () => ({}),
      runSkill: async (_skill, options) => {
        seenOptions = options;
        return passingRecord("s", 1);
      },
    };
    await attemptL0Replay(baseInput(), deps);
    const opts = seenOptions as { maxLevel?: number; allowDestructive?: boolean; dryRun?: boolean };
    assert.equal(opts.maxLevel, 0);
    assert.equal(opts.allowDestructive, false);
    assert.equal(opts.dryRun, true);
  });
});

describe("attemptL0Replay — DIVERGE / throw", () => {
  test("a failed run record returns kind:'diverged' with failures collected", async () => {
    const skill: ReelierSkill = {
      name: "s",
      description: "d",
      steps: [makeStep({ effect: "read" })],
      preamble: "",
      trailing: "",
    };
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => skill,
      buildTools: async () => ({}),
      runSkill: async () => divergedRecord("s"),
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "diverged");
    if (result.kind === "diverged") {
      assert.equal(result.skillId, "skill_1");
      assert.ok(result.failures.length > 0);
    }
  });

  test("a thrown runSkill is treated as a diverge, never propagates", async () => {
    const skill: ReelierSkill = {
      name: "s",
      description: "d",
      steps: [makeStep({ effect: "read" })],
      preamble: "",
      trailing: "",
    };
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => skill,
      buildTools: async () => ({}),
      runSkill: async () => {
        throw new Error("network blew up");
      },
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "diverged");
  });

  test("a throwing loadEnabledSkill degrades to skipped, never throws (fail-open)", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => {
        throw new Error("db down");
      },
    };
    await assert.doesNotReject(attemptL0Replay(baseInput(), deps));
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "skipped");
  });

  test("flag off unchanged: no trigger on the input still runs a clean replay with empty-string vars", async () => {
    // Guards the byte-for-byte-unchanged claim for every caller that
    // doesn't (yet) thread a real event — the old `vars: {}` behavior.
    const skill: ReelierSkill = {
      name: "s",
      description: "d",
      steps: [makeStep({ effect: "read" })],
      preamble: "",
      trailing: "",
    };
    let seenVars: unknown;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => skill,
      buildTools: async () => ({}),
      runSkill: async (_skill, options) => {
        seenVars = (options as { vars?: unknown }).vars;
        return passingRecord("s", 1);
      },
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "passed");
    assert.deepEqual(seenVars, { message_id: "", sender: "", subject: "" });
  });

  test("an unparseable skill_md is skipped, not thrown", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "not a skill" }),
      parseSkill: async () => {
        throw new Error("Frontmatter fence never closed");
      },
    };
    const result = await attemptL0Replay(baseInput(), deps);
    assert.equal(result.kind, "skipped");
  });
});

describe("attemptL0Replay — trigger vars threading ({{message_id}}/sender/subject)", () => {
  const allReadSkill: ReelierSkill = {
    name: "s",
    description: "d",
    steps: [makeStep({ effect: "read" })],
    preamble: "",
    trailing: "",
  };

  test("message_id fills from the event's already-extracted trigger_key", async () => {
    let seenVars: unknown;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => allReadSkill,
      buildTools: async () => ({}),
      runSkill: async (_skill, options) => {
        seenVars = (options as { vars?: unknown }).vars;
        return passingRecord("s", 1);
      },
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_abc123", sender: "", subject: "" },
    };
    const result = await attemptL0Replay(input, deps);
    assert.equal(result.kind, "passed");
    assert.deepEqual(seenVars, { message_id: "msg_abc123", sender: "", subject: "" });
  });

  test("sender/subject fill from the event when the payload carried them", async () => {
    let seenVars: unknown;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => allReadSkill,
      buildTools: async () => ({}),
      runSkill: async (_skill, options) => {
        seenVars = (options as { vars?: unknown }).vars;
        return passingRecord("s", 1);
      },
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_1", sender: "ops@seldonframe.com", subject: "Weekly digest" },
    };
    await attemptL0Replay(input, deps);
    assert.deepEqual(seenVars, {
      message_id: "msg_1",
      sender: "ops@seldonframe.com",
      subject: "Weekly digest",
    });
  });

  test("a null messageId fills as empty string, never the literal 'null'", async () => {
    let seenVars: unknown;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => allReadSkill,
      buildTools: async () => ({}),
      runSkill: async (_skill, options) => {
        seenVars = (options as { vars?: unknown }).vars;
        return passingRecord("s", 1);
      },
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: null, sender: "", subject: "" },
    };
    await attemptL0Replay(input, deps);
    assert.deepEqual(seenVars, { message_id: "", sender: "", subject: "" });
  });

  test("an unresolved {{var}} beyond the fixed set still diverges — reelier's own fillTemplate throw is unchanged", async () => {
    // The runner (reelier's runSkill) is the thing that actually throws on
    // an unresolved template var — this test proves attemptL0Replay's own
    // fail-open/diverge contract still catches that throw exactly like any
    // other runSkill failure, now that vars are no longer always {}.
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => allReadSkill,
      buildTools: async () => ({}),
      runSkill: async () => {
        throw new Error("unresolved template var {{unmapped_var}}");
      },
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_1", sender: "", subject: "" },
    };
    const result = await attemptL0Replay(input, deps);
    assert.equal(result.kind, "diverged");
  });
});

describe("attemptL0Replay — trigger_filter gate wired into the attempt", () => {
  const allReadSkill: ReelierSkill = {
    name: "s",
    description: "d",
    steps: [makeStep({ effect: "read" })],
    preamble: "",
    trailing: "",
  };

  test("a matching senderEndsWith filter attempts replay as normal", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: "skill_1",
        skillMd: "x",
        triggerFilter: { senderEndsWith: "@seldonframe.com" },
      }),
      parseSkill: async () => allReadSkill,
      buildTools: async () => ({}),
      runSkill: async () => passingRecord("s", 1),
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_1", sender: "ops@seldonframe.com", subject: "" },
    };
    const result = await attemptL0Replay(input, deps);
    assert.equal(result.kind, "passed");
  });

  test("a case-mismatched-but-equivalent senderEndsWith still matches (case-insensitive)", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: "skill_1",
        skillMd: "x",
        triggerFilter: { senderEndsWith: "@SeldonFrame.COM" },
      }),
      parseSkill: async () => allReadSkill,
      buildTools: async () => ({}),
      runSkill: async () => passingRecord("s", 1),
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_1", sender: "ops@seldonframe.com", subject: "" },
    };
    const result = await attemptL0Replay(input, deps);
    assert.equal(result.kind, "passed");
  });

  test("a mismatched senderEndsWith SKIPS replay without calling parseSkill, buildTools, or runSkill", async () => {
    let parseSkillCalled = false;
    let buildToolsCalled = false;
    let runSkillCalled = false;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: "skill_1",
        skillMd: "x",
        triggerFilter: { senderEndsWith: "@seldonframe.com" },
      }),
      parseSkill: async () => {
        parseSkillCalled = true;
        return allReadSkill;
      },
      buildTools: async () => {
        buildToolsCalled = true;
        return {};
      },
      runSkill: async () => {
        runSkillCalled = true;
        return passingRecord("s", 1);
      },
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_1", sender: "someone@gmail.com", subject: "" },
    };
    const result = await attemptL0Replay(input, deps);
    assert.equal(result.kind, "skipped");
    assert.equal(parseSkillCalled, false, "filter mismatch must skip BEFORE parseSkill");
    assert.equal(buildToolsCalled, false, "filter mismatch must skip BEFORE the tool bridge");
    assert.equal(runSkillCalled, false, "filter mismatch must never reach runSkill");
  });

  test("subjectContains gate: matches", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: "skill_1",
        skillMd: "x",
        triggerFilter: { subjectContains: "labeler" },
      }),
      parseSkill: async () => allReadSkill,
      buildTools: async () => ({}),
      runSkill: async () => passingRecord("s", 1),
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_1", sender: "", subject: "labeler run 42" },
    };
    const result = await attemptL0Replay(input, deps);
    assert.equal(result.kind, "passed");
  });

  test("multiple conditions are AND-matched — one mismatch skips", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: "skill_1",
        skillMd: "x",
        triggerFilter: { senderEndsWith: "@seldonframe.com", subjectContains: "labeler" },
      }),
      parseSkill: async () => allReadSkill,
      buildTools: async () => ({}),
      runSkill: async () => passingRecord("s", 1),
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_1", sender: "ops@seldonframe.com", subject: "unrelated" },
    };
    const result = await attemptL0Replay(input, deps);
    assert.equal(result.kind, "skipped");
  });

  test("a null trigger_filter (undefined on the row) attempts replay — no filter means every event", async () => {
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({ id: "skill_1", skillMd: "x" }),
      parseSkill: async () => allReadSkill,
      buildTools: async () => ({}),
      runSkill: async () => passingRecord("s", 1),
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_1", sender: "whoever@anywhere.com", subject: "" },
    };
    const result = await attemptL0Replay(input, deps);
    assert.equal(result.kind, "passed");
  });

  test("a malformed trigger_filter (unknown key) SKIPS replay without calling parseSkill/buildTools/runSkill — fail-safe", async () => {
    let parseSkillCalled = false;
    const deps: AttemptL0ReplayDeps = {
      loadEnabledSkill: async () => ({
        id: "skill_1",
        skillMd: "x",
        triggerFilter: { bogusKey: "y" },
      }),
      parseSkill: async () => {
        parseSkillCalled = true;
        return allReadSkill;
      },
      buildTools: async () => ({}),
      runSkill: async () => passingRecord("s", 1),
    };
    const input: AttemptL0ReplayInput = {
      ...baseInput(),
      trigger: { messageId: "msg_1", sender: "ops@seldonframe.com", subject: "" },
    };
    const result = await attemptL0Replay(input, deps);
    assert.equal(result.kind, "skipped");
    assert.equal(parseSkillCalled, false);
  });
});
