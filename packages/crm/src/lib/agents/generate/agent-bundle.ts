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

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Deep-clone a value so the assembler never mutates a shared source object
 *  (the STARTER_TEMPLATES entry, the intent). structuredClone is available on
 *  every runtime we target (Node 18+, the edge runtime). */
function deepClone<T>(value: T): T {
  return structuredClone(value);
}

/** Find the starter whose id matches the skill (the review-requester /
 *  speed-to-lead starters carry an id equal to the skill slug). */
function starterForSkill(skill: string): StarterTemplate | undefined {
  return STARTER_TEMPLATES.find((s) => s.id === skill);
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
 *   7. compute warnings (no review link for review-requester; unknown skill).
 */
export function assembleAgentBundle(
  intent: AgentIntent,
  ctx?: { reviewUrl?: string; contactNameSample?: string },
): AgentBundle {
  const skill = intent.skill;
  const starter = starterForSkill(skill);
  const known = starter !== undefined;

  // 1. base blueprint (deep copy so the source is never mutated).
  const blueprint: AgentBlueprint = known
    ? (deepClone(starter!.blueprint) as AgentBlueprint)
    : fallbackBaseBlueprint();

  // 2. trigger — resolveAgentTrigger clamps a malformed shape to the inbound
  //    default, so a bad classification can never produce an illegal trigger.
  const trigger = resolveAgentTrigger(intent.trigger);
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

  // 7. warnings — error-proofing surfaced to the operator before publish.
  const warnings: string[] = [];
  if (skill === "review-requester" && !reviewUrl) {
    warnings.push(
      "No review link set — add the client's Google review URL before going live.",
    );
  }
  if (!known) {
    warnings.push(
      `Unrecognized skill '${skill}' — generated a safe inbound assistant; review before publishing.`,
    );
  }

  // name / description: intent override → starter copy → humanized skill.
  const name = intent.name ?? starter?.name ?? humanizeSkill(skill);
  const description =
    intent.description ??
    starter?.summary ??
    `A generated ${humanizeSkill(skill)} agent.`;

  return { name, description, blueprint, warnings };
}
