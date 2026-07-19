// Agent Loop — L4 Generate-by-Default — Task T3: the real LLM classifier.
//
// This is the ONE place a real network call enters generate-by-default. It is
// the optional `classify` dependency that parseAgentIntent (parse-intent.ts)
// merges OVER its pure heuristic — so the LLM only refines the classification,
// and a failure here degrades to the heuristic with zero impact on whether an
// agent gets created.
//
// THE ELEGANT SPLIT (see the plan): the LLM only CLASSIFIES the sentence into a
// tiny structured shape (skill + trigger + an optional name/description). It
// NEVER authors a rubric, guardrails, or the skill prose — SF's deterministic
// assembler (agent-bundle.ts) supplies all of that. So this call is small,
// cheap, strict, and fully fail-soft: anything that isn't clean JSON of the
// expected shape collapses to `{}`, and the heuristic wins.
//
// NOT "use server": it's a plain async helper the "use server" action injects.
// (A "use server" file may export only async functions; this also exports the
// MODEL constant, so it must stay a plain module — same split the rest of the
// generate/ + agent-templates/ code uses.) It performs I/O (the Anthropic call)
// but is DI-friendly: callers pass it as `classify` and the unit tests never
// touch it — they inject their own in-memory fake instead.

import type { AgentIntent } from "@/lib/agents/generate/agent-bundle";
import { getAnthropicClient } from "@/lib/ai/client";

// ─── model + budget ──────────────────────────────────────────────────────────

/**
 * The classifier is a tiny, strict JSON call — pick the cheapest capable model.
 * Overridable via ANTHROPIC_CLASSIFY_MODEL; defaults to a Haiku-tier model so a
 * classification never costs what a full draft does. (The model is read at call
 * time, not module load, so a test/env that sets it later still wins.)
 */
const DEFAULT_CLASSIFY_MODEL = "claude-haiku-4-5";

/** A classification needs only a few tokens of JSON back. Keep it tight so a
 *  runaway model can't turn a classify into an expensive generation. */
const CLASSIFY_MAX_TOKENS = 256;

// ─── system prompt (strict, JSON-only) ───────────────────────────────────────

const CLASSIFY_SYSTEM = [
  "You classify a business owner's plain-English request for an AI agent into a small JSON object.",
  'Return ONLY a JSON object of the shape: {"skill": string, "trigger": {"kind": string, "event": string, "channel": string}, "name"?: string, "description"?: string}.',
  'skill MUST be one of: "review-requester" (ask a customer for a review after a job), "speed-to-lead" (instantly reply to a new lead/inquiry), "receptionist" (answer inbound calls/chats).',
  'trigger.kind is "event" for review-requester (event "booking.completed") and speed-to-lead (event "lead.created"), and "inbound" for receptionist (omit event, channel "voice" or "chat").',
  'trigger.channel is "sms" or "email" for event skills (default "email" — it delivers without the business connecting a phone number; only pick "sms" when the request explicitly asks for texting); for receptionist it is "voice" or "chat".',
  "name/description are optional short operator-facing labels — include them only if the request clearly implies a specific name.",
  "Do not include any prose, explanation, or markdown fences. Output JSON only.",
].join("\n");

// ─── the classifier ──────────────────────────────────────────────────────────

/**
 * Classify an operator's sentence into a partial AgentIntent via a small, strict
 * Anthropic call. Returns ONLY the fields it's confident about (the caller's
 * heuristic fills the rest). NEVER throws — every failure mode (no key, network
 * error, non-JSON, wrong shape) collapses to `{}` so parseAgentIntent's
 * heuristic wins and agent creation is never blocked on the LLM.
 *
 * It deliberately does NOT validate the trigger here — resolveAgentTrigger
 * (inside mergeIntent) clamps any malformed trigger to a safe one, so this just
 * passes through the parsed shape and lets the merge layer be the guard.
 *
 * `priorLessons` (L5.3 self-improving loop) is an OPTIONAL rendered block of
 * past generator corrections (from `lessonsToPromptHint`). When non-empty it's
 * appended to the system prompt so the classifier avoids repeating a known
 * mistake; "" / undefined leaves the prompt byte-for-byte as before.
 */
export async function llmClassify(
  sentence: string,
  priorLessons?: string,
): Promise<Partial<AgentIntent>> {
  const text = typeof sentence === "string" ? sentence.trim() : "";
  if (!text) return {};

  const client = getAnthropicClient();
  if (!client) return {};

  const model = process.env.ANTHROPIC_CLASSIFY_MODEL?.trim() || DEFAULT_CLASSIFY_MODEL;

  // Fold past corrections into the system prompt (only when there are any).
  const lessons = typeof priorLessons === "string" ? priorLessons.trim() : "";
  const system = lessons ? `${CLASSIFY_SYSTEM}\n\n${lessons}` : CLASSIFY_SYSTEM;

  try {
    const resp = await client.messages.create({
      model,
      max_tokens: CLASSIFY_MAX_TOKENS,
      system,
      messages: [{ role: "user", content: text }],
    });

    const raw = resp.content
      .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    return parseClassification(raw);
  } catch {
    // Fail-soft: any LLM/network error → {} so the heuristic wins.
    return {};
  }
}

// ─── defensive parse ─────────────────────────────────────────────────────────

/** Strip a leading/trailing ```json … ``` (or ``` … ```) fence if the model
 *  wrapped its JSON despite the instruction not to. */
function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Parse the model's text into a Partial<AgentIntent>, keeping ONLY the fields
 * that are well-typed. A parse error or a non-object → `{}`. We carry through
 * `skill` (a non-empty string), `trigger` (any object — the merge layer clamps
 * it via resolveAgentTrigger), and optional `name`/`description` strings.
 * Anything else is dropped. Never throws.
 */
export function parseClassification(raw: string): Partial<AgentIntent> {
  if (typeof raw !== "string") return {};
  const stripped = stripFences(raw);
  if (!stripped) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object") return {};

  const obj = parsed as Record<string, unknown>;
  const out: Partial<AgentIntent> = {};

  if (typeof obj.skill === "string" && obj.skill.trim()) {
    out.skill = obj.skill.trim();
  }

  // Pass the trigger through as-is when it's an object — DON'T validate it here;
  // mergeIntent runs it through resolveAgentTrigger, which is the single clamp
  // point. A non-object trigger is simply dropped (the heuristic's wins).
  if (obj.trigger && typeof obj.trigger === "object") {
    out.trigger = obj.trigger as AgentIntent["trigger"];
  }

  if (typeof obj.name === "string" && obj.name.trim()) {
    out.name = obj.name.trim();
  }
  if (typeof obj.description === "string" && obj.description.trim()) {
    out.description = obj.description.trim();
  }

  return out;
}
