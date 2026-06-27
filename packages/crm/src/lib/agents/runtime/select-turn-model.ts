// ICP-3 — adaptive per-turn model selection for the LIVE conversation runtime.
//
// WHY this exists: the live agent runtime (runtime.ts `executeTurn`, and the
// eval/test path stateless-turn.ts `runStatelessAgentTurn`) makes ONE Anthropic
// call per turn at a single fixed model (the cheaper default). Most turns are
// easy — "what are your hours?", "where are you located?" — and the cheap model
// nails them. A minority are HARD — a customer trying to book/reschedule/cancel,
// asking for a quote, asking to talk to a human, or a turn where a prior tool
// call just errored and the model has to recover. Those are the turns where a
// wrong answer costs the operator a booking or a customer. This is the
// execution-side mirror of the author/build path that spends a premium model on
// the hard generation work and stays cheap on the easy edits.
//
// `selectTurnModel` is a PURE, DETERMINISTIC, NEVER-THROWS function. It looks at
// the in-scope signals for a single turn and returns the PREMIUM model id when
// the turn shows HARD signals, else the caller's current (cheaper) `defaultModel`.
// It is money-aware: premium is spent ONLY on hard turns. Any oddity in the
// inputs — missing fields, weird types, a thrown regex — degrades to
// `defaultModel`. A turn must NEVER break or silently get more expensive because
// of model selection.
//
// The runtime wraps the call in its own try/catch too (belt-and-suspenders), and
// honors the env kill-switch SF_ADAPTIVE_RUNTIME_MODEL === "off" to force the
// default everywhere. This module reads NO env and touches NO I/O so it stays
// trivially testable; the premium-model env default is resolved by the caller and
// passed in as `premiumModel`.

/** The default premium tier when the caller doesn't pass one. Sonnet 4.6 is a
 *  strict, meaningful step up from the cheaper default for the reasoning the hard
 *  turns need (booking math, recovery after a tool error, quoting), without
 *  jumping to Opus cost on what is still a high-volume live path. Callers may
 *  override via `premiumModel` (the runtime threads
 *  ANTHROPIC_RUNTIME_PREMIUM_MODEL through here). */
export const DEFAULT_PREMIUM_MODEL = "claude-sonnet-4-6";

/** The signals a single turn exposes to the selector. Everything is optional so a
 *  caller can pass only what it has in scope — a missing field is simply not a
 *  hard signal (it never makes the turn premium, and never throws). */
export type TurnModelSignals = {
  /** The latest inbound user message text. Scanned for hard-intent keywords and
   *  for length/complexity. */
  userMessage?: string;
  /** Names of the tools the agent is allowed to use this turn (the blueprint's
   *  resolved allowlist). If a WRITE/booking/escalate tool is available, the turn
   *  is more likely to need a correct, careful action → premium. */
  toolNamesAvailable?: string[];
  /** True when a tool call in THIS turn (or the immediately prior turn being
   *  recovered) returned an error. Recovering from a tool error is a hard turn. */
  priorToolError?: boolean;
  /** Zero-based index of this turn in the conversation. Reserved for future
   *  heuristics (e.g. escalate deep multi-turn negotiations); currently it only
   *  guards against bad input and is otherwise inert. */
  turnIndex?: number;
  /** The model the caller would use absent any adaptive selection (the current
   *  cheaper default). ALWAYS returned on any non-hard turn or any oddity. */
  defaultModel: string;
  /** The premium model to use on hard turns. Defaults to DEFAULT_PREMIUM_MODEL. */
  premiumModel?: string;
};

// Hard-intent keyword set. These are the customer intents where a wrong/cheap
// answer is most expensive for the operator: scheduling actions, money, and
// human-handoff/frustration. Matched case-insensitively as word-ish substrings.
// Kept deliberately small and high-precision — the goal is to catch the genuinely
// consequential turns, not to escalate everything.
const HARD_INTENT_KEYWORDS: readonly string[] = [
  // booking / scheduling lifecycle
  "book",
  "booking",
  "reschedule",
  "re-schedule",
  "cancel",
  "cancellation",
  "appointment",
  "schedule",
  "reservation",
  "availability",
  // quoting / money
  "quote",
  "estimate",
  "how much",
  "price",
  "pricing",
  "cost",
  "invoice",
  "refund",
  "deposit",
  // escalation / human handoff / frustration
  "talk to a human",
  "speak to a human",
  "speak to someone",
  "talk to someone",
  "real person",
  "manager",
  "supervisor",
  "complaint",
  "urgent",
  "emergency",
  "asap",
];

// Tool-name fragments that indicate a WRITE / booking / escalation action is
// available this turn. Substring match (case-insensitive) so it catches both the
// native tools (book_appointment, escalate_to_human, take_message,
// reschedule_appointment, cancel_appointment) and namespaced connector tools
// (e.g. "postiz__schedulePost") without enumerating every name.
const WRITE_TOOL_FRAGMENTS: readonly string[] = [
  "book",
  "reschedule",
  "cancel",
  "escalate",
  "take_message",
  "send_",
  "create_",
  "update_",
  "schedule",
  "pay",
  "refund",
  "invoice",
];

// A "long/complex" message is itself a weak hard signal — a customer who writes a
// paragraph usually has a multi-part request. Threshold in characters; chosen to
// fire on genuinely long messages, not normal one-liners.
const LONG_MESSAGE_CHARS = 320;

function lower(s: unknown): string {
  return typeof s === "string" ? s.toLowerCase() : "";
}

/** True if the user message contains any hard-intent keyword. Never throws. */
function hasHardIntent(userMessage: unknown): boolean {
  const text = lower(userMessage);
  if (!text) return false;
  for (const kw of HARD_INTENT_KEYWORDS) {
    if (text.includes(kw)) return true;
  }
  return false;
}

/** True if a write/booking/escalate tool is in the available set. Never throws. */
function hasWriteToolAvailable(toolNames: unknown): boolean {
  if (!Array.isArray(toolNames)) return false;
  for (const name of toolNames) {
    const n = lower(name);
    if (!n) continue;
    for (const frag of WRITE_TOOL_FRAGMENTS) {
      if (n.includes(frag)) return true;
    }
  }
  return false;
}

/** True if the message is long enough to count as complex. Never throws. */
function isLongMessage(userMessage: unknown): boolean {
  return typeof userMessage === "string" && userMessage.length >= LONG_MESSAGE_CHARS;
}

/**
 * Decide which model to use for ONE turn.
 *
 * Returns `premiumModel` (Sonnet 4.6 by default) when the turn shows ANY hard
 * signal:
 *   - a booking/reschedule/cancel/quote/escalation intent in the user message,
 *   - a `priorToolError` (the agent is recovering from a failed tool call),
 *   - a write/booking/escalate tool is available this turn,
 *   - a long/complex user message.
 * Otherwise returns the caller's `defaultModel` (the current cheaper model).
 *
 * Money-aware: premium is spent ONLY on hard turns. Pure, deterministic, and
 * never throws — ANY oddity (missing/garbage `defaultModel`, a thrown predicate)
 * resolves to the safest cheap fallback. If `defaultModel` is not a usable
 * non-empty string the function returns it verbatim (the caller is responsible
 * for passing a real model id; we never substitute a premium model in that case,
 * which would be the opposite of money-safe).
 */
export function selectTurnModel(signals: TurnModelSignals): string {
  // Resolve the default first — it is the universal fallback. If it isn't a
  // usable string, hand it straight back (don't risk upgrading a broken caller to
  // a premium model). This also makes the "junk input → default" contract hold.
  const defaultModel =
    signals && typeof signals.defaultModel === "string" ? signals.defaultModel : "";
  if (!defaultModel) {
    // Nothing safe to return except whatever was passed (often "" / undefined).
    // Returning it verbatim preserves the caller's intent and never escalates.
    return (signals?.defaultModel as string) ?? defaultModel;
  }

  try {
    const premiumModel =
      typeof signals.premiumModel === "string" && signals.premiumModel.trim() !== ""
        ? signals.premiumModel
        : DEFAULT_PREMIUM_MODEL;

    const hard =
      signals.priorToolError === true ||
      hasHardIntent(signals.userMessage) ||
      hasWriteToolAvailable(signals.toolNamesAvailable) ||
      isLongMessage(signals.userMessage);

    return hard ? premiumModel : defaultModel;
  } catch {
    // Any unexpected failure → the cheap, safe default. A turn must never break
    // (or silently get pricier) because of model selection.
    return defaultModel;
  }
}
