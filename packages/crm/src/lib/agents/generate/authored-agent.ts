// Primitive-Composition Agent Generator — P1, Task 1: the AuthoredAgent seam.
//
// The new generator has the LLM AUTHOR an agent — write its full playbook
// (skillMd) and DECLARE its primitives (trigger / channel / tools) as structured
// output — instead of cloning a template. This module is the PURE seam + the
// DEFENSIVE normalizer the rest of the pipeline (compose → judge → lessons)
// builds on.
//
// The seam is fail-soft by design: a missing or broken author resolves to `null`
// and the caller falls back to today's heuristic path (parseAgentIntent →
// assembleAgentBundle), so generation NEVER blocks on the LLM.
//
// PURE — no "use server", no I/O / network / clock / env. Never throws. Never
// mutates its input. Safe to call from a Server Component, action, route
// handler, the runtime, or a test. The only side-effect-capable dependency (the
// author fn) is dependency-injected, so this file itself stays deterministic.

import {
  resolveAgentTrigger,
  type AgentTrigger,
  type EventChannel,
} from "@/lib/agents/triggers/agent-trigger";
import { TOOL_CATALOG } from "@/lib/agents/generate/tool-catalog";

// ─── types ───────────────────────────────────────────────────────────────────

/**
 * The author's RAW (pre-normalization) declaration of an agent's trigger. It is
 * intentionally loose — the author is an LLM, so any field may be missing or the
 * wrong shape. `normalizeAuthoredAgent` clamps it through `resolveAgentTrigger`
 * into a guaranteed-valid {@link AgentTrigger}. `cadenceLabel` is an optional
 * human hint ("Weekly Monday 8am") the author may emit alongside a cron; it is
 * advisory only and not consumed here.
 */
export type AuthoredTrigger = {
  kind: "inbound" | "event" | "schedule";
  event?: string;
  cron?: string;
  cadenceLabel?: string;
};

/**
 * A fully-normalized, validated agent draft the composer can safely wire into an
 * AgentBundle. Every field is guaranteed well-formed:
 *   • `skillMd` — non-empty (the playbook is the whole point; without it there is
 *     no agent → the normalizer returns null instead);
 *   • `trigger` — a valid {@link AgentTrigger} (clamped via `resolveAgentTrigger`);
 *   • `channel` — a valid {@link EventChannel} (sms|email) or `"none"`. `"none"`
 *     means the agent ACTS via its tools and sends NO customer message (a poster
 *     / logger). NOTE: the inbound surface (voice/chat) is already recorded on
 *     `trigger.channel`; `channel` here is strictly the OUTBOUND messaging axis,
 *     so an inbound agent normalizes to `"none"` on this field by default;
 *   • `tools` — only known {@link TOOL_CATALOG} ids, deduped (`[]` if none).
 */
export type AuthoredAgent = {
  name: string;
  summary: string;
  skillMd: string;
  /** Normalized via `resolveAgentTrigger` — always a valid trigger. */
  trigger: AgentTrigger;
  /** A valid EventChannel (sms|email) or "none" = acts via tools, no message. */
  channel: EventChannel | "none";
  /** Known TOOL_CATALOG ids only (unknown dropped, deduped). */
  tools: string[];
  /**
   * Plain-English capabilities the agent needs that AREN'T in the bindable tool
   * menu (e.g. "read this business's Google reviews", "create a Trello card",
   * "charge via Stripe"). The author adds these instead of inventing a tool id;
   * a downstream resolver maps each to a real integration. Trimmed, deduped,
   * capped, and OMITTED when empty/absent. Advisory — never wired as a tool here.
   */
  neededCapabilities?: string[];
  /** Optional grounding hints the composer wires (e.g. a review link). */
  knowledgeHints?: { reviewUrl?: string };
};

/**
 * The injectable author: turns one sentence (+ optionally the recalled
 * loop-memory lessons) into a RAW draft. Returns `unknown` on purpose — the
 * author is an LLM and may return anything (a partial object, a string, null);
 * the seam's {@link normalizeAuthoredAgent} is the sole validator.
 */
export type AgentAuthor = (
  sentence: string,
  priorLessons?: string,
) => Promise<unknown>;

// ─── the valid channel set (the clamp table) ─────────────────────────────────
//
// AuthoredAgent.channel is `EventChannel | "none"`. EventChannel is the
// {sms|email} OUTBOUND axis (see agent-trigger.ts); "none" is the action-only
// (post/log) channel. voice/chat/digest are NOT valid here — voice/chat are
// INBOUND surfaces (carried on trigger.channel, not this outbound field) and
// digest is a schedule-only channel the outbound axis doesn't model.

const VALID_CHANNELS: readonly (EventChannel | "none")[] = ["sms", "email", "none"];

/**
 * The fallback outbound channel for a trigger whose author-declared channel is
 * invalid/absent, keyed by the RESOLVED trigger kind:
 *   • schedule → "none"  (a cadence agent typically posts/digests via tools);
 *   • event    → "sms"   (a domain-event agent typically texts a person);
 *   • inbound  → "none"  (an inbound agent replies on its INBOUND surface, which
 *                         is on trigger.channel; it declares no OUTBOUND channel,
 *                         and "none" is the only inbound-safe value in this type).
 */
const CHANNEL_DEFAULT_BY_KIND: Record<AgentTrigger["kind"], EventChannel | "none"> = {
  schedule: "none",
  event: "sms",
  inbound: "none",
};

// ─── normalize ───────────────────────────────────────────────────────────────

/**
 * Turn the author's RAW output into a valid {@link AuthoredAgent}, or `null`.
 *
 * The single hard requirement is a **non-empty string `skillMd`** — the playbook
 * is the entire point of authoring (no playbook → there is no agent → null).
 * Everything else is clamped to a safe value rather than rejected:
 *   • `trigger`  → `resolveAgentTrigger(raw.trigger)` (any bad/missing shape
 *                  clamps to a valid trigger — the inbound voice default);
 *   • `channel`  → a valid EventChannel|"none", else defaulted by the resolved
 *                  trigger kind (see CHANNEL_DEFAULT_BY_KIND);
 *   • `tools`    → `raw.tools` filtered to known TOOL_CATALOG ids, deduped, in
 *                  the author's order (`[]` when absent / not an array);
 *   • `name`     → trimmed `raw.name`, else a humanized fallback from the
 *                  sentence/skill (never empty);
 *   • `summary`  → trimmed `raw.summary`, else `""`;
 *   • `knowledgeHints.reviewUrl` → kept only when a string, else hints omitted.
 *
 * NEVER throws. NEVER mutates `raw`.
 */
export function normalizeAuthoredAgent(raw: unknown): AuthoredAgent | null {
  if (!isPlainRecord(raw)) return null;

  const skillMd = typeof raw.skillMd === "string" ? raw.skillMd : "";
  if (skillMd.trim().length === 0) return null;

  // Trigger — fill a kind-appropriate channel (+ a default weekly cron for a
  // cron-less schedule) BEFORE resolving, so a kind-valid authored trigger like a
  // channel-less {kind:"schedule"} keeps its kind instead of clamping to the
  // inbound voice default (which would silently turn a poster into a phone agent).
  const trigger = resolveAgentTrigger(
    coerceTriggerForResolve(raw.trigger) as Partial<AgentTrigger> | null,
  );

  // Channel — keep a valid one (case/space tolerant), else default by kind.
  const channel = normalizeChannel(raw.channel) ?? CHANNEL_DEFAULT_BY_KIND[trigger.kind];

  // Tools — known catalog ids only, deduped, in declared order.
  const tools = filterKnownTools(raw.tools);

  // Needed capabilities — plain-English asks NOT in the tool menu (the escape
  // hatch). Trimmed, deduped, capped; omitted when empty/absent.
  const neededCapabilities = normalizeNeededCapabilities(raw.neededCapabilities);

  // Name — trimmed override, else a humanized fallback (never empty).
  const declaredName = typeof raw.name === "string" ? raw.name.trim() : "";
  const name = declaredName || humanizeName(skillMd);

  // Summary — trimmed, else "".
  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";

  // Knowledge hints — reviewUrl only when a string.
  const knowledgeHints = normalizeKnowledgeHints(raw.knowledgeHints);

  const out: AuthoredAgent = { name, summary, skillMd, trigger, channel, tools };
  if (neededCapabilities.length > 0) out.neededCapabilities = neededCapabilities;
  if (knowledgeHints) out.knowledgeHints = knowledgeHints;
  return out;
}

// ─── authorAgentDraft — the fail-soft DI seam ────────────────────────────────

/**
 * Run the injected author and normalize its output, fail-soft to `null`.
 *
 *   • no `deps.author`            → `null` (caller falls back to the heuristic);
 *   • `deps.author` throws        → `null`;
 *   • author returns garbage      → `null` (normalizer rejects: no skillMd);
 *   • author returns a good draft → the normalized {@link AuthoredAgent}.
 *
 * NEVER throws.
 */
export async function authorAgentDraft(
  sentence: string,
  deps: { author?: AgentAuthor; priorLessons?: string },
): Promise<AuthoredAgent | null> {
  const author = deps?.author;
  if (typeof author !== "function") return null;

  try {
    const raw = await author(sentence, deps.priorLessons);
    return normalizeAuthoredAgent(raw);
  } catch {
    // Fail-soft: any error in the LLM author path degrades to the heuristic.
    return null;
  }
}

// ─── helpers (pure) ──────────────────────────────────────────────────────────

/** True for a non-null, non-array object literal. */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * `resolveAgentTrigger` requires a KIND-VALID channel (schedule ∈ {email,digest}
 * with a cron; event ∈ {sms,email} with an event; inbound ∈ {voice,chat}) and
 * otherwise clamps the WHOLE trigger to the inbound voice default. An LLM author
 * routinely declares a kind without a valid channel (e.g. `{kind:"schedule",
 * cron}`), which would lose the schedule intent. This fills a safe
 * kind-appropriate channel — and a default weekly cron for a cron-less schedule —
 * so a kind-valid authored trigger survives resolution. An `event` trigger with
 * no `event` string stays unfillable and legitimately clamps to inbound. Returns
 * a loose object for `resolveAgentTrigger` to parse; never throws, never mutates.
 */
function coerceTriggerForResolve(raw: unknown): unknown {
  if (!isPlainRecord(raw)) return raw;
  const kind = raw.kind;
  if (kind === "schedule") {
    const channel =
      raw.channel === "email" || raw.channel === "digest" ? raw.channel : "digest";
    const cron =
      typeof raw.cron === "string" && raw.cron.trim() ? raw.cron : "0 9 * * 1";
    return { ...raw, kind, channel, cron };
  }
  if (kind === "event") {
    const channel =
      raw.channel === "sms" || raw.channel === "email" ? raw.channel : "sms";
    return { ...raw, kind, channel };
  }
  if (kind === "inbound") {
    const channel =
      raw.channel === "voice" || raw.channel === "chat" ? raw.channel : "voice";
    return { ...raw, kind, channel };
  }
  return raw; // unknown kind → let resolveAgentTrigger clamp to the safe default
}

/** Lower-case + trim a candidate channel; return it if valid, else null. */
function normalizeChannel(candidate: unknown): EventChannel | "none" | null {
  if (typeof candidate !== "string") return null;
  const c = candidate.trim().toLowerCase();
  return (VALID_CHANNELS as readonly string[]).includes(c)
    ? (c as EventChannel | "none")
    : null;
}

/** The set of known catalog ids (built once from TOOL_CATALOG). */
const KNOWN_TOOL_IDS: ReadonlySet<string> = new Set(TOOL_CATALOG.map((t) => t.id));

/**
 * Filter an unknown `tools` value to the known TOOL_CATALOG ids: drop unknown +
 * non-string entries, dedupe, preserve the author's order. `[]` when not an
 * array. Does not mutate the input.
 */
function filterKnownTools(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (!KNOWN_TOOL_IDS.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Hard cap on how many escape-hatch capability phrases we carry — enough to
 *  describe a multi-integration agent, bounded so a runaway author can't dump a
 *  list. */
const MAX_NEEDED_CAPABILITIES = 5;

/**
 * Filter an unknown `neededCapabilities` value to a clean list of plain-English
 * phrases: drop non-string + blank entries, trim each, dedupe (case-sensitively,
 * on the trimmed text), preserve the author's order, and cap at
 * {@link MAX_NEEDED_CAPABILITIES}. `[]` when not an array (the caller omits the
 * field when empty). Does not mutate the input.
 */
function normalizeNeededCapabilities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const phrase = entry.trim();
    if (!phrase || seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(phrase);
    if (out.length >= MAX_NEEDED_CAPABILITIES) break;
  }
  return out;
}

/**
 * Derive a readable agent name when the author didn't supply one. Takes the
 * first meaningful line of the skill playbook, strips markdown heading/list
 * markers, and Title-Cases a short prefix. Always returns a non-empty string
 * ("Custom Agent" as the last resort) — mirrors agent-bundle's humanizeSkill
 * style so authored + heuristic agents read consistently.
 */
function humanizeName(skillMd: string): string {
  const firstLine =
    skillMd
      .split(/\r?\n/)
      .map((l) => l.replace(/^[#>\-*\s]+/, "").trim())
      .find((l) => l.length > 0) ?? "";

  const words = firstLine
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());

  return words.length > 0 ? words.join(" ") : "Custom Agent";
}

/** Keep `{ reviewUrl }` only when reviewUrl is a string; else undefined. */
function normalizeKnowledgeHints(
  value: unknown,
): { reviewUrl?: string } | undefined {
  if (!isPlainRecord(value)) return undefined;
  return typeof value.reviewUrl === "string"
    ? { reviewUrl: value.reviewUrl }
    : undefined;
}
