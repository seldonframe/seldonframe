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

/** Social-posting intent — a POST verb aimed at a social network. The operator
 *  wants the agent to publish/schedule content to social (Postiz). Matched FIRST
 *  so a content sentence that merely mentions "reviews" ("post our 5-star
 *  reviews") is classified as a poster, not a review-requester. */
const POST_VERB_RE = /\b(post|publish|share|schedule)\b/i;
const SOCIAL_NETWORK_RE = /\b(instagram|facebook|linkedin|tiktok|twitter|reels?|stories|social media|social)\b/i;

/** A standalone cadence — "weekly", "every Monday", "daily", "recap". On its own
 *  (no social network needed) it implies a scheduled/recap agent. */
const CADENCE_RE = /\b(weekly|every week|every monday|daily|each (week|day)|recap)\b/i;

/** "daily" → run at 9am every day; everything else (weekly / Monday / a bare
 *  scheduled cadence) → 9am every Monday. */
const DAILY_CADENCE_RE = /\b(daily|each day|every day)\b/i;

/** Review-request intent: the operator wants to ASK happy customers for a
 *  rating/review after a job. TIGHTENED — a bare "review" mention no longer
 *  matches (so "post our 5-star reviews" is NOT a review-requester); the sentence
 *  must express an ask-for-review intent. */
const REVIEW_RE =
  /\b(ask|request|get|collect|send|solicit)\b[^.]{0,40}\breviews?\b|\breview request\b|\breviews?\s+(from|after)\b/i;

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
 *   1. social-posting / scheduled → social-poster, fires on a `schedule` cron
 *      (digest channel). Triggered by a post-verb + a social network ("post to
 *      Instagram"), OR a standalone cadence ("weekly", "daily recap"). Matched
 *      FIRST so a content sentence that merely mentions "reviews" ("post our
 *      5-star reviews") classifies as a poster — NOT a review-requester.
 *   2. ask-for-review (and not clearly inbound) → review-requester, fires on
 *      booking.completed, channel sms|email. TIGHTENED: a bare "review" mention
 *      no longer matches; the sentence must ASK for a review.
 *   3. /lead|inquir|missed call|new customer|contact form/ → speed-to-lead,
 *      fires on lead.created, channel sms|email.
 *   4. /answer|reception|phone|call/ → receptionist, inbound voice.
 *   5. default → receptionist, inbound chat.
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
  // A social-poster gets a short Title-Case name derived from the sentence; the
  // other skills keep the starter's name (so `name` stays undefined here).
  let name: string | undefined;

  const isSocialPost = POST_VERB_RE.test(text) && SOCIAL_NETWORK_RE.test(text);
  const isCadence = CADENCE_RE.test(text);

  if (isSocialPost || isCadence) {
    skill = "social-poster";
    trigger = { kind: "schedule", cron: deriveCron(text), channel: "digest" };
    name = deriveSocialName(text);
  } else if (REVIEW_RE.test(text) && !CLEARLY_INBOUND_RE.test(text)) {
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
  if (name) intent.name = name;
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

/** Derive a cron string for a social-poster/scheduled agent from the sentence.
 *  "daily" → `0 9 * * *` (9am every day); weekly / Monday / any other recognized
 *  cadence (and the default) → `0 9 * * 1` (9am every Monday). PURE. */
function deriveCron(text: string): string {
  return DAILY_CADENCE_RE.test(text) ? "0 9 * * *" : "0 9 * * 1";
}

/** Filler words stripped when naming a social-poster from its sentence. */
const NAME_FILLER = new Set([
  "a","an","the","of","our","my","your","their","to","for","and","or","on","in",
  "at","with","into","from","each","every","please","post","posts","posting",
  "publish","share","schedule","auto","automatically","that","this","we","i",
  "highlight","highlights",
]);

/** Derive a short Title-Case label (≤5 words) for a social-poster from the
 *  operator's sentence — strip filler, keep the salient nouns, cap length. Falls
 *  back to "Social Post" when nothing salient survives. PURE; never throws.
 *  e.g. "Post a weekly Instagram highlight of our 5-star reviews" →
 *  "Weekly Instagram 5 Star Reviews". */
function deriveSocialName(text: string): string {
  const words = (typeof text === "string" ? text : "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ") // drop punctuation, keep letters/digits/hyphen
    .split(/[\s-]+/)
    .filter(Boolean)
    .filter((w) => !NAME_FILLER.has(w.toLowerCase()));
  const kept = words.slice(0, 5);
  if (kept.length === 0) return "Social Post";
  return kept
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

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
