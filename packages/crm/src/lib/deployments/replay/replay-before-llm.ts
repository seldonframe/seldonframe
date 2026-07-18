// Deterministic replay — Reelier phase 2c, slice 2. attemptL0Replay: try to
// satisfy a deployment's turn with a deterministic L0 skill replay BEFORE
// ever constructing an LLM turn. Called from
// composio-event-dispatch-deps.ts (via replay-or-turn.ts), only when
// SF_DETERMINISTIC_REPLAY=1.
//
// v1 SCOPE, deliberately narrow:
//   - maxLevel 0 ONLY — zero LLM calls, by construction (reelier's own
//     contract: `--max-level 0` never constructs an `llm` client).
//   - allowDestructive false — a `destructive`-effect step always refuses
//     inside the runner regardless of our own gate below (belt + suspenders).
//   - TRIGGER VARS (gap 1, closed): `vars` is built from the fired event —
//     `message_id` (the Gmail id, already extracted upstream as
//     trigger_key), plus `sender`/`subject` when the composio payload
//     carries them ("" when absent — never assumed present). These are the
//     ONLY vars filled; an unresolved `{{var}}` beyond these still throws
//     inside reelier's fillTemplate, which the runner already turns into a
//     normal step failure → diverge (unchanged fail-safe).
//   - TRIGGER FILTER (gap 2, closed): a linear skill can't branch, but a
//     push deployment receives EVERY fired event. `trigger_filter`
//     (replay_skills.trigger_filter, migration 0076) is evaluated via
//     ./trigger-filter.ts immediately after the enabled skill loads —
//     BEFORE parseSkill or the tool bridge ever run — so a mismatch skips
//     replay entirely (no tool construction) and falls through to the
//     normal agentic turn, which still handles the conditional itself.
//
// HARD SAFETY — never send email/SMS twice: if replay executes some steps
// then diverges, the caller (replay-or-turn.ts) falls back to a FRESH
// agentic turn. Steps already executed during a diverged replay may have had
// real effects — reads are safe to repeat, a write is not. MITIGATE (v1
// policy, not a general solution): only attempt replay when the skill's
// steps are ALL effect 'read' except AT MOST ONE FINAL non-read step
// (passesAllReadGate below). This does not eliminate the risk on that one
// final step (if ITS assert fails after the tool call already ran, the
// write already happened and the fallback turn may repeat it) — it only
// BOUNDS the exposure to a single step instead of an arbitrary prefix. That
// residual risk is accepted for v1 and must be revisited before this gate is
// loosened (e.g. before mid-sequence writes are ever allowed).
import type { AgentBlueprint } from "@/db/schema/agents";
import type { ToolExecuteContext } from "@/lib/agents/tools";
import type { ReplaySkillIdempotency } from "@/db/schema/replay-skills";
import type { ReplaySendClaimOutcome } from "@/db/schema/replay-send-claims";
import type {
  ReelierObservation,
  ReelierRunRecord,
  ReelierTool,
  ReelierToolRunCtx,
} from "@seldonframe/reelier";
import type { ReelierSkill, ReelierSkillStep } from "@seldonframe/reelier/skill";
import { effectForTool } from "./tool-effects";
import { evaluateTriggerFilter } from "./trigger-filter";
import { passesGateV2, validateIdempotencyConfig } from "./gate-v2";
import {
  claimSendStep as defaultClaimSendStep,
  markSendClaimOutcome as defaultMarkSendClaimOutcome,
  type ClaimSendStepResult,
} from "./send-claim";
import { isReplayGateV2On } from "@/lib/web-build/policy";

/** The fired event's trigger fields, threaded through to (a) fill a skill's
 *  `{{message_id}}`/`{{sender}}`/`{{subject}}` template vars and (b)
 *  evaluate the enabled skill's trigger_filter. Optional on the input —
 *  callers that don't (yet) thread a real event get the empty-string/null
 *  defaults below, byte-for-byte the old `vars: {}` behavior. */
export type AttemptL0ReplayTrigger = {
  messageId: string | null;
  sender: string;
  subject: string;
};

export type AttemptL0ReplayInput = {
  orgId: string;
  deploymentId: string;
  orgSlug: string;
  timezone: string;
  blueprint: AgentBlueprint;
  trigger?: AttemptL0ReplayTrigger;
};

export type AttemptL0ReplaySkippedResult = { kind: "skipped"; reason: string };
export type AttemptL0ReplayDivergedResult = {
  kind: "diverged";
  skillId: string;
  record: ReelierRunRecord;
  failures: string[];
};
export type AttemptL0ReplayPassedResult = {
  kind: "passed";
  skillId: string;
  record: ReelierRunRecord;
  toolCalls: Array<{ tool: string; ok: boolean; note?: string }>;
  replyText?: string;
};
/** Replay gate v2 ONLY (spec §3, "the asymmetric fallback") — a divergence
 *  AT or AFTER the v2 skill's destructive step. NEVER produced by v1 (v1
 *  never executes a non-final step, so it can never diverge "after" one).
 *  The caller (replay-or-turn.ts) MUST NOT fall back to the agentic turn
 *  for this kind — the destructive step may have already sent for real;
 *  falling back would risk a real double-send. */
export type AttemptL0ReplayFailedPostSendResult = {
  kind: "failed-post-send";
  skillId: string;
  record: ReelierRunRecord;
  failures: string[];
  destructiveStepN: number;
};
export type AttemptL0ReplayResult =
  | AttemptL0ReplaySkippedResult
  | AttemptL0ReplayDivergedResult
  | AttemptL0ReplayPassedResult
  | AttemptL0ReplayFailedPostSendResult;

// triggerFilter/idempotency are optional on the row shape (rather than
// required) so every existing fake constructing `{ id, skillMd }`
// (predating those gates) keeps compiling unchanged — `undefined` is
// treated identically to a stored `null` by evaluateTriggerFilter /
// validateIdempotencyConfig (no filter / not v2-eligible).
type EnabledSkillRow = {
  id: string;
  skillMd: string;
  triggerFilter?: unknown;
  idempotency?: unknown;
};

/**
 * A step's TRUSTED effect for gate purposes. Consults tool-effects.ts's
 * explicit allowlist FIRST — SF's own hand-classified truth about the tool's
 * real side effect, keyed by name. When the allowlist has never heard of the
 * tool (an unknown/third-party/typo'd name), the result is UNCONDITIONALLY
 * 'destructive' — the compiled skill's own `effect:` line is never consulted
 * for an unknown tool, not even to check whether it says 'destructive'. That
 * text came from reelier's verb-prefix heuristic over the tool NAME, not
 * from anything SF actually verified (this is the `search_and_purge` attack:
 * a destructive tool whose name happens to parse as a read verb), so it gets
 * zero influence on the gate either way. Net effect: an unknown tool is
 * ALWAYS treated as destructive here — it can only ever occupy the gate's
 * single bounded final-step slot, exactly like a genuinely destructive
 * allowlisted tool.
 */
export function trustedEffect(step: ReelierSkillStep): ReelierSkill["steps"][number]["effect"] {
  const known = effectForTool(step.actionTool);
  if (known !== undefined) return known;
  return "destructive";
}

/**
 * v1 replay gate: at most one non-read step, and it must be the LAST step.
 * Zero non-read steps (a pure-read skill) also passes trivially. An empty
 * skill (no steps) never passes — nothing to replay. "Non-read" here is the
 * ALLOWLIST-trusted effect (trustedEffect above), never skill_md's raw
 * `effect:` line directly.
 */
export function passesAllReadGate(skill: ReelierSkill): boolean {
  if (skill.steps.length === 0) return false;
  const lastIdx = skill.steps.length - 1;
  return skill.steps.every((step, idx) => trustedEffect(step) === "read" || idx === lastIdx);
}

/** Injectable I/O — defaults to real DB reads / reelier calls (kept out of
 *  the top-level import graph so this module stays test-friendly). */
export type AttemptL0ReplayDeps = {
  loadEnabledSkill?: (orgId: string, deploymentId: string) => Promise<EnabledSkillRow | null>;
  buildTools?: (input: AttemptL0ReplayInput) => Promise<Record<string, ReelierTool>>;
  parseSkill?: (source: string) => Promise<ReelierSkill>;
  runSkill?: (
    skill: ReelierSkill,
    options: import("@seldonframe/reelier").ReelierRunSkillOptions,
  ) => Promise<ReelierRunRecord>;
  /** Replay gate v2 ONLY. Defaults to send-claim.ts's real DB-backed
   *  claimSendStep/markSendClaimOutcome. Injected here (rather than only
   *  as a nested SendClaimDeps) so a test can fully control claim behavior
   *  — including simulating the unique-violation race — without touching
   *  Postgres, mirroring how buildTools/parseSkill/runSkill are already
   *  injected as whole functions. */
  claimSendStep?: (input: {
    orgId: string;
    skillId: string;
    stepN: number;
    idempotencyKey: string;
  }) => Promise<ClaimSendStepResult>;
  markSendClaimOutcome?: (claimId: string, outcome: ReplaySendClaimOutcome) => Promise<void>;
};

async function defaultLoadEnabledSkill(
  orgId: string,
  deploymentId: string,
): Promise<EnabledSkillRow | null> {
  const { db } = await import("@/db");
  const { replaySkills } = await import("@/db/schema/replay-skills");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await db
    .select({
      id: replaySkills.id,
      skillMd: replaySkills.skillMd,
      triggerFilter: replaySkills.triggerFilter,
      idempotency: replaySkills.idempotency,
    })
    .from(replaySkills)
    .where(
      and(
        eq(replaySkills.orgId, orgId),
        eq(replaySkills.deploymentId, deploymentId),
        eq(replaySkills.status, "enabled"),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function defaultParseSkill(source: string): Promise<ReelierSkill> {
  const { parseSkill } = await import("@seldonframe/reelier/skill");
  return parseSkill(source);
}

async function defaultRunSkillImpl(
  skill: ReelierSkill,
  options: import("@seldonframe/reelier").ReelierRunSkillOptions,
): Promise<ReelierRunRecord> {
  const { runSkill } = await import("@seldonframe/reelier");
  return runSkill(skill, options);
}

/**
 * Bridge SF's resolved agent tools (getToolsForCapabilities — the SAME
 * resolution stateless-turn.ts uses, but invoked here WITHOUT ever starting
 * an LLM turn) into a reelier Tool registry. Mapping mirrors reelier's own
 * mcp-tool.js contract: status 200 on success / 500 on a thrown error,
 * headers always {} (not an HTTP tool), body the JSON text of the raw
 * result (so `json.<path>` asserts/binds parse it directly, same as a
 * reelier-native MCP tool's text-content body).
 */
async function defaultBuildTools(
  input: AttemptL0ReplayInput,
): Promise<Record<string, ReelierTool>> {
  const { getToolsForCapabilities } = await import("@/lib/agents/tools");
  const tools = await getToolsForCapabilities(input.blueprint.capabilities, {
    orgId: input.orgId,
    connectors: input.blueprint.connectors,
  });

  const ctx: ToolExecuteContext = {
    orgId: input.orgId,
    orgSlug: input.orgSlug,
    // No real conversation exists for an L0 replay run — stable sentinels,
    // distinct from stateless-turn.ts's "template-test" sentinel so a
    // replay run is never mistaken for a template test in any downstream
    // log/read.
    agentId: input.deploymentId,
    conversationId: `replay-l0:${input.deploymentId}`,
    // Real execution, not sandboxed — an L0 replay run performs the SAME
    // real actions the recorded trace did (gated to at most one write step
    // by the all-read policy above).
    testMode: false,
    timezone: input.timezone || undefined,
  };

  const registry: Record<string, ReelierTool> = {};
  for (const tool of tools) {
    registry[tool.name] = {
      // Unused by the runner itself (it only consults the SKILL step's own
      // declared `effect`, not the Tool registry entry's — confirmed by
      // reelier's own mcp-tool.js comment). Present only to satisfy the
      // registry's shape.
      effect: "destructive",
      async run(args: unknown) {
        try {
          const result = await tool.execute(args, ctx);
          return { status: 200, headers: {}, body: JSON.stringify(result ?? null) };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return { status: 500, headers: {}, body: JSON.stringify({ error: message }) };
        }
      },
    };
  }
  return registry;
}

function emptyFailedRecord(skillName: string, reason: string): ReelierRunRecord {
  const now = new Date().toISOString();
  return {
    skill: skillName,
    startedAt: now,
    finishedAt: now,
    passed: false,
    steps: [],
    totals: {
      steps: 0,
      passed: 0,
      unchecked: 0,
      skipped: 0,
      failed: 0,
      ms: 0,
      llmInputTokens: 0,
      llmOutputTokens: 0,
    },
  };
}

/**
 * Wrap the ONE destructive tool with claim-before-send (spec §2). Every
 * OTHER tool in the registry passes through unchanged — reads and
 * idempotent-writes execute exactly as v1 already does, real reelier
 * runSkill, unmodified. This is the entire delta v2 makes to execution:
 * one tool's `run` gains a claim check.
 *
 * Claim outcomes:
 *  - `already-claimed` (a prior attempt already reached this step for this
 *    key) -> do NOT execute; return a synthetic success observation and
 *    record `events.skippedClaimed = true` (never a StepOutcome reelier
 *    itself knows about — read back by attemptV2Replay after runSkill
 *    returns, purely for toolCalls labeling). The step still needs to
 *    "pass" from reelier's point of view so post-send steps keep running
 *    (redelivery convergence, spec §3).
 *  - `claim-error` (ambiguous — DB couldn't confirm either way) -> THROW.
 *    v2 never trusts the compiled skill's own assert coverage for the one
 *    step with real-world consequences: an ambiguous claim must fail the
 *    step outright, not silently pass through.
 *  - claimed -> execute the real tool. A resulting `status >= 400` is ALSO
 *    thrown (not just muted into the observation, unlike every other
 *    tool's wrapper) for the same reason — the send step's own asserts are
 *    never the sole failure signal.
 */
function wrapToolWithSendClaim(
  tools: Record<string, ReelierTool>,
  toolName: string,
  claimInput: { orgId: string; skillId: string; stepN: number; idempotencyKey: string },
  events: { skippedClaimed: boolean },
  claimSendStepFn: (input: {
    orgId: string;
    skillId: string;
    stepN: number;
    idempotencyKey: string;
  }) => Promise<ClaimSendStepResult>,
  markSendClaimOutcomeFn: (claimId: string, outcome: ReplaySendClaimOutcome) => Promise<void>,
): Record<string, ReelierTool> {
  const original = tools[toolName];
  if (!original) return tools; // unknown tool — runner will fail naturally ("Unknown tool")

  const wrapped: ReelierTool = {
    effect: original.effect,
    async run(args: unknown, ctx: ReelierToolRunCtx): Promise<ReelierObservation> {
      const claim = await claimSendStepFn(claimInput);
      if (!claim.claimed) {
        if (claim.reason === "already-claimed") {
          events.skippedClaimed = true;
          return {
            status: 200,
            headers: {},
            body: JSON.stringify({ skipped: true, reason: "already-claimed" }),
          };
        }
        throw new Error(
          "send-claim could not be acquired (claim-error) — refusing to execute the destructive step",
        );
      }

      let result: ReelierObservation;
      try {
        result = await original.run(args, ctx);
      } catch (err) {
        await markSendClaimOutcomeFn(claim.claimId, "failed");
        throw err;
      }

      const sendFailed = typeof result?.status === "number" && result.status >= 400;
      await markSendClaimOutcomeFn(claim.claimId, sendFailed ? "failed" : "sent");
      if (sendFailed) {
        throw new Error(
          `destructive step tool returned status ${result.status} — treated as a send failure (v2 never trusts assert coverage for the send step)`,
        );
      }
      return result;
    },
  };
  return { ...tools, [toolName]: wrapped };
}

/**
 * The v2 execution path (spec §2, §3) — reuses the SAME reelier runSkill
 * v1 calls (real tool registry, real allowlist, real fillTemplate/assert
 * loop), with only the destructive tool wrapped for the claim. Returns
 * `null` when a runtime precondition isn't met (no message_id to key the
 * claim on) — the caller treats that as "fall through to v1", safe because
 * nothing has executed yet.
 */
async function attemptV2Replay(opts: {
  input: AttemptL0ReplayInput;
  skill: ReelierSkill;
  skillRow: EnabledSkillRow;
  trigger: AttemptL0ReplayTrigger;
  vars: Record<string, string>;
  destructiveStepN: number;
  buildTools: (input: AttemptL0ReplayInput) => Promise<Record<string, ReelierTool>>;
  runSkillFn: (
    skill: ReelierSkill,
    options: import("@seldonframe/reelier").ReelierRunSkillOptions,
  ) => Promise<ReelierRunRecord>;
  claimSendStepFn: (input: {
    orgId: string;
    skillId: string;
    stepN: number;
    idempotencyKey: string;
  }) => Promise<ClaimSendStepResult>;
  markSendClaimOutcomeFn: (claimId: string, outcome: ReplaySendClaimOutcome) => Promise<void>;
}): Promise<AttemptL0ReplayResult | null> {
  const { input, skill, skillRow, trigger, vars, destructiveStepN } = opts;

  // The ONLY allowed key var is message_id (gate-v2.ts's ALLOWED_KEY_VARS)
  // — if the fired event carries none, there is no key to claim on. Fall
  // through to v1 rather than guessing; nothing has executed yet.
  const keyValue = trigger.messageId;
  if (!keyValue) return null;

  const destructiveStep = skill.steps.find((s) => s.n === destructiveStepN);
  if (!destructiveStep) return null; // defensive; passesGateV2 already guarantees this exists

  let tools: Record<string, ReelierTool>;
  try {
    tools = await opts.buildTools(input);
  } catch {
    // Nothing executed yet — a normal precondition skip, full fallback safe.
    return null;
  }

  const events = { skippedClaimed: false };
  const wrappedTools = wrapToolWithSendClaim(
    tools,
    destructiveStep.actionTool,
    { orgId: input.orgId, skillId: skillRow.id, stepN: destructiveStepN, idempotencyKey: keyValue },
    events,
    opts.claimSendStepFn,
    opts.markSendClaimOutcomeFn,
  );

  let record: ReelierRunRecord;
  try {
    // maxLevel STAYS 0 — same hard invariant as v1 (module header). v2
    // never raises it: escalation must never touch the destructive step's
    // args (spec §4), and at maxLevel 0 reelier never constructs an LLM
    // client at all, so that invariant holds structurally, not by
    // convention.
    //
    // allowDestructive IS true here — unlike v1's hardcoded false. Reelier's
    // OWN runner refuses ANY step whose raw compiled effect is
    // 'destructive' unless this is set (independent of SF's allowlist);
    // v2's whole purpose is letting the ONE gate-validated destructive step
    // execute for real. This is safe ONLY because passesGateV2 (called by
    // the caller before reaching here) already verified there is EXACTLY
    // one such step AND that no other step's raw effect is 'destructive'
    // either — see gate-v2.ts's "EXECUTION-LAYER guard" comment. Never used
    // outside this v2 branch; v1's own runSkillFn call below is unchanged.
    record = await opts.runSkillFn(skill, {
      tools: wrappedTools,
      allowDestructive: true,
      maxLevel: 0,
      dryRun: true,
      vars,
    });
  } catch (err) {
    // A raw runSkill throw (not a clean per-step divergence) is ambiguous
    // about WHERE it happened — v2 treats any ambiguity here as
    // conservatively as the claim-error path: never risk a fallback that
    // could double-send. Unlike v1 (which always falls back on a throw),
    // this is failed-post-send, no exceptions.
    return {
      kind: "failed-post-send",
      skillId: skillRow.id,
      record: emptyFailedRecord(skill.name, "runSkill threw (v2)"),
      failures: [err instanceof Error ? err.message : String(err)],
      destructiveStepN,
    };
  }

  const toolCallsFor = (rec: ReelierRunRecord) =>
    rec.steps.map((stepRecord, idx) => ({
      tool: skill.steps[idx]?.actionTool ?? stepRecord.title,
      ok: true,
      note:
        stepRecord.n === destructiveStepN && events.skippedClaimed
          ? `replay-l0-v2: ${stepRecord.title} (skipped-claimed — already sent by a prior attempt)`
          : `replay-l0-v2: ${stepRecord.title}`,
    }));

  if (record.passed) {
    return {
      kind: "passed",
      skillId: skillRow.id,
      record,
      toolCalls: toolCallsFor(record),
      replyText: undefined,
    };
  }

  // Diverged — the asymmetric policy (spec §3): find where.
  const failedStep = record.steps.find((s) => s.outcome === "failed");
  const failedStepN = failedStep?.n ?? Number.MAX_SAFE_INTEGER;

  if (failedStepN < destructiveStepN) {
    // Strictly BEFORE the destructive step — nothing side-effecting ran.
    // Same fallback semantics as v1's diverged kind.
    return {
      kind: "diverged",
      skillId: skillRow.id,
      record,
      failures: record.steps.flatMap((s) => s.failures),
    };
  }

  // AT or AFTER the destructive step — no agent fallback, ever.
  return {
    kind: "failed-post-send",
    skillId: skillRow.id,
    record,
    failures: record.steps.flatMap((s) => s.failures),
    destructiveStepN,
  };
}

/**
 * Try to satisfy this deployment's turn via a deterministic L0 skill replay.
 * FAIL-OPEN BY CONTRACT: never throws — any unexpected error anywhere in
 * this path degrades to `{kind:"skipped", reason}` so the caller always
 * falls back to the normal agentic turn. The ONLY way this returns
 * `kind:"passed"` is a clean, zero-LLM, all-assertions-held replay.
 */
export async function attemptL0Replay(
  input: AttemptL0ReplayInput,
  deps?: AttemptL0ReplayDeps,
): Promise<AttemptL0ReplayResult> {
  try {
    const loadEnabledSkill = deps?.loadEnabledSkill ?? defaultLoadEnabledSkill;
    const buildTools = deps?.buildTools ?? defaultBuildTools;
    const parseSkillFn = deps?.parseSkill ?? defaultParseSkill;
    const runSkillFn = deps?.runSkill ?? defaultRunSkillImpl;

    const skillRow = await loadEnabledSkill(input.orgId, input.deploymentId);
    if (!skillRow) return { kind: "skipped", reason: "no enabled skill for this deployment" };

    const trigger: AttemptL0ReplayTrigger = input.trigger ?? {
      messageId: null,
      sender: "",
      subject: "",
    };

    // Trigger filter gate (gap 2) — evaluated BEFORE parseSkill/buildTools,
    // so a mismatch never constructs a single reelier tool. A null filter
    // always matches (attempt every event); a malformed filter is treated
    // as not-matched (fail-safe — see trigger-filter.ts).
    const filterResult = evaluateTriggerFilter(skillRow.triggerFilter, {
      sender: trigger.sender,
      subject: trigger.subject,
    });
    if (!filterResult.matched) {
      return {
        kind: "skipped",
        reason: `trigger_filter not matched: ${filterResult.reason}`,
      };
    }

    let skill: ReelierSkill;
    try {
      skill = await parseSkillFn(skillRow.skillMd);
    } catch (err) {
      return {
        kind: "skipped",
        reason: `skill parse failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    // Trigger vars (gap 1) — the ONLY vars a skill's {{...}} templates get
    // filled from. message_id mirrors the same value already used
    // upstream as the dedupe/claim trigger_key; "" (never undefined) when
    // a field is absent so reelier's fillTemplate always finds the key
    // (an EMPTY resolved value, not a missing one) — an unresolved
    // {{var}} outside this fixed set still throws inside fillTemplate,
    // which the runner turns into a step failure → diverge (unchanged).
    // Moved above the v1 gate (was previously constructed just before
    // runSkillFn) so BOTH the v2 branch below and v1's own runSkillFn call
    // can share it — pure, no side effects, so this reordering changes
    // nothing about v1's own behavior.
    const vars: Record<string, string> = {
      message_id: trigger.messageId ?? "",
      sender: trigger.sender,
      subject: trigger.subject,
    };

    // Replay gate v2 (spec) — tried FIRST, only when the flag is on AND the
    // skill carries a validated idempotency config. Any other case (flag
    // off, no config, a malformed config, or a config that doesn't satisfy
    // passesGateV2) falls straight through to the UNCHANGED v1 path below —
    // byte-identical v1 behavior, per the spec's own test matrix.
    const idempotencyValidated = validateIdempotencyConfig(skillRow.idempotency);
    const v2FlagOn = isReplayGateV2On({ SF_REPLAY_GATE_V2: process.env.SF_REPLAY_GATE_V2 });
    const idempotencyConfig = idempotencyValidated.ok ? idempotencyValidated.config : null;
    if (v2FlagOn && idempotencyConfig) {
      const gateV2 = passesGateV2(skill, idempotencyConfig);
      if (gateV2.ok) {
        const v2Result = await attemptV2Replay({
          input,
          skill,
          skillRow,
          trigger,
          vars,
          destructiveStepN: gateV2.destructiveStepN,
          buildTools,
          runSkillFn,
          claimSendStepFn: deps?.claimSendStep ?? defaultClaimSendStep,
          markSendClaimOutcomeFn: deps?.markSendClaimOutcome ?? defaultMarkSendClaimOutcome,
        });
        if (v2Result) return v2Result;
        // v2Result === null means "fell through" (e.g. no message_id at
        // runtime to key the claim on) — treated as a precondition skip,
        // exactly like v1's own precondition skips, safe because nothing
        // executed yet.
      }
    }

    if (!passesAllReadGate(skill)) {
      return {
        kind: "skipped",
        reason:
          "all-read gate refused: skill has a non-read step that isn't the last step (or has zero steps) — v1 policy only replays skills whose writes are confined to a single final step",
      };
    }

    let tools: Record<string, ReelierTool>;
    try {
      tools = await buildTools(input);
    } catch (err) {
      return {
        kind: "skipped",
        reason: `tool bridge failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    let record: ReelierRunRecord;
    try {
      record = await runSkillFn(skill, {
        tools,
        allowDestructive: false,
        maxLevel: 0,
        // NEVER write .reelier/runs/<name>.jsonl — this repo persists its
        // OWN run record (agent_workflow_traces, kind:'replay-run'), and a
        // serverless deploy has no durable local filesystem to write to
        // anyway.
        dryRun: true,
        vars,
      });
    } catch (err) {
      // A thrown runSkill (rather than a clean per-step divergence) is
      // treated identically to a divergence — fail-open, fall back.
      return {
        kind: "diverged",
        skillId: skillRow.id,
        record: emptyFailedRecord(skill.name, "runSkill threw"),
        failures: [err instanceof Error ? err.message : String(err)],
      };
    }

    if (!record.passed) {
      return {
        kind: "diverged",
        skillId: skillRow.id,
        record,
        failures: record.steps.flatMap((s) => s.failures),
      };
    }

    // Replay PASSES (every step passed/unchecked, none failed) — skip the
    // agentic turn entirely. toolCalls carries a `replay-l0` tag in `note`
    // so the run receipt (written by the orchestrator from this return
    // value, same seam every other run uses) is honestly labeled without
    // needing a new receipt field.
    const toolCalls = record.steps.map((stepRecord, idx) => ({
      tool: skill.steps[idx]?.actionTool ?? stepRecord.title,
      ok: true,
      note: `replay-l0: ${stepRecord.title}`,
    }));

    return { kind: "passed", skillId: skillRow.id, record, toolCalls, replyText: undefined };
  } catch (err) {
    // Belt-and-suspenders: this function must NEVER throw into its caller.
    return {
      kind: "skipped",
      reason: `unexpected error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Mark a skill's `last_replay_at` after a PASSED replay run. Org-scoped
 *  implicitly via `skillId` (the row was already loaded org-scoped by
 *  loadEnabledSkill above — this is a targeted update by primary key, not a
 *  fresh lookup). FAIL-SOFT — a bookkeeping-only write must never affect the
 *  (already-returned) replay result. */
export async function markReplaySkillReplayed(skillId: string): Promise<void> {
  try {
    const { db } = await import("@/db");
    const { replaySkills } = await import("@/db/schema/replay-skills");
    const { eq } = await import("drizzle-orm");
    await db
      .update(replaySkills)
      .set({ lastReplayAt: new Date(), updatedAt: new Date() })
      .where(eq(replaySkills.id, skillId));
  } catch (err) {
    console.warn(
      "[deployments/replay/replay-before-llm] markReplaySkillReplayed failed (fail-soft):",
      err instanceof Error ? err.message : String(err),
    );
  }
}
