// Agent Eval Harness — E5: the REAL Haiku-backed simulated CUSTOMER.
//
// run-scenario.ts (E2) owns the pure `SimCustomerReply` SEAM — `runEvalScenario`
// awaits an injected sim, alternates customer ↔ agent turns, and ends the loop
// gracefully when the sim returns `done:true` or throws. This module is the one
// real implementation of that seam: a small, strict Anthropic call where an LLM
// PLAYS the customer described by `scenario.persona`, continues the conversation
// naturally from the transcript so far, and signals `done` once its goal is met
// (or it would realistically give up).
//
// It MIRRORS score-llm.ts / generate-scenarios.ts byte-for-byte in how it runs:
//   • the client comes from an injectable `getClient` (defaults to
//     getAnthropicClient) — tests inject a fake; production gets the platform
//     Anthropic client (or null when no key);
//   • the model id is read at CALL time (process.env.ANTHROPIC_EVAL_MODEL || a
//     Haiku default), so a test/env that sets it later still wins;
//   • the response text blocks are joined, fence-stripped, and JSON-parsed
//     DEFENSIVELY. Crucially, EVERY failure mode (no key, network error, non-JSON,
//     wrong shape) collapses to `{ text: "", done: true }` — a fail-soft that ENDS
//     the eval loop cleanly (an empty final customer line + done) rather than
//     spinning or throwing. The sim NEVER throws; runEvalScenario also guards
//     against a throw (belt + suspenders), but the soft `done:true` is what makes
//     a wedged model terminate the scenario instead of looping to maxTurns.
//
// NOT "use server": a plain module of an async factory the "use server" action
// injects (it also exports the MODEL constant + a factory, so it must stay a plain
// module per scripts/check-use-server.sh — the same split score-llm/judge-llm use).
// It performs I/O (the Anthropic call) but is DI-friendly: the unit tests inject
// their own in-memory client and exercise the prompt + parse with NO network.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";
import type { SimCustomerReply } from "./run-scenario";
import type { EvalScenario, EvalTurn } from "./eval-types";

// ─── model + budget ──────────────────────────────────────────────────────────

/**
 * The customer-sim is a tiny, strict JSON call — pick the cheapest capable model,
 * and share the eval-tier knob with the grader + the scenario generator
 * (ANTHROPIC_EVAL_MODEL) so "the eval LLM" is configured in one place. Defaults to
 * a Haiku-tier model. Read at call time, not module load, so a test/env that sets
 * it later still wins — mirrors score-llm / generate-scenarios.
 */
export const DEFAULT_EVAL_MODEL = "claude-haiku-4-5";

/** One customer line back is all we want. Keep it tight so a runaway model can't
 *  turn a single customer turn into an expensive generation. */
const SIM_MAX_TOKENS = 400;

// ─── system prompt (strict, JSON-only) ───────────────────────────────────────

const SIM_SYSTEM = [
  "You are role-playing a CUSTOMER contacting an automated business agent, to test that agent. You are the CUSTOMER, never the agent.",
  "You are given the scenario (your situation + persona) and the conversation so far. Continue naturally as THIS customer: react to what the agent just said, in your own words, the way a real person would.",
  'Return ONLY a JSON object of the shape: {"text": string, "done": boolean}.',
  "`text` is your single next message to the agent — one short, natural turn (a sentence or two), in the customer's voice. Do NOT narrate, do NOT write the agent's reply, do NOT add stage directions.",
  "Set `done` to true when the conversation is finished from YOUR point of view: your goal is met (you booked / got the answer you needed), OR the agent clearly can't help and you'd give up, OR you have nothing left to add. Otherwise set `done` to false and keep the conversation going.",
  "Stay in character and on-scenario: pursue the goal your persona implies (e.g. push for a firm price if you're the price-sensitive customer), but behave like a real customer, not a QA script.",
  "Do not include any prose, explanation, or markdown fences outside the JSON. Output the JSON object only.",
].join("\n");

// ─── compact views (pure) ────────────────────────────────────────────────────

/** The minimal, stable slice of a scenario the sim needs to stay in character:
 *  its title + persona + opening + what a good outcome looks like (so the sim
 *  knows when its goal is met → `done`). We deliberately do NOT show the sim the
 *  mustDo/mustNotDo gates — those are how the AGENT is judged, not the customer's
 *  script. Pure; never throws. */
function compactScenarioForSim(scenario: EvalScenario): Record<string, unknown> {
  const successCriteria = Array.isArray(scenario?.successCriteria)
    ? scenario.successCriteria.filter((c) => typeof c === "string" && c.length > 0)
    : [];
  return {
    title: typeof scenario?.title === "string" ? scenario.title : "",
    persona: typeof scenario?.persona === "string" ? scenario.persona : "",
    opening: typeof scenario?.opening === "string" ? scenario.opening : "",
    goal: successCriteria,
  };
}

/** Render the transcript so far as a simple "You:/Agent:" script from the
 *  CUSTOMER's point of view (the customer is "You"). Defensive: skips malformed
 *  turns. Pure; never throws. */
function renderTurns(turns: EvalTurn[]): string {
  const list: EvalTurn[] = Array.isArray(turns) ? turns : [];
  const lines: string[] = [];
  for (const t of list) {
    if (!t || typeof t.text !== "string") continue;
    // The customer is "You" (the sim is the customer); the agent is "Agent".
    const who = t.role === "agent" ? "Agent" : "You";
    lines.push(`${who}: ${t.text}`);
  }
  return lines.join("\n");
}

// ─── defensive parse ─────────────────────────────────────────────────────────

/** Strip a leading/trailing ```json … ``` (or ``` … ```) fence if the model
 *  wrapped its JSON despite the instruction not to. Mirrors score-llm. */
function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/** Is `v` a plain object (not null, not an array)? */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Parse the model's text into `{ text, done }`, FAILING SOFT on anything malformed.
 * A parse error, a non-object, or a missing/garbage `text` → `{ text:"", done:true }`
 * (end the loop cleanly). A well-formed reply keeps the string `text` and a boolean
 * `done` (defaulting `done` to false when absent so a satisfied sim must say so).
 * Never throws.
 */
export function parseSimResponse(raw: string): { text: string; done: boolean } {
  // The fail-soft verdict ENDS the loop: an empty final line + done:true.
  const soft = { text: "", done: true };
  if (typeof raw !== "string") return soft;
  const stripped = stripFences(raw);
  if (!stripped) return soft;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return soft;
  }
  if (!isObject(parsed)) return soft;

  const text = typeof parsed.text === "string" ? parsed.text : "";
  // `done` defaults to false: a sim that forgot the flag keeps the conversation
  // going (bounded by maxTurns), rather than ending prematurely. But a sim that
  // returned NO usable text gets the soft end (nothing to say → done).
  const done = parsed.done === true || text.trim() === "";

  return { text, done };
}

// ─── the sim factory ─────────────────────────────────────────────────────────

/**
 * Build a real Haiku-backed {@link SimCustomerReply}. The returned sim is handed
 * the scenario + the conversation so far and produces the customer's NEXT line
 * (and whether it's `done`). It FAILS SOFT on every failure mode (no key, network
 * error, non-JSON, wrong shape → `{ text:"", done:true }`, which ENDS the eval
 * loop cleanly). It NEVER throws; runEvalScenario wraps it with the same guarantee.
 *
 * `getClient` is the DI seam — defaults to getAnthropicClient (the platform
 * Anthropic client, or null when ANTHROPIC_API_KEY is unset, in which case the sim
 * returns the soft end on the first call → the scenario runs the opening + one
 * agent reply, then stops). Tests inject a fake client to exercise the prompt +
 * parse without a network call.
 */
export function makeLlmCustomerSim(
  deps: { getClient?: () => Anthropic | null } = {},
): SimCustomerReply {
  const getClient = deps.getClient ?? getAnthropicClient;

  return async ({ scenario, turns }): Promise<{ text: string; done?: boolean }> => {
    // The fail-soft verdict ENDS the loop cleanly (empty final line + done).
    const soft = { text: "", done: true };

    const client = getClient();
    if (!client) return soft;

    const model = process.env.ANTHROPIC_EVAL_MODEL?.trim() || DEFAULT_EVAL_MODEL;

    try {
      const userContent = [
        `Scenario (you are this customer): ${JSON.stringify(compactScenarioForSim(scenario))}`,
        `Conversation so far:\n${renderTurns(turns)}`,
        "Reply as the customer's next turn (JSON only).",
      ].join("\n\n");

      const resp = await client.messages.create({
        model,
        max_tokens: SIM_MAX_TOKENS,
        system: SIM_SYSTEM,
        messages: [{ role: "user", content: userContent }],
      });

      const out = resp.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      return parseSimResponse(out);
    } catch {
      // Fail SOFT: any LLM/network error → the soft end so the eval loop closes
      // cleanly on whatever turns we already have (runEvalScenario keeps them).
      return soft;
    }
  };
}
