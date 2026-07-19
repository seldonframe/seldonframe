// Ambient type declarations for @seldonframe/reelier@0.2.0 — the published
// npm package still ships compiled JS only (dist/*.js), no .d.ts files
// (re-verified against the published tarball: `npm pack
// @seldonframe/reelier@0.2.0` — "files" is ["dist", "README.md", "LICENSE"],
// no SPEC.md and no *.d.ts). These declarations cover ONLY the surface this
// repo actually calls (compile.ts, skill.ts, runner exports) — they are OUR
// contract with the package, hand-derived from reading its dist/*.js source
// (see lib/deployments/replay/compile.ts and lib/deployments/replay/
// replay-before-llm.ts for the call sites), not an official types package.
// A future reelier version may ship real .d.ts files, at which point this
// file should be deleted rather than kept alongside them.
//
// 0.2.0 diff (re-derived from dist/runner.js): RunRecord.totals gained
// `unchecked` and `skipped` (steps whose outcome is "unchecked"/"skipped" —
// previously folded into the totals-vs-steps gap; the split is additive,
// `passed`+`failed` keep their exact 0.1.x meaning) and StepRecord gained
// an optional `escalationAttempted` (1 or 2, present only once an L1/L2
// escalation was tried for that step — see attemptEscalation in
// dist/runner.js). trace.js's record shapes (meta/note/call/result) are
// byte-identical to 0.1.x.

declare module "@seldonframe/reelier/skill" {
  export type ReelierEffect = "read" | "idempotent-write" | "destructive";

  export type ReelierSkillStep = {
    n: number;
    title: string;
    intent: string;
    actionTool: string;
    actionArgs: unknown;
    asserts: string[];
    binds: string[];
    effect: ReelierEffect;
    line: number;
  };

  export type ReelierSkill = {
    name: string;
    description: string;
    steps: ReelierSkillStep[];
    preamble: string;
    trailing: string;
  };

  export class SkillParseError extends Error {}

  export function parseSkill(source: string): ReelierSkill;
}

declare module "@seldonframe/reelier/trace" {
  export type ReelierTraceRecord =
    | { t: "meta"; seq: number; name: string; startedAt: string; wrapped: string[] }
    | { t: "note"; seq: number; ts: string; text: string }
    | { t: "call"; seq: number; i: number; ts: string; tool: string; args: unknown }
    | { t: "result"; seq: number; i: number; ok: boolean; ms: number; body: unknown };

  export function parseTraceLines(source: string): ReelierTraceRecord[];
  export function formatTrace(records: ReelierTraceRecord[]): string[];
}

declare module "@seldonframe/reelier/compile" {
  import type { ReelierEffect } from "@seldonframe/reelier/skill";
  import type { ReelierTraceRecord } from "@seldonframe/reelier/trace";

  export type ReelierOpenQuestion = { stepN?: number; text: string };

  export type ReelierCompiledStep = {
    n: number;
    title: string;
    intent: string;
    tool: string;
    args: unknown;
    asserts: string[];
    binds: string[];
    effect: ReelierEffect;
  };

  export type ReelierCompileResult = {
    name: string;
    steps: ReelierCompiledStep[];
    openQuestions: ReelierOpenQuestion[];
    stats: {
      steps: number;
      asserts: number;
      binds: number;
      effects: Record<ReelierEffect, number>;
    };
  };

  /** Deterministic trace -> CompileResult. Zero LLM calls. */
  export function compile(records: ReelierTraceRecord[]): ReelierCompileResult;
  /** Render a CompileResult as a SKILL.md source string. */
  export function renderSkillMd(result: ReelierCompileResult, traceFileName: string): string;
}

declare module "@seldonframe/reelier" {
  import type { ReelierEffect, ReelierSkill } from "@seldonframe/reelier/skill";

  /** The runner's Tool -> Observation contract (mcp-tool.js's own mapping:
   *  status 200 on success / 500 on isError-or-thrown, headers always {} for
   *  a non-HTTP tool, body the JSON text of the result). */
  export type ReelierObservation = {
    status: number;
    headers: Record<string, string>;
    body: string;
  };

  export type ReelierToolRunCtx = { allowDestructive: boolean };

  /** A registry entry the runner dispatches `step.actionTool` against.
   *  `effect` is carried for documentation only — the runner's executeStep
   *  consults `step.effect` (the SKILL's own declared effect), never
   *  `Tool.effect` (confirmed by reelier's own mcp-tool.js comment). */
  export type ReelierTool = {
    effect: ReelierEffect;
    run(args: unknown, ctx: ReelierToolRunCtx): Promise<ReelierObservation>;
  };

  export type ReelierStepOutcome = "passed" | "failed" | "unchecked" | "skipped";

  export type ReelierStepRecord = {
    n: number;
    title: string;
    level: number;
    outcome: ReelierStepOutcome;
    ms: number;
    failures: string[];
    llm?: { inputTokens: number; outputTokens: number };
    /** 0.2.0 — 1 or 2, present only when this step's "failed" deterministic
     *  outcome triggered an L1/L2 escalation attempt (see attemptEscalation
     *  in dist/runner.js). Absent on any step that never escalated. */
    escalationAttempted?: 1 | 2;
  };

  export type ReelierRunRecord = {
    skill: string;
    startedAt: string;
    finishedAt: string;
    passed: boolean;
    steps: ReelierStepRecord[];
    totals: {
      steps: number;
      passed: number;
      /** 0.2.0 — count of steps whose outcome is "unchecked" (a step with
       *  zero asserts that ran without error — reelier's "honest success"
       *  rule: zero assertions never counts as "passed"). */
      unchecked: number;
      /** 0.2.0 — count of steps whose outcome is "skipped" (steps after the
       *  first divergence in a run, never executed). */
      skipped: number;
      failed: number;
      ms: number;
      llmInputTokens: number;
      llmOutputTokens: number;
    };
  };

  export type ReelierLlmClient = unknown;

  export type ReelierRunSkillOptions = {
    cwd?: string;
    tools?: Record<string, ReelierTool>;
    allowDestructive?: boolean;
    vars?: Record<string, unknown>;
    /** When true, skip the append-only `.reelier/runs/<name>.jsonl` write —
     *  REQUIRED for any serverless/production caller (this repo always
     *  passes true; see replay-before-llm.ts). */
    dryRun?: boolean;
    /** 0 = pure deterministic replay, zero LLM calls, by construction. This
     *  repo's v1 replay-before-LLM seam only ever passes 0. */
    maxLevel?: number;
    llm?: ReelierLlmClient;
    llmModel?: string;
    llmL2Model?: string;
    skillPath?: string;
    onStep?: (
      record: ReelierStepRecord,
      filled: { tool: string; args: unknown },
    ) => void;
  };

  export function runSkill(
    skill: ReelierSkill,
    options?: ReelierRunSkillOptions,
  ): Promise<ReelierRunRecord>;

  export function fillTemplate(value: unknown, bindings: Record<string, unknown>): unknown;
}
