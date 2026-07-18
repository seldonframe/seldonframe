// Deterministic replay — Reelier phase 2c, slice 2. replayOrTurn: the pure,
// DI'd decision seam between "try an L0 replay" and "run the normal agentic
// turn" — factored out of composio-event-dispatch-deps.ts's runAgenticTurn
// SOLELY so this decision is unit-testable without touching Postgres /
// Anthropic (that file's own header claims it's "the only place that
// touches" those — this module still delegates every DB/LLM-touching step to
// injected functions, so the claim stays true; this file itself is DB/LLM-
// free). Smallest additive refactor that makes "replay-pass skips the
// agentic turn" and "divergence falls back to it" independently provable.
//
// Contract: `deps.runTurn` (the real agentic turn, incl. its own trace
// recording) is invoked IF AND ONLY IF the replay attempt did not cleanly
// pass — `kind: "skipped"` (no enabled skill / gate refused / bridge
// failed) or `kind: "diverged"` both fall through to it. `kind: "passed"`
// returns immediately WITHOUT ever calling `deps.runTurn` — the agentic
// turn (and therefore any LLM spend) is never constructed for a successful
// replay.
import type { AttemptL0ReplayInput, AttemptL0ReplayResult } from "./replay-before-llm";

export type ReplayOrTurnResult = {
  ok: boolean;
  toolCalls?: Array<{ tool: string; ok: boolean; note?: string }>;
  replyText?: string;
  errorMessage?: string;
};

export type ReplayOrTurnDeps = {
  attemptL0Replay: (input: AttemptL0ReplayInput) => Promise<AttemptL0ReplayResult>;
  /** The normal agentic turn (runStatelessAgentTurn + its own trace
   *  recording), invoked only on a replay skip/diverge. */
  runTurn: () => Promise<ReplayOrTurnResult>;
  /** Persist ONE agent_workflow_traces row (kind:'replay-run') for any
   *  non-skipped replay attempt (pass OR diverge — see the module's D
   *  section). No-op'd by the caller when `replay.kind === "skipped"`
   *  (nothing ran, nothing to persist) — replayOrTurn enforces that by only
   *  calling this for pass/diverge. Must itself be fail-soft (never throw);
   *  a throw here is still caught defensively below. */
  persistReplayRun: (replay: AttemptL0ReplayResult) => Promise<void>;
  /** Bookkeeping-only — called ONLY after a PASSED replay. Fail-soft. */
  markSkillReplayed: (skillId: string) => Promise<void>;
};

export async function replayOrTurn(
  deps: ReplayOrTurnDeps,
  input: AttemptL0ReplayInput,
): Promise<ReplayOrTurnResult> {
  const replay = await deps.attemptL0Replay(input);

  if (replay.kind === "skipped") {
    return deps.runTurn();
  }

  // pass OR diverge — both are a real, recorded replay attempt.
  try {
    await deps.persistReplayRun(replay);
  } catch (err) {
    console.warn(
      "[deployments/replay/replay-or-turn] persistReplayRun failed (fail-soft):",
      err instanceof Error ? err.message : String(err),
    );
  }

  if (replay.kind === "passed") {
    try {
      await deps.markSkillReplayed(replay.skillId);
    } catch (err) {
      console.warn(
        "[deployments/replay/replay-or-turn] markSkillReplayed failed (fail-soft):",
        err instanceof Error ? err.message : String(err),
      );
    }
    return { ok: true, toolCalls: replay.toolCalls, replyText: replay.replyText };
  }

  // diverged — fall back to the normal agentic turn. The fallback's own
  // result (ok/toolCalls/replyText/errorMessage) is the user-visible
  // result; the failed replay attempt is invisible to the end user beyond
  // its own persisted 'replay-run' row.
  return deps.runTurn();
}
