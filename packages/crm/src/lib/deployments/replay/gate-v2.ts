// Replay gate v2 — idempotent-send eligibility
// (docs/superpowers/plans/2026-07-18-replay-gate-v2-spec.md §1, §4).
//
// WHY A SEPARATE GATE (not a loosened passesAllReadGate): v1's fail-open
// fallback (a diverged replay falls back to a fresh agentic turn) is only
// safe because v1 guarantees nothing side-effectful ran before the
// fallback — see replay-before-llm.ts's module header. v2 allows exactly
// ONE destructive step to run mid-replay, which means the SAME fallback
// would risk a double-send once that step has executed. passesGateV2 is
// therefore a STRICTER, opt-in check layered on top of v1's tool-effect
// allowlist (tool-effects.ts) — it never replaces passesAllReadGate; a
// skill that fails this gate (or whose org hasn't set SF_REPLAY_GATE_V2)
// still gets evaluated against v1's gate exactly as before (see
// replay-before-llm.ts's attemptL0Replay: v2 is tried FIRST only when a
// skill carries idempotency config, and always falls through to the
// unchanged v1 path otherwise).
//
// STORAGE CHOICE (documented for the orchestrator): an
// `- idempotency-key: {{message_id}}` step bullet, as sketched in the
// spec, CANNOT be added to skill_md — reelier's parseSkill (external npm
// dep, @seldonframe/reelier, confirmed against the installed 0.2.0 dist:
// node_modules/@seldonframe/reelier/dist/skill.js) throws
// SkillParseError("Unrecognized step field...") on any `- key:` bullet
// outside its fixed intent/action/assert/bind/effect grammar. Forking
// reelier was rejected (external dependency, would fork every consumer's
// parser). So the config lives OUT OF BAND on `replay_skills.idempotency`
// (migration 0077, jsonb {stepN, keyVar}) — exactly the precedent
// trigger_filter (migration 0076) already set for "a linear skill needs
// scoping metadata reelier's grammar has no room for."
import type { ReelierSkill } from "@seldonframe/reelier/skill";
import type { ReplaySkillIdempotency } from "@/db/schema/replay-skills";
import { trustedEffect } from "./replay-before-llm";

/** The ONLY var a v2 idempotency key may be sourced from. message_id is
 *  server-extracted (the Gmail id) and already the dispatch-level dedup
 *  key — sender/subject are attacker-influenceable free text and are
 *  forbidden as key material (spec §1, §4). */
const ALLOWED_KEY_VARS = new Set<string>(["message_id"]);

export type ValidateIdempotencyConfigResult =
  | { ok: true; config: ReplaySkillIdempotency | null }
  | { ok: false; error: string };

/**
 * Strictly validate a candidate `replay_skills.idempotency` value — either
 * freshly-constructed CLI input, or the raw jsonb column value straight off
 * a row (which may predate this validator, or have been hand-edited).
 * `null`/`undefined` is valid (means "not v2-eligible"). Mirrors
 * trigger-filter.ts's validateTriggerFilter shape/contract exactly.
 */
export function validateIdempotencyConfig(value: unknown): ValidateIdempotencyConfigResult {
  if (value === null || value === undefined) return { ok: true, config: null };
  if (typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "idempotency must be a JSON object or null" };
  }

  const obj = value as Record<string, unknown>;
  const knownKeys = new Set(["stepN", "keyVar"]);
  const unknownKeys = Object.keys(obj).filter((k) => !knownKeys.has(k));
  if (unknownKeys.length > 0) {
    return { ok: false, error: `unknown idempotency key(s): ${unknownKeys.join(", ")}` };
  }

  const { stepN, keyVar } = obj;
  if (typeof stepN !== "number" || !Number.isInteger(stepN) || stepN < 1) {
    return { ok: false, error: "idempotency.stepN must be a positive integer" };
  }
  if (typeof keyVar !== "string" || keyVar.trim().length === 0) {
    return { ok: false, error: "idempotency.keyVar must be a non-empty string" };
  }
  if (!ALLOWED_KEY_VARS.has(keyVar)) {
    return {
      ok: false,
      error: `idempotency.keyVar '${keyVar}' is not allowed — only ${[...ALLOWED_KEY_VARS].join(", ")} may be used as key material (sender/subject are attacker-influenceable and forbidden)`,
    };
  }

  return { ok: true, config: { stepN, keyVar } };
}

export type GateV2Result =
  | { ok: true; destructiveStepN: number }
  | { ok: false; reason: string };

/**
 * v2 replay gate: every step is `read` or `idempotent-write` EXCEPT exactly
 * ONE `destructive` step, and that step's number must match the skill's
 * declared idempotency config (config.stepN) — i.e. the operator's
 * idempotency-key declaration must point at the ACTUAL (allowlist-trusted)
 * destructive step, never a step the operator merely believes is
 * destructive. Unlike v1's passesAllReadGate, the destructive step need NOT
 * be last — v2 explicitly allows post-send steps (spec §1, §3's "post-send
 * writes are idempotent by class").
 *
 * "Non-read" here is the SAME allowlist-trusted effect
 * (replay-before-llm.ts's trustedEffect) v1 uses — never skill_md's raw
 * `effect:` line directly, for the identical search_and_purge reason
 * tool-effects.ts documents.
 */
export function passesGateV2(skill: ReelierSkill, config: ReplaySkillIdempotency): GateV2Result {
  if (skill.steps.length === 0) return { ok: false, reason: "skill has no steps" };

  if (!ALLOWED_KEY_VARS.has(config.keyVar)) {
    return {
      ok: false,
      reason: `idempotency keyVar '${config.keyVar}' is not allowed — only message_id may be used as key material`,
    };
  }

  const destructiveSteps = skill.steps.filter((step) => trustedEffect(step) === "destructive");
  if (destructiveSteps.length !== 1) {
    return {
      ok: false,
      reason: `v2 requires EXACTLY one destructive step, found ${destructiveSteps.length}`,
    };
  }

  const destructiveStep = destructiveSteps[0];
  if (destructiveStep.n !== config.stepN) {
    return {
      ok: false,
      reason: `declared idempotency stepN ${config.stepN} does not match the skill's actual destructive step (step ${destructiveStep.n})`,
    };
  }

  const restOk = skill.steps.every(
    (step) => step.n === destructiveStep.n || trustedEffect(step) !== "destructive",
  );
  if (!restOk) {
    // Unreachable given the count check above, kept as a belt-and-suspenders
    // guard against a future refactor silently loosening the count check.
    return { ok: false, reason: "non-destructive steps must all be read or idempotent-write" };
  }

  // EXECUTION-LAYER guard, not just the gate: v2's runSkill call must pass
  // `allowDestructive: true` (reelier's OWN runner refuses ANY step whose
  // RAW compiled `effect: destructive` line is set, independent of SF's
  // allowlist-trusted effect — see runner.ts's executeStep, `step.effect
  // === "destructive" && !ctx.allowDestructive`). Flipping that flag for
  // the whole run would let a DIFFERENT step — one SF's own allowlist
  // trusts as read/idempotent-write but whose raw compiled `effect:` line
  // still says "destructive" (a compiler misclassification or a
  // hand-edited skill_md) — execute for real WITHOUT ever going through
  // the claim wrapper, since only the ONE declared destructive step's tool
  // is wrapped. Refuse v2 eligibility outright if any OTHER step's raw
  // declared effect is "destructive", so allowDestructive:true can never
  // free-pass an unclaimed step.
  const rawEffectsOk = skill.steps.every(
    (step) => step.n === destructiveStep.n || step.effect !== "destructive",
  );
  if (!rawEffectsOk) {
    return {
      ok: false,
      reason:
        "a step other than the declared destructive step carries a raw compiled effect:'destructive' line — v2 refuses (would bypass the claim wrapper once allowDestructive is set for the run)",
    };
  }

  return { ok: true, destructiveStepN: destructiveStep.n };
}
