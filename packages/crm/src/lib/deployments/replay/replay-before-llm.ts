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
//   - vars: {} — no input-variable mapping from the event payload in v1; an
//     unresolved `{{var}}` in a skill throws inside reelier's fillTemplate,
//     which the runner already turns into a normal step failure → diverge.
//     Nothing special to implement here for that case.
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
import type {
  ReelierRunRecord,
  ReelierTool,
} from "@seldonframe/reelier";
import type { ReelierSkill, ReelierSkillStep } from "@seldonframe/reelier/skill";
import { effectForTool } from "./tool-effects";

export type AttemptL0ReplayInput = {
  orgId: string;
  deploymentId: string;
  orgSlug: string;
  timezone: string;
  blueprint: AgentBlueprint;
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
export type AttemptL0ReplayResult =
  | AttemptL0ReplaySkippedResult
  | AttemptL0ReplayDivergedResult
  | AttemptL0ReplayPassedResult;

type EnabledSkillRow = { id: string; skillMd: string };

/**
 * A step's TRUSTED effect for gate purposes. Consults tool-effects.ts's
 * explicit allowlist FIRST — SF's own hand-classified truth about the tool's
 * real side effect, keyed by name. Only when the allowlist has never heard
 * of the tool (an unknown/third-party/typo'd name) does the compiled skill's
 * own `effect:` line get a say — and even then it is trusted ONLY when it
 * says 'destructive' (the safe direction); an unknown tool claiming 'read'
 * or 'idempotent-write' in skill_md text is never believed, because that
 * text came from reelier's verb-prefix heuristic over the tool NAME, not
 * from anything SF actually verified (this is the `search_and_purge`
 * attack: a destructive tool whose name happens to parse as a read verb).
 * Net effect: an unknown tool is ALWAYS treated as destructive here — it can
 * only ever occupy the gate's single bounded final-step slot, exactly like a
 * genuinely destructive allowlisted tool.
 */
function trustedEffect(step: ReelierSkillStep): ReelierSkill["steps"][number]["effect"] {
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
};

async function defaultLoadEnabledSkill(
  orgId: string,
  deploymentId: string,
): Promise<EnabledSkillRow | null> {
  const { db } = await import("@/db");
  const { replaySkills } = await import("@/db/schema/replay-skills");
  const { and, eq } = await import("drizzle-orm");
  const [row] = await db
    .select({ id: replaySkills.id, skillMd: replaySkills.skillMd })
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
    totals: { steps: 0, passed: 0, failed: 0, ms: 0, llmInputTokens: 0, llmOutputTokens: 0 },
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

    let skill: ReelierSkill;
    try {
      skill = await parseSkillFn(skillRow.skillMd);
    } catch (err) {
      return {
        kind: "skipped",
        reason: `skill parse failed: ${err instanceof Error ? err.message : String(err)}`,
      };
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
        vars: {},
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
