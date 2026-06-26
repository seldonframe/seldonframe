// Agent Loop — L4 Generate-by-Default — Task T2: the sentence → intent classifier.
//
// This is the SEAM between an operator's plain-English sentence and the pure
// deterministic assembler (agent-bundle.ts). Its whole job is to produce a
// COMPLETE, well-formed `AgentIntent` (skill + trigger + a few hints) that the
// assembler can wire into a safe blueprint. It does this two ways:
//
//   • `heuristicIntent` — a PURE keyword classifier that ALWAYS returns a
//     complete intent. No clock, no env, no I/O, never throws. This is the
//     fallback that guarantees agent creation never blocks on an LLM.
//   • `parseAgentIntent` — runs the heuristic first, then (if a `classify`
//     dependency is injected) lets a real LLM override the fields it's confident
//     about, MERGING over the heuristic so the result is still complete. A
//     `classify` that throws or returns garbage degrades to the heuristic alone.
//
// The elegant split (see the plan): the LLM only CLASSIFIES (skill/trigger/a few
// hints) — it never authors a rubric or guardrails. SF's deterministic defaults
// (defaultRubricForSkill / defaultGuardrailsForSkill, wired in the assembler)
// supply the error-proofing, so even a misclassified skill yields a SAFE agent.
//
// PURE / DI: no "use server", no network, no module-level state. Safe from a
// Server Component, action, route handler, the runtime, or a test. The injected
// `classify` is the ONLY way I/O ever enters — and it's always fail-soft.

import type { AgentIntent } from "@/lib/agents/generate/agent-bundle";
import {
  resolveAgentTrigger,
  type AgentTrigger,
  type EventChannel,
} from "@/lib/agents/triggers/agent-trigger";

// Re-export the intent type so callers of the classifier seam (and its tests)
// can import it from here without reaching into the assembler module.
export type { AgentIntent };

// ─── keyword tables (priority order matters) ─────────────────────────────────

/** Review-request intent: the operator wants to ask happy customers for a
 *  rating/review after a job. */
const REVIEW_RE = /review/i;

/** A few inbound phrasings strong enough to OVERRIDE a stray "review" mention
 *  (e.g. "answer the phone and route review requests"). Kept narrow so it never
 *  trips on a plain "ask for a review" — only an explicit answer-the-phone /
 *  reception desk request counts as "clearly inbound". */
const CLEARLY_INBOUND_RE = /\b(answer (the |my )?phone|reception(ist)?|front desk|pick up the phone)\b/i;

/** Speed-to-lead intent: a new lead / inquiry / missed call / contact-form
 *  submission should get an instant follow-up. */
const LEAD_RE = /lead|inquir|missed call|new customer|contact form/i;

/** Receptionist intent: answer inbound calls / chats — the always-on front desk. */
const RECEPTION_RE = /answer|reception|phone|call/i;

/** Channel hint: an explicit "email" mention routes outbound to email; the
 *  default for the event skills is SMS (faster, higher open-rate). */
const EMAIL_RE = /email/i;

/** First http(s) URL in the sentence — used as the review link. */
const URL_RE = /https?:\/\/\S+/i;

// ─── pure heuristic ──────────────────────────────────────────────────────────

/**
 * Classify a sentence into a complete AgentIntent using pure keyword matching
 * (case-insensitive). PRIORITY ORDER (first match wins):
 *
 *   1. /review/ (and not clearly inbound) → review-requester, fires on
 *      booking.completed, channel sms|email.
 *   2. /lead|inquir|missed call|new customer|contact form/ → speed-to-lead,
 *      fires on lead.created, channel sms|email.
 *   3. /answer|reception|phone|call/ → receptionist, inbound voice.
 *   4. default → receptionist, inbound chat.
 *
 * The matched trigger is always run through resolveAgentTrigger so the returned
 * intent's trigger is guaranteed valid. promptHint carries the original sentence
 * (the assembler folds the operator's exact wording into the skill prompt) and
 * businessHints.reviewUrl carries the first URL (trailing punctuation stripped).
 *
 * PURE — never throws.
 */
export function heuristicIntent(sentence: string): AgentIntent {
  const text = typeof sentence === "string" ? sentence : "";

  const channel: EventChannel = EMAIL_RE.test(text) ? "email" : "sms";
  const reviewUrl = extractUrl(text);

  // The skill + the (pre-resolution) trigger, decided by priority order.
  let skill: string;
  let trigger: AgentTrigger;

  if (REVIEW_RE.test(text) && !CLEARLY_INBOUND_RE.test(text)) {
    skill = "review-requester";
    trigger = { kind: "event", event: "booking.completed", channel };
  } else if (LEAD_RE.test(text)) {
    skill = "speed-to-lead";
    trigger = { kind: "event", event: "lead.created", channel };
  } else if (RECEPTION_RE.test(text)) {
    skill = "receptionist";
    trigger = { kind: "inbound", channel: "voice" };
  } else {
    skill = "receptionist";
    trigger = { kind: "inbound", channel: "chat" };
  }

  const intent: AgentIntent = {
    skill,
    // resolveAgentTrigger clamps any odd shape to a valid trigger — here our
    // shapes are already valid, so this is belt-and-suspenders correctness.
    trigger: resolveAgentTrigger(trigger),
    promptHint: text,
  };
  if (reviewUrl) intent.businessHints = { reviewUrl };

  return intent;
}

// ─── classifier seam (heuristic + optional injected LLM) ─────────────────────

/**
 * Produce a complete AgentIntent for a sentence. Always starts from the pure
 * heuristic (which guarantees every required field). If a `classify` dependency
 * is injected, its partial result is MERGED OVER the heuristic — the LLM wins on
 * the fields it returns (skill / trigger / name / description / businessHints),
 * the heuristic fills the rest. A `classify` that throws (or whose result can't
 * be merged into a complete intent) degrades to the heuristic alone.
 *
 * `priorLessons` (L5.3) is an optional rendered hint of past generator
 * corrections, threaded through to the classifier so it can avoid repeating a
 * mistake. It's a plain string — "" means "no lessons", behavior unchanged.
 *
 * Never throws.
 */
export async function parseAgentIntent(
  sentence: string,
  deps?: {
    classify?: (
      sentence: string,
      priorLessons?: string,
    ) => Promise<Partial<AgentIntent>>;
    priorLessons?: string;
  },
): Promise<AgentIntent> {
  const base = heuristicIntent(sentence);
  if (!deps?.classify) return base;
  try {
    const llm = await deps.classify(sentence, deps.priorLessons);
    return mergeIntent(base, llm);
  } catch {
    // Fail-soft: any LLM error → the safe heuristic result. Agent creation must
    // never block on the classifier.
    return base;
  }
}

// ─── merge ───────────────────────────────────────────────────────────────────

/**
 * Merge an LLM's partial classification over a complete heuristic base. The LLM
 * wins per-field, the base fills any gap, and the result is GUARANTEED complete:
 *   • `skill` — LLM's if it's a non-empty string, else the base's;
 *   • `trigger` — if the LLM supplied one, re-run it through resolveAgentTrigger
 *     (so a malformed LLM trigger clamps to a valid one) — else keep the base's;
 *   • `name` / `description` / `promptHint` — LLM's when present, else base's;
 *   • `businessHints` — shallow-merged (LLM's reviewUrl wins, base's survives).
 *
 * Pure; never throws.
 */
export function mergeIntent(
  base: AgentIntent,
  llm: Partial<AgentIntent> | null | undefined,
): AgentIntent {
  if (!llm || typeof llm !== "object") return base;

  const skill =
    typeof llm.skill === "string" && llm.skill.trim() ? llm.skill : base.skill;

  // A supplied trigger is always re-validated; never let the merge drop it.
  const trigger =
    llm.trigger !== undefined && llm.trigger !== null
      ? resolveAgentTrigger(llm.trigger)
      : base.trigger;

  const merged: AgentIntent = {
    skill,
    trigger,
    promptHint: llm.promptHint ?? base.promptHint,
  };

  const name = llm.name ?? base.name;
  if (name !== undefined) merged.name = name;

  const description = llm.description ?? base.description;
  if (description !== undefined) merged.description = description;

  const reviewUrl = llm.businessHints?.reviewUrl ?? base.businessHints?.reviewUrl;
  if (reviewUrl !== undefined) merged.businessHints = { reviewUrl };

  return merged;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Pull the first http(s) URL out of a sentence and strip trailing punctuation
 *  (so "...see https://g.page/r/abc/review." → ".../review", no dot). Returns
 *  undefined when there's no URL. */
function extractUrl(text: string): string | undefined {
  const m = URL_RE.exec(text);
  if (!m) return undefined;
  // Strip a run of trailing sentence punctuation / closing brackets that a URL
  // regex greedily swallows but that isn't part of the link.
  const stripped = m[0].replace(/[.,;:!?)\]}>'"]+$/, "");
  return stripped.length > 0 ? stripped : undefined;
}
