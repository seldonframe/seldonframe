// Primitive-Composition Agent Generator — P1, Task 2: the real LLM author.
//
// authored-agent.ts (T1) is the PURE seam: it awaits an injected `AgentAuthor`,
// then `normalizeAuthoredAgent` is the SOLE validator (non-empty skillMd, a
// kind-aware trigger clamp, channel ∈ sms|email|none, tools filtered to the known
// catalog). This module is the one real implementation of that author: a single,
// strict Anthropic call that DESIGNS one agent from the operator's sentence —
// writing its full playbook (skillMd) and DECLARING its primitives (trigger /
// channel / tools) as structured JSON.
//
// It MIRRORS judge-llm.ts / classify-llm.ts byte-for-byte in how it runs the call:
//   • the client comes from an injectable `getClient` (defaults to
//     getAnthropicClient) — tests inject a fake, production gets the platform
//     Anthropic client (or null when no key);
//   • the model id is read at CALL time (process.env.ANTHROPIC_AUTHOR_MODEL || a
//     premium Opus default — authoring is compile-time + amortized), so a
//     test/env that sets it later still wins;
//   • the response text blocks are joined, fence-stripped, and JSON-parsed
//     DEFENSIVELY — any failure mode (no key, network error, non-JSON) collapses
//     to `{}`. `{}` has no skillMd, so the seam's normalizeAuthoredAgent yields
//     null and the caller falls back to the heuristic path. The author NEVER
//     throws and NEVER blocks a generation.
//
// IMPORTANT — this author does NOT pre-validate. It returns the parsed object
// VERBATIM; authored-agent.ts is the single clamp/validation point (same split
// classify-llm uses: it passes the trigger through raw and lets the merge layer
// guard). That keeps validation in exactly one place.
//
// NOT "use server": this is a plain module of async fns/factories the "use
// server" action injects (it also exports the MODEL constant + a factory, so it
// must stay a plain module per scripts/check-use-server.sh — same split
// classify-llm.ts / judge-llm.ts use). It performs I/O (the Anthropic call) but
// is DI-friendly: callers pass the produced author as `author` and the unit tests
// inject their own in-memory client.

import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient } from "@/lib/ai/client";
import type { AgentAuthor } from "@/lib/agents/generate/authored-agent";
import { TOOL_CATALOG } from "@/lib/agents/generate/tool-catalog";
import { KNOWN_EVENTS } from "@/lib/agents/triggers/agent-trigger";
import { STARTER_TEMPLATES } from "@/lib/agent-templates/starter-pack";

// ─── model + budget ──────────────────────────────────────────────────────────

/**
 * The author is the lynchpin of the generator — it writes the agent's full
 * playbook AND declares its primitives. Generation is COMPILE-TIME and amortized
 * over the agent's whole lifetime, so it runs PREMIUM by default: a frontier
 * model (Opus). Overridable via ANTHROPIC_AUTHOR_MODEL. Read at call time, not
 * module load, so a test/env that sets it later still wins — mirrors classify-llm
 * / judge-llm.
 */
export const DEFAULT_AUTHOR_MODEL = "claude-opus-4-8";

/** Authoring a FULL playbook (sectioned house-style prose) plus the primitives
 *  JSON needs real room — sized for a playbook, not a classify. Still bounded so
 *  a runaway model can't turn an authoring call into an endless essay. */
const AUTHOR_MAX_TOKENS = 4000;

/** How many starter templates to ship as few-shot examples. Two keeps the prompt
 *  budget sane while still showing both an outbound-event and an action-only shape. */
const FEW_SHOT_COUNT = 3;

/** How much of a starter's playbook to include per example. The author should see
 *  the SeldonFrame house style (sectioned, ground-rules) without us pasting three
 *  full 8k playbooks into every request. */
const EXAMPLE_SKILL_CHARS = 600;

// ─── prompt building blocks (pure) ───────────────────────────────────────────

/**
 * The tool menu the author chooses from — one line per catalog entry:
 * `- <id>: <label> — <description>`. Built from TOOL_CATALOG so the author's
 * vocabulary is exactly the bindable set the seam will accept (unknown ids are
 * dropped downstream anyway, but showing the real menu makes good output the
 * default). Pure; never throws.
 */
export function buildToolMenu(): string {
  if (TOOL_CATALOG.length === 0) return "(no tools available)";
  return TOOL_CATALOG.map((t) => `- ${t.id}: ${t.label} — ${t.description}`).join("\n");
}

/**
 * The valid event names for an `event` trigger, as a comma-separated list of
 * slugs (`booking.completed, lead.created, …`). Built from KNOWN_EVENTS so the
 * author can only name a real SeldonEvent. Pure; never throws.
 */
export function buildKnownEvents(): string {
  return KNOWN_EVENTS.map((e) => e.value).join(", ");
}

/** Collapse runs of whitespace and hard-trim a starter playbook to a short slice
 *  for the few-shot block (keeps the prompt budget sane). Pure. */
function trimSkill(skillMd: string | undefined): string {
  const text = (typeof skillMd === "string" ? skillMd : "").trim();
  if (text.length <= EXAMPLE_SKILL_CHARS) return text;
  return `${text.slice(0, EXAMPLE_SKILL_CHARS).trimEnd()} …`;
}

/**
 * Render 2-3 STARTER_TEMPLATES as few-shot examples — each as the agent's
 * `name`, `summary`, and a TRIMMED slice of `blueprint.customSkillMd` — so the
 * author learns the SeldonFrame house style WITHOUT copying an example verbatim
 * (the prompt instructs it to write for THIS agent). Pure; never throws.
 */
export function buildStarterExamples(): string {
  const picks = STARTER_TEMPLATES.slice(0, FEW_SHOT_COUNT);
  if (picks.length === 0) return "(no examples available)";
  return picks
    .map((s, i) => {
      const skill = trimSkill(s.blueprint?.customSkillMd);
      return [
        `Example ${i + 1} — ${s.name}`,
        `summary: ${s.summary}`,
        `skillMd (style reference only — do NOT copy):`,
        skill || "(no playbook)",
      ].join("\n");
    })
    .join("\n\n");
}

/**
 * Assemble the strict system prompt. The shape, rules, tool menu, known events,
 * and few-shot examples are static; only the `priorLessons` block is appended
 * when present (mirrors classify-llm / judge-llm's lessons fold). Pure; never
 * throws — `priorLessons` is trimmed and only added when non-empty.
 */
export function buildAuthorSystemPrompt(priorLessons?: string): string {
  const base = [
    "You design ONE automated agent for a local service business from the operator's sentence.",
    'Return ONLY a JSON object of the shape: {"name": string, "summary": string, "skillMd": string, "trigger": {"kind": string, "cron"?: string, "event"?: string}, "channel": string, "tools": string[], "neededCapabilities": string[]}.',
    "Rules:",
    "- skillMd is the agent's FULL playbook in the SeldonFrame house style — see the examples below for tone and structure — written for THIS agent (do NOT copy an example).",
    "- trigger.kind = 'schedule' for a recurring cadence (include a cron, e.g. weekly Monday 9am = '0 9 * * 1'), 'event' for after-a-business-event (set event to one of: " +
      buildKnownEvents() +
      "), or 'inbound' to answer incoming contact.",
    "- channel = how it MESSAGES a person: 'sms' or 'email' — or 'none' if it only ACTS via tools and sends no customer message (e.g. a social poster that just publishes).",
    "- tools = zero or more ids from this FEATURED menu (use the id exactly; omit any you don't need):",
    buildToolMenu(),
    "- The 'postiz' tool is a MULTI-PLATFORM social publisher: it posts to Instagram, Facebook, LinkedIn, X/Twitter, TikTok, and more — pick it for ANY social-posting agent, not just Instagram.",
    "- neededCapabilities = plain-English phrases for any capability the agent needs that is NOT in the menu above (e.g. \"read this business's Google reviews\", \"create a Trello card\", \"charge a card via Stripe\"). DON'T invent a tool id for these — add the phrase to neededCapabilities and we'll resolve it to a real integration. Use [] when the menu already covers everything.",
    "Examples:",
    buildStarterExamples(),
    "Do not include any prose, explanation, or markdown fences. Output JSON only.",
  ].join("\n");

  const lessons = typeof priorLessons === "string" ? priorLessons.trim() : "";
  const corrections = `Past corrections to honor: ${lessons || "none"}.`;
  return `${base}\n\n${corrections}`;
}

// ─── defensive parse ─────────────────────────────────────────────────────────

/** Strip a leading/trailing ```json … ``` (or ``` … ```) fence if the model
 *  wrapped its JSON despite the instruction not to. Mirrors classify-llm. */
function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

/**
 * Parse the model's text into a raw object the seam can normalize, or `{}`.
 *
 * Deliberately PERMISSIVE on the shape: we DON'T validate the fields here — the
 * seam's `normalizeAuthoredAgent` is the single validator (non-empty skillMd,
 * trigger clamp, channel/tools filtering). We only guarantee a plain object goes
 * out: a parse error, a non-object (string/number/array/null) → `{}` (→ no
 * skillMd → the seam yields null → the caller falls back to the heuristic).
 * Never throws.
 */
export function parseAuthoredResponse(raw: string): unknown {
  if (typeof raw !== "string") return {};
  const stripped = stripFences(raw);
  if (!stripped) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return {};
  }
  // Only a plain object can be a draft. Arrays/null/primitives → {} (seam → null).
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  return parsed;
}

// ─── the author factory ──────────────────────────────────────────────────────

/**
 * Build a real premium (Opus by default) {@link AgentAuthor}. The returned author turns one
 * sentence (+ optionally the recalled loop-memory lessons) into a RAW draft via a
 * single strict Anthropic call, then returns the PARSED object verbatim for the
 * seam to validate. It FAILS SOFT on every failure mode (no key, network error,
 * non-JSON → `{}` → the seam yields null → the caller falls back to the
 * heuristic). It NEVER throws; authorAgentDraft wraps it with the same guarantee.
 *
 * `getClient` is the DI seam — defaults to getAnthropicClient (the platform
 * Anthropic client, or null when ANTHROPIC_API_KEY is unset, in which case the
 * author returns `{}` and generation proceeds via the heuristic). Tests inject a
 * fake client to exercise the prompt + parse without a network call.
 */
export function makeLlmAgentAuthor(
  deps: { getClient?: () => Anthropic | null } = {},
): AgentAuthor {
  const getClient = deps.getClient ?? getAnthropicClient;

  return async (sentence: string, priorLessons?: string): Promise<unknown> => {
    const text = typeof sentence === "string" ? sentence.trim() : "";
    if (!text) return {};

    const client = getClient();
    if (!client) return {};

    const model = process.env.ANTHROPIC_AUTHOR_MODEL?.trim() || DEFAULT_AUTHOR_MODEL;
    const system = buildAuthorSystemPrompt(priorLessons);

    try {
      const resp = await client.messages.create({
        model,
        max_tokens: AUTHOR_MAX_TOKENS,
        system,
        messages: [{ role: "user", content: text }],
      });

      const out = resp.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      return parseAuthoredResponse(out);
    } catch {
      // Fail-soft: any LLM/network error → {} (→ no skillMd → seam null → the
      // caller falls back to the deterministic heuristic path).
      return {};
    }
  };
}
