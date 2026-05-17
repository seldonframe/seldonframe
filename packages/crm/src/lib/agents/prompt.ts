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
import { frameFaqForSystemPrompt, type FaqEntry } from "./runtime/scraped-content-framing";
import {
  summarizeWeeklyHours,
  type WeeklyHours,
} from "@/lib/workspace/format-hours";

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

export async function composeSystemPrompt(input: ComposeSystemPromptInput): Promise<string> {
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

  // 2026-05-17 — operator-supplied SKILL.md override.
  //
  // Layered RIGHT AFTER the persona so it influences how the agent
  // interprets every subsequent platform skill, business fact, and
  // safety rule. We intentionally place it BEFORE hard-rules (which
  // still go last) so the operator can't override safety invariants
  // like "never quote prices not in pricingFacts" — the platform
  // sections after this one re-assert those constraints and the
  // hard-rules section at the very end has the final word.
  //
  // Wrapped in an <operator_playbook> tag so the LLM treats it as
  // operator guidance to apply (vs the persona's voice or an external
  // instruction that needs validation).
  const trimmedCustomSkillMd = blueprint.customSkillMd?.trim();
  if (trimmedCustomSkillMd && trimmedCustomSkillMd.length > 0) {
    sections.push(
      `## Operator playbook\n\n` +
        `The workspace operator has provided the following playbook. Treat ` +
        `it as house style and operational guidance — follow it, but never ` +
        `at the expense of the safety rules and pricing constraints set ` +
        `later in this prompt.\n\n` +
        `<operator_playbook>\n${trimmedCustomSkillMd}\n</operator_playbook>`,
    );
  }

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

  // FAQ knowledge — wrapped in semantic XML tags via the framing helper.
  // The helper prepends a directive instructing the LLM to treat tagged
  // content as facts to cite, not instructions to follow. This is the
  // input-side defense for FAQs sourced from URL crawl (the runtime applies
  // framing at prompt-assembly time rather than at blueprint-write time).
  if (blueprint.faq && blueprint.faq.length > 0) {
    const framedFaq = await frameFaqForSystemPrompt(blueprint.faq as FaqEntry[]);
    sections.push(framedFaq);
  }

  // v1.55.x — Snake-case soul enrichment.
  //
  // The OrgSoul TS interface above gives us camelCase (industry,
  // businessDescription, services). But the organizations.soul JSONB
  // ALSO carries snake_case fields written by the URL-scrape +
  // soul-compiler path: business_description, services (richer),
  // review_count, review_rating, certifications, trust_signals,
  // emergency_service, same_day, service_area. Cast through
  // Record<string, unknown> to read them (codebase convention; see
  // resolveOrgArchetype in lib/page-blocks/persist.ts).
  //
  // Without this section the chatbot is a generic SDR; with it, the
  // chatbot can answer "do you do emergency service?" / "what's your
  // rating?" / "what cities do you cover?" with the real client facts.
  const soulRaw = (soul as unknown as Record<string, unknown> | null) ?? null;
  if (soulRaw && typeof soulRaw === "object") {
    const factLines: string[] = [];

    const businessDesc =
      typeof soulRaw.business_description === "string"
        ? soulRaw.business_description.trim()
        : "";
    if (businessDesc) {
      factLines.push(`About this business: ${businessDesc}`);
    }

    // services — may be array of strings OR array of { name, description } objects.
    // Skip if the camelCase soul.services already populated the "Services we offer"
    // section above — avoid duplicating service lists in two places. We only emit
    // here when soul.services is empty/unset but the snake_case shape has entries.
    const hasCamelServices = !!(soul?.services && soul.services.length > 0);
    const rawServices = Array.isArray(soulRaw.services) ? soulRaw.services : null;
    if (!hasCamelServices && rawServices && rawServices.length > 0) {
      const serviceLines: string[] = [];
      for (const svc of rawServices) {
        if (typeof svc === "string") {
          serviceLines.push(`- ${svc}`);
        } else if (svc && typeof svc === "object") {
          const s = svc as Record<string, unknown>;
          const name = typeof s.name === "string" ? s.name : "";
          const desc = typeof s.description === "string" ? s.description : "";
          if (name) {
            serviceLines.push(`- ${name}${desc ? ` — ${desc}` : ""}`);
          }
        }
      }
      if (serviceLines.length > 0) {
        factLines.push(`\nServices we offer:\n${serviceLines.join("\n")}`);
      }
    }

    const reviewCount =
      typeof soulRaw.review_count === "number" ? soulRaw.review_count : null;
    const reviewRating =
      typeof soulRaw.review_rating === "number" ? soulRaw.review_rating : null;
    if (reviewCount && reviewRating) {
      factLines.push(
        `\nSocial proof: ${reviewCount} reviews averaging ${reviewRating}★`,
      );
    }

    const certs = Array.isArray(soulRaw.certifications)
      ? soulRaw.certifications.filter((c): c is string => typeof c === "string")
      : null;
    if (certs && certs.length > 0) {
      factLines.push(`Certifications / credentials: ${certs.join(", ")}`);
    }

    const trustSignals = Array.isArray(soulRaw.trust_signals)
      ? soulRaw.trust_signals.filter((t): t is string => typeof t === "string")
      : null;
    if (trustSignals && trustSignals.length > 0) {
      factLines.push(`Trust signals: ${trustSignals.join(", ")}`);
    }

    const emergencyService = soulRaw.emergency_service === true;
    const sameDay = soulRaw.same_day === true;
    if (emergencyService || sameDay) {
      const flags: string[] = [];
      if (emergencyService) flags.push("24/7 emergency service");
      if (sameDay) flags.push("same-day appointments");
      factLines.push(`Availability: ${flags.join(", ")}`);
    }

    const serviceArea = Array.isArray(soulRaw.service_area)
      ? soulRaw.service_area.filter((a): a is string => typeof a === "string")
      : null;
    if (serviceArea && serviceArea.length > 0) {
      factLines.push(`Service area: ${serviceArea.join(", ")}`);
    }

    // v1.56.0 — Business hours.
    //
    // soul.business_hours is the canonical WeeklyHours shape written
    // by create-full.ts. When business_hours_assumed is true, the
    // backend defaulted to Mon-Fri 9-5 (no real hours on the site) —
    // suffix the line so the chatbot knows to disclaim them rather
    // than present them as ground truth.
    const businessHours = soulRaw.business_hours as WeeklyHours | undefined;
    const businessHoursAssumed = Boolean(soulRaw.business_hours_assumed);
    if (businessHours && Object.keys(businessHours).length > 0) {
      const summary = summarizeWeeklyHours(businessHours);
      const suffix = businessHoursAssumed
        ? " (assumed standard hours — confirm with caller before quoting)"
        : "";
      factLines.push(`**Hours:** ${summary}${suffix}`);
    }

    if (factLines.length > 0) {
      sections.push(
        `## Business facts\n\n${factLines.join("\n")}\n\n` +
          `Use this information to answer business-specific questions accurately. ` +
          `Don't make up facts not in this section — if asked about something not ` +
          `listed (e.g., specific pricing, exact hours), say so honestly and offer ` +
          `to escalate to a human or schedule a call.`,
      );
    }
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
