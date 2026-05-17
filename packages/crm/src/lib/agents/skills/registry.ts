// v1.28.3 — skill-pack registry.
//
// PHILOSOPHY (Karpathy / antifragile / thin-harness-fat-skill):
// Behavioral guidance for agents lives in markdown-style skill files,
// NOT inline in prompt.ts. The composer reads from this registry and
// assembles the system prompt. To improve agent intelligence, edit the
// skill files — no code change to the composer or runtime.
//
// As Claude (and successor models) get better at multi-turn memory,
// temporal reasoning, and avoiding hallucinated actions, we EDIT the
// skill prose rather than restructure code. Smaller models lean on
// verbose skills; larger models need terse ones. Same architecture
// either way.
//
// Each skill is { id, content, archetype, optional renderContext }.
// Templated skills (like temporal-reasoning) declare {{placeholder}}
// tokens that the composer fills in at prompt-build time.

import temporalReasoning from "./website-chatbot/temporal-reasoning";
import beSmartByDefault from "./website-chatbot/be-smart-by-default";
import sdr from "./website-chatbot/sdr";
import hardRules from "./website-chatbot/hard-rules";

export type Skill = {
  /** Stable id for ordering + observability. */
  id: string;
  /** Markdown-shaped content (string with {{placeholders}} or static prose). */
  content: string;
  /** Where this skill applies — defaults to all archetypes if "all". */
  archetypes: string[];
  /** Optional context vars this skill expects (composer must supply them). */
  renderVars?: string[];
};

/**
 * Ordered registry. Skills are emitted into the system prompt in the
 * order listed here. Order matters — temporal grounding before
 * behavioral defaults before hard rules. Adding a new skill = appending
 * a new file + a new registry entry.
 */
const REGISTRY: Skill[] = [
  {
    id: "temporal-reasoning",
    content: temporalReasoning,
    archetypes: ["website-chatbot", "voice-receptionist", "sms-followup-bot"],
    renderVars: ["currentDate", "currentTime", "timezone"],
  },
  {
    id: "be-smart-by-default",
    content: beSmartByDefault,
    archetypes: ["website-chatbot", "voice-receptionist", "sms-followup-bot"],
  },
  // v1.55.1 — SDR-tuned playbook for website-chatbot. Turns a generic
  // chat assistant into a front-desk SDR with a 3-5 turn funnel:
  // emergency triage → identify service → qualify location → capture
  // contact → book or escalate. References capabilities already in
  // DEFAULT_CAPABILITIES_BY_ARCHETYPE["website-chatbot"] — no tool
  // additions required. Scoped to website-chatbot only; voice / SMS
  // archetypes have different turn cadences and need their own playbooks.
  {
    id: "website-chatbot-sdr",
    content: sdr,
    archetypes: ["website-chatbot"],
  },
  {
    id: "hard-rules",
    content: hardRules,
    archetypes: ["website-chatbot", "voice-receptionist", "sms-followup-bot"],
  },
];

/**
 * Returns the skills applicable to a given archetype, in the order they
 * should appear in the system prompt. Composer renders each via
 * renderSkill() with whatever context vars it has.
 */
export function getSkillsForArchetype(archetype: string): Skill[] {
  return REGISTRY.filter((s) => s.archetypes.includes(archetype));
}

/**
 * Substitute {{placeholder}} tokens with values from `vars`. Unknown
 * placeholders are left intact (visible in the prompt as a hint that a
 * skill expected something the composer didn't provide).
 */
export function renderSkill(skill: Skill, vars: Record<string, string>): string {
  return skill.content.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return key in vars ? vars[key] : `{{${key}}}`;
  });
}

/**
 * 2026-05-17 — Composes the "up-front" SKILL.md exactly as the runtime
 * would render it for `archetype`. Hard-rules are intentionally
 * EXCLUDED — they stay platform-enforced and the operator can never
 * remove them, so showing them in the editor would be misleading
 * (editing them does nothing).
 *
 * Two consumers:
 *   - Settings page: pre-fills the customSkillMd textarea so the
 *     operator sees what's actually running and can edit specific
 *     lines instead of writing from scratch.
 *   - composeSystemPrompt(): when customSkillMd is set, this default
 *     is what got REPLACED; when unset, this is what gets rendered.
 */
export function composeDefaultSkillMd(
  archetype: string,
  vars: Record<string, string>,
): string {
  const skills = getSkillsForArchetype(archetype).filter(
    (s) => s.id !== "hard-rules",
  );
  return skills.map((skill) => renderSkill(skill, vars)).join("\n\n");
}
