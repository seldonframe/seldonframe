// Agent Loop — L4 Generate-by-Default — Task T1: the pure bundle assembler.
//
// This module is the deterministic HEART of generate-by-default. The LLM (or the
// heuristic fallback) only CLASSIFIES an operator's English sentence into a
// small, structured `AgentIntent` — a skill, a trigger, a couple of hints. This
// assembler then wires EVERY safety primitive from SeldonFrame's own defaults:
//
//   • the trigger model   — resolveAgentTrigger (P1) clamps/normalizes the trigger;
//   • the L2 verify rubric — defaultRubricForSkill supplies the maker≠checker gate;
//   • the L3 guardrails    — defaultGuardrailsForSkill supplies the brakes
//                            (quiet hours / caps for review-requester; none for
//                            the time-critical speed-to-lead);
//   • the skill PROSE      — the matching STARTER_TEMPLATES blueprint is the base
//                            (right greeting/persona/capabilities), so the LLM
//                            never hand-writes a prompt either.
//
// The LLM never authors a rubric or guardrails (unreliable) — it picks the skill
// and SF supplies the error-proofing. A misclassified skill therefore still
// yields a SAFE (guard-railed, verified) agent: an unknown skill falls back to a
// generic, safe inbound chat assistant plus a warning to review before publish.
//
// It is intentionally PURE:
//   • no I/O, no clock, no env, no "use server";
//   • it never mutates its inputs — the base starter blueprint is deep-copied;
//   • it NEVER throws — any odd input clamps to the safe inbound default.
// Safe from a Server Component, action, route handler, runtime, or test.

import type { AgentBlueprint } from "@/db/schema/agents";
import {
  resolveAgentTrigger,
  type AgentTrigger,
} from "@/lib/agents/triggers/agent-trigger";
import { defaultRubricForSkill } from "@/lib/agents/verify/default-rubrics";
import { defaultGuardrailsForSkill } from "@/lib/agents/guardrails/agent-guardrails";
import {
  STARTER_TEMPLATES,
  type StarterTemplate,
} from "@/lib/agent-templates/starter-pack";
import { bindToolsForIntent } from "@/lib/agents/generate/bind-tools";
import type { ConnectorBinding } from "@/lib/agents/mcp/connectors";

// ─── public types ────────────────────────────────────────────────────────────

/**
 * The structured classification of an operator's sentence. The LLM/heuristic
 * fills this (skill + trigger + a few hints); the assembler turns it into a full,
 * safe blueprint. Only `skill` and `trigger` are required.
 */
export type AgentIntent = {
  /** The skill the agent performs, e.g. "review-requester" | "speed-to-lead" |
   *  any free string (an unrecognized one yields the safe inbound default). */
  skill: string;
  /** What FIRES the agent (the LLM/heuristic picks kind + event + channel). */
  trigger: AgentTrigger;
  /** Operator-facing name override (else the starter's name / a humanized skill). */
  name?: string;
  /** Operator-facing description override (else the starter's summary). */
  description?: string;
  /** A sentence of extra instruction folded into the skill's base prompt. */
  promptHint?: string;
  /** Business facts the classifier extracted from the sentence (e.g. a URL). */
  businessHints?: { reviewUrl?: string };
};

/** The assembled, ready-to-persist bundle. `blueprint` has trigger + verify +
 *  guardrails + the (hint-folded) skill prompt all populated; `warnings` are the
 *  operator-facing "before you go live" notes (empty when nothing's missing). */
export type AgentBundle = {
  name: string;
  description: string;
  blueprint: AgentBlueprint;
  warnings: string[];
};

// ─── safe fallback base (unknown skill) ──────────────────────────────────────

/** The generic, always-safe inbound chat assistant used when the intent's skill
 *  isn't one we recognize. Mirrors the house anti-hallucination tone of the
 *  starter chat personas so even a misclassified agent behaves conservatively. */
const FALLBACK_PROMPT = `You are a helpful inbound assistant for a local business. Greet the visitor, answer what you actually know, help them book or get in touch, and hand off to a human for anything you can't resolve.

## Ground rules (never break these)
- Never invent facts, hours, prices, or policies. If you're unsure, say so and offer to capture the visitor's details so a human can follow up (escalate_to_human).
- Never quote a firm price. If asked "how much", give an honest range from what you actually know and say the team will confirm the exact amount — never a made-up number.
- Use the booking tools for calendar actions; never guess a slot.
- Be friendly, concise, and helpful. Ask one thing at a time.`;

/** The fallback base blueprint (deep-copied per call so it's never shared). */
function fallbackBaseBlueprint(): AgentBlueprint {
  return {
    greeting: "Hi! How can I help you today?",
    capabilities: ["escalate_to_human"],
    customSkillMd: FALLBACK_PROMPT,
  };
}

// ─── outbound-task fallback (scheduled / event poster, no starter) ───────────

/** A minimal, safe base for an OUTBOUND automated task (e.g. a social poster)
 *  that has no starter template. Unlike the inbound fallback there's no greeting
 *  and no conversational capabilities — the agent isn't answering anyone, it runs
 *  on a trigger and does exactly what the operator's folded instruction says. The
 *  anti-hallucination ground rule mirrors the house tone so a poster never
 *  fabricates content. The operator's sentence is appended by foldPromptHint. */
const OUTBOUND_TASK_PROMPT = `You are an automated agent for a local business. Each time you run, do exactly what the operator instructs below. Never fabricate facts, reviews, prices, or quotes — only use real content. Keep it on-brand and concise.`;

/** The outbound-task base blueprint (deep-copied semantics — it's a fresh object
 *  per call). No greeting, empty capabilities — see OUTBOUND_TASK_PROMPT. */
function outboundTaskBaseBlueprint(): AgentBlueprint {
  return {
    capabilities: [],
    customSkillMd: OUTBOUND_TASK_PROMPT,
  };
}

/** Should the intent use the OUTBOUND-task base (vs. the inbound fallback) when
 *  it has no starter? Yes when the skill is the known outbound "social-poster",
 *  or when the trigger fires on a schedule/event (a non-conversational agent).
 *  An inbound/unknown skill keeps the conversational inbound fallback. */
function wantsOutboundBase(skill: string, trigger: AgentTrigger): boolean {
  if (skill === "social-poster") return true;
  return trigger.kind === "schedule" || trigger.kind === "event";
}

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Deep-clone a value so the assembler never mutates a shared source object
 *  (the STARTER_TEMPLATES entry, the intent). structuredClone is available on
 *  every runtime we target (Node 18+, the edge runtime). */
function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/**
 * Short, intent-level skill names → the real STARTER_TEMPLATES id whose rich
 * prose/persona/tools the assembler should use as the base.
 *
 * The classifier (heuristic + LLM) speaks in CONCEPTUAL skill names — e.g. it
 * emits `"receptionist"` for "answer my phone". But the starter that carries the
 * polished receptionist persona, the voice tool set, and the SDR playbook is
 * registered under `"ai-phone-receptionist"`. Without this alias an intent of
 * `"receptionist"` would miss the starter (skill !== any starter id) and fall to
 * the generic safe-inbound default — losing all the receptionist prose AND
 * tripping the "unrecognized skill" warning. The review-requester / speed-to-lead
 * skills already match their starter ids 1:1, so they need no alias.
 */
const SKILL_ALIASES: Record<string, string> = {
  receptionist: "ai-phone-receptionist",
};

/** Resolve an intent-level skill name to its canonical starter id (applying
 *  SKILL_ALIASES). A skill with no alias is returned unchanged. */
export function resolveSkillAlias(skill: string): string {
  return SKILL_ALIASES[skill] ?? skill;
}

/** Find the starter whose id matches the skill (the review-requester /
 *  speed-to-lead starters carry an id equal to the skill slug). The skill is
 *  alias-resolved first so a conceptual name like "receptionist" finds the
 *  "ai-phone-receptionist" starter. */
function starterForSkill(skill: string): StarterTemplate | undefined {
  const id = resolveSkillAlias(skill);
  return STARTER_TEMPLATES.find((s) => s.id === id);
}

/** "underwater-basket-weaver" → "Underwater Basket Weaver". Used for the name of
 *  an agent whose skill has no starter. */
function humanizeSkill(skill: string): string {
  const words = skill
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return words.length > 0 ? words.join(" ") : "Custom Agent";
}

/** Narrow a resolved trigger's channel down to the {sms|email} axis the verify
 *  rubric understands. Email stays email (long-form cap); anything else
 *  (sms / voice / chat / digest) → undefined so the rubric uses its SMS-length
 *  default — the safe, tighter cap. */
function verifyChannelFor(trigger: AgentTrigger): "sms" | "email" | undefined {
  return trigger.channel === "email" ? "email" : undefined;
}

/**
 * Dedupe a list of connector bindings by `kind`+`id`, preserving the FIRST
 * occurrence (so any connector the base blueprint already carried wins over a
 * later tool-bound one of the same kind+id) and the original order. Returns a new
 * array; the inputs are not mutated.
 */
function dedupeConnectors(connectors: ConnectorBinding[]): ConnectorBinding[] {
  const out: ConnectorBinding[] = [];
  const seen = new Set<string>();
  for (const c of connectors) {
    const key = `${c.kind}:${c.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/** Append the operator's extra instruction to the base prompt as its own line.
 *  An empty/whitespace hint folds nothing (returns the base unchanged). */
function foldPromptHint(base: string, hint?: string): string {
  const trimmed = (hint ?? "").trim();
  if (!trimmed) return base;
  const sep = base.endsWith("\n") ? "" : "\n";
  return `${base}${sep}\n${trimmed}`;
}

// ─── the assembler ───────────────────────────────────────────────────────────

/**
 * Assemble a complete, safe AgentBundle from a classified intent. Pure; never
 * throws. The flow:
 *   1. pick the matching STARTER_TEMPLATES blueprint as the base (deep-copied),
 *      or the generic safe inbound base when the skill is unrecognized;
 *   2. wire the trigger via resolveAgentTrigger (clamps any malformed shape);
 *   3. wire the verify rubric (defaultRubricForSkill, channel-aware, URL-aware)
 *      — falling back to any base verify if the skill has no default rubric;
 *   4. wire the guardrails (defaultGuardrailsForSkill) — falling back to any
 *      base guardrails if the skill has no defaults;
 *   5. set reviewUrl when a URL is known (ctx wins over the intent's hint);
 *   6. fold a promptHint into the prompt (customSkillMd);
 *   7. bind the external tools the sentence implies (bindToolsForIntent) onto
 *      blueprint.connectors — merged with any base connectors, deduped by
 *      kind+id; a no-tool agent's connectors stay exactly as the base left them;
 *   8. compute warnings (no review link for review-requester; unknown skill) and
 *      append the bound tools' warnings (empty in this pure layer).
 */
export function assembleAgentBundle(
  intent: AgentIntent,
  ctx?: { reviewUrl?: string; contactNameSample?: string },
): AgentBundle {
  const skill = intent.skill;
  const starter = starterForSkill(skill);
  const known = starter !== undefined;

  // 2. trigger — resolveAgentTrigger clamps a malformed shape to the inbound
  //    default, so a bad classification can never produce an illegal trigger.
  //    Resolved BEFORE the base so a no-starter skill can pick the right base
  //    (outbound automated task vs. inbound chat fallback) from the trigger.
  const trigger = resolveAgentTrigger(intent.trigger);

  // 1. base blueprint (deep copy so the source is never mutated). A skill with a
  //    starter uses it; otherwise pick the OUTBOUND-task base for a scheduled/
  //    event agent (e.g. social-poster) or the conversational inbound fallback.
  const outbound = !known && wantsOutboundBase(skill, trigger);
  const blueprint: AgentBlueprint = known
    ? (deepClone(starter!.blueprint) as AgentBlueprint)
    : outbound
      ? outboundTaskBaseBlueprint()
      : fallbackBaseBlueprint();

  blueprint.trigger = trigger;

  // 5. resolve the review URL once (ctx wins over the intent's hint).
  const reviewUrl = ctx?.reviewUrl ?? intent.businessHints?.reviewUrl;

  // 3. verify rubric — SF's per-skill default. Falls back to any base verify the
  //    starter already carried when the skill has no default rubric.
  const rubric = defaultRubricForSkill(skill, {
    reviewUrl,
    contactName: ctx?.contactNameSample,
    channel: verifyChannelFor(trigger),
  });
  if (rubric) blueprint.verify = rubric;

  // 4. guardrails — SF's per-skill default. Falls back to any base guardrails.
  const guardrails = defaultGuardrailsForSkill(skill);
  if (guardrails) blueprint.guardrails = guardrails;

  // 5. reviewUrl on the blueprint only when we actually have one.
  if (reviewUrl) blueprint.reviewUrl = reviewUrl;

  // 6. fold the operator's extra instruction into the skill prompt.
  blueprint.customSkillMd = foldPromptHint(
    blueprint.customSkillMd ?? "",
    intent.promptHint,
  );

  // 7. bind the EXTERNAL tools the sentence implies (L5.1). bindToolsForIntent
  //    runs the keyword catalog over intent.promptHint → ConnectorBinding[].
  //    Merge them onto whatever the base blueprint already carried, deduped by
  //    kind+id (base wins), and ONLY assign when there's at least one so a
  //    no-tool agent keeps connectors exactly as it was (undefined for the
  //    starters). bound.warnings is [] in this pure layer (I/O warnings — e.g.
  //    "connect Notion" — are added by the action/wire layer), so the bundle's
  //    warnings stay empty for a non-tool agent.
  const bound = bindToolsForIntent(intent);
  const mergedConnectors = dedupeConnectors([
    ...(blueprint.connectors ?? []),
    ...bound.connectors,
  ]);
  if (mergedConnectors.length > 0) {
    blueprint.connectors = mergedConnectors;
  }

  // 8. warnings — error-proofing surfaced to the operator before publish.
  const warnings: string[] = [];
  if (skill === "review-requester" && !reviewUrl) {
    warnings.push(
      "No review link set — add the client's Google review URL before going live.",
    );
  }
  if (!known) {
    warnings.push(
      outbound
        ? `Generated a safe automated-task agent for '${skill}' — review the instructions and connect any tools before publishing.`
        : `Unrecognized skill '${skill}' — generated a safe inbound assistant; review before publishing.`,
    );
  }
  // Tool-binding warnings (empty in the pure layer; reserved for the action layer).
  warnings.push(...bound.warnings);

  // name / description: intent override → starter copy → humanized skill.
  const name = intent.name ?? starter?.name ?? humanizeSkill(skill);
  const description =
    intent.description ??
    starter?.summary ??
    `A generated ${humanizeSkill(skill)} agent.`;

  return { name, description, blueprint, warnings };
}
