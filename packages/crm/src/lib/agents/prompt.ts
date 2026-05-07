// v1.27.7 — agent system prompt composer (with platform intelligence baseline)
//
// Operators DO NOT write system prompts. We derive them from Soul +
// the agent's blueprint. This is the most important safety property
// of the architecture: the platform owns the prompt, operators
// contribute knowledge (FAQ, services), and the LLM does the
// reasoning. Bad prompts are a class of bugs the operator can't
// introduce.
//
// v1.27.7 adds the PLATFORM INTELLIGENCE BASELINE — defaults every agent
// gets for free, regardless of blueprint:
//   - Temporal grounding (today's date, day of week, timezone)
//   - "Don't ask for info you already have" rule
//   - "Resolve relative dates optimistically" rule
//   - "Echoing customer-provided data is fine" rule
//
// As Claude gets better, we add more nuance HERE. No code restructure.
// This is the "fat skill" layer in thin-harness/fat-skill.

import type { OrgSoul } from "@/lib/soul/types";
import type { AgentBlueprint } from "@/db/schema/agents";
import { getSkillsForArchetype, renderSkill } from "./skills/registry";

export type ComposeSystemPromptInput = {
  orgName: string;
  soul: OrgSoul | null;
  blueprint: AgentBlueprint;
  archetype: string;
  /** Optional brain notes loaded for this conversation context. */
  brainNotes?: string[];
  /** Whether this is a test-mode conversation. Affects tool guidance
   *  ("note: any booking actions in test mode are sandboxed"). */
  testMode?: boolean;
  /** v1.27.7 — current wall-clock context for the agent's temporal
   *  grounding. Defaults to "now in workspace's local timezone" if
   *  the runtime doesn't pass one. */
  now?: Date;
  /** v1.27.7 — workspace timezone (e.g. "America/Phoenix"). Used so
   *  the agent resolves "tomorrow" / "this Friday" in the OPERATOR'S
   *  local time, not the server's. */
  timezone?: string;
};

const ARCHETYPE_PERSONAS: Record<string, string> = {
  "website-chatbot":
    "You are the friendly, professional chat assistant for {orgName}. You help website visitors get quick answers, book appointments, and connect with the team when needed.",
  "voice-receptionist":
    "You are the warm, efficient phone receptionist for {orgName}. You speak naturally, listen carefully, and help callers schedule visits or get connected to the right person.",
  "sms-followup-bot":
    "You are the helpful SMS assistant for {orgName}. You write short, friendly text messages — never longer than 2 sentences unless absolutely necessary.",
};

export function composeSystemPrompt(input: ComposeSystemPromptInput): string {
  const {
    orgName,
    soul,
    blueprint,
    archetype,
    brainNotes,
    testMode,
    now,
    timezone,
  } = input;

  const personaTemplate =
    ARCHETYPE_PERSONAS[archetype] ?? ARCHETYPE_PERSONAS["website-chatbot"];
  const persona = personaTemplate.replace("{orgName}", orgName);

  const sections: string[] = [persona];

  // ── PLATFORM INTELLIGENCE BASELINE ────────────────────────────────────
  // v1.28.3 — skill-pack architecture. Behavioral guidance lives in
  // lib/agents/skills/<archetype>/*.ts (markdown-shaped string exports).
  // The registry returns ordered skills; we render each with the
  // workspace's context vars (current date, timezone) and emit them as
  // sections of the system prompt.
  //
  // Adding a new behavioral rule = adding a new file to skills/ + a new
  // entry in skills/registry.ts. No edits to this composer. As Claude
  // gets better, we EDIT the skill prose; architecture stays stable.

  const tz = timezone ?? "America/New_York";
  const nowDate = now ?? new Date();
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const skillVars: Record<string, string> = {
    currentDate: dateFormatter.format(nowDate),
    currentTime: timeFormatter.format(nowDate),
    timezone: tz,
  };

  // 'hard-rules' goes LAST in the prompt (after dynamic operator-supplied
  // sections like FAQ / pricing / brain notes), so it appears as the
  // final word the LLM reads — anchoring on safety invariants.
  // Other skills (temporal-reasoning, be-smart-by-default) belong here
  // up front, before the dynamic content.
  const allSkills = getSkillsForArchetype(archetype);
  const upFrontSkills = allSkills.filter((s) => s.id !== "hard-rules");
  for (const skill of upFrontSkills) {
    sections.push(renderSkill(skill, skillVars));
  }

  // Industry + offering
  if (soul?.industry) {
    sections.push(
      `## About this business\n` +
        `${orgName} is a ${soul.industry} business${soul.businessDescription ? `. ${soul.businessDescription}` : ""}.`,
    );
  }

  // Voice + tone
  if (soul?.voice) {
    const voiceLines: string[] = [];
    if (soul.voice.style) {
      voiceLines.push(`Tone: ${soul.voice.style}.`);
    }
    if (soul.voice.avoidWords && soul.voice.avoidWords.length > 0) {
      voiceLines.push(`Never use these words: ${soul.voice.avoidWords.join(", ")}.`);
    }
    if (soul.voice.samplePhrases && soul.voice.samplePhrases.length > 0) {
      voiceLines.push(
        `Sample phrases that capture our voice: ${soul.voice.samplePhrases.slice(0, 3).map((p) => `"${p}"`).join("; ")}.`,
      );
    }
    if (voiceLines.length > 0) {
      sections.push(`## Voice\n${voiceLines.join("\n")}`);
    }
  }

  // Services
  if (soul?.services && soul.services.length > 0) {
    const serviceLines = soul.services
      .slice(0, 8)
      .map((s) => `- ${s.name}${s.description ? ` — ${s.description}` : ""}`)
      .join("\n");
    sections.push(`## Services we offer\n${serviceLines}`);
  }

  // Pricing — STRICT. Only quote what's in the blueprint.
  if (blueprint.pricingFacts && blueprint.pricingFacts.length > 0) {
    const pricingLines = blueprint.pricingFacts
      .map(
        (p) =>
          `- ${p.label}: ${p.currency === "USD" ? "$" : p.currency + " "}${p.amount}`,
      )
      .join("\n");
    sections.push(
      `## Pricing (the ONLY prices you may quote)\n${pricingLines}\n\n` +
        `If the visitor asks about a price not listed above, say you'll have someone follow up with a custom quote — DO NOT invent a number.`,
    );
  } else {
    sections.push(
      `## Pricing\n` +
        `You don't have access to specific prices. If asked, say "I'll have someone follow up with a quote" and call escalate_to_human.`,
    );
  }

  // FAQ knowledge
  if (blueprint.faq && blueprint.faq.length > 0) {
    const faqLines = blueprint.faq
      .map((qa) => `Q: ${qa.q}\nA: ${qa.a}`)
      .join("\n\n");
    sections.push(`## FAQ knowledge\n${faqLines}`);
  }

  // Brain notes (per-workspace patterns)
  if (brainNotes && brainNotes.length > 0) {
    sections.push(
      `## Patterns we've learned from past conversations\n${brainNotes.join("\n")}`,
    );
  }

  // Hard rules from skill-pack — emitted AFTER dynamic operator content
  // so the safety invariants are the final word the LLM reads.
  const hardRulesSkill = allSkills.find((s) => s.id === "hard-rules");
  if (hardRulesSkill) {
    sections.push(renderSkill(hardRulesSkill, skillVars));
  }

  if (testMode) {
    sections.push(
      `## Test mode\n` +
        `This is a SANDBOX conversation — booking actions will not actually create real bookings. Use this to demonstrate behavior to the operator.`,
    );
  }

  return sections.join("\n\n");
}
