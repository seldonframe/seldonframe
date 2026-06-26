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

import type { OrgSoul, SoulService } from "@/lib/soul/types";
import type { AgentBlueprint } from "@/db/schema/agents";
import type {
  DeploymentFaqEntry,
  DeploymentService,
} from "@/lib/agents/persona/deployment-customization";
import {
  canonicalArchetype,
  composeDefaultSkillMd,
  getSkillsForArchetype,
  renderSkill,
} from "./skills/registry";
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
  /** Per-deployment persona (P2) — the resolved client-facing greeting/opener. The
   *  chat/SMS/email system prompt has no native greeting seam (the widget opener is
   *  separate), so when a deployment supplies one we emit it as a one-line opener
   *  directive right after the persona. Empty/undefined → unchanged. */
  greetingPrefix?: string | null;
};

/** The EFFECTIVE per-deployment persona `resolveDeploymentPersona` produces,
 *  as consumed by the chat/SMS/email prompt builder. Each field is null when its
 *  source was null (→ the template/blueprint value stands). `voiceId`/businessName
 *  are intentionally NOT part of this shape — text channels have no TTS voice, and
 *  the business name already grounds via the org name + filled prompt. */
export type DeploymentPromptPersona = {
  greeting: string | null;
  prompt: string | null;
  faq: DeploymentFaqEntry[] | null;
  services: DeploymentService[] | null;
};

/**
 * Splice a resolved per-deployment persona into the `{ blueprint, soul }` inputs
 * `composeSystemPrompt` consumes, mirroring the voice path (`deployment-voice.ts`)
 * so chat/SMS/email speak AS the client with the SAME seams:
 *
 *   - `persona.prompt` (non-null) → `blueprint.customSkillMd`. This is the verbatim
 *     operator-prose seam composeSystemPrompt already honors (it REPLACES the
 *     up-front platform skills). The resolver already placeholder-filled it, so the
 *     string is injected as-is — never re-templated (no `{token}` corruption).
 *   - `persona.faq` (non-null) → `blueprint.faq` (the grounding/context FAQ block
 *     the model cites). Override-wins-WHOLE, matching the resolver's semantics.
 *   - `persona.services` (non-null) → `soul.services` (the "Services we offer"
 *     grounding block reads from the soul, not the blueprint).
 *   - `persona.greeting` (non-null) → returned as `greetingPrefix`; the chat system
 *     prompt has no dedicated greeting seam (the widget opener is separate), so the
 *     caller prepends it as a one-line opener directive the model sees.
 *
 * Pure; never throws. A null field leaves its target untouched, so a fully-null
 * persona returns the inputs byte-for-byte unchanged. New objects are returned
 * (no mutation of the caller's blueprint/soul).
 */
export function applyDeploymentPersona(args: {
  blueprint: AgentBlueprint;
  soul: OrgSoul | null;
  persona?: DeploymentPromptPersona | null;
}): { blueprint: AgentBlueprint; soul: OrgSoul | null; greetingPrefix: string | null } {
  const { blueprint, soul, persona } = args;
  if (!persona) return { blueprint, soul, greetingPrefix: null };

  // prompt → customSkillMd (verbatim; already placeholder-filled by the resolver),
  // faq → blueprint.faq (override-wins-WHOLE). Only override when non-null so the
  // template/blueprint value stands otherwise.
  let nextBlueprint = blueprint;
  if (persona.prompt !== null) {
    nextBlueprint = { ...nextBlueprint, customSkillMd: persona.prompt };
  }
  if (persona.faq !== null) {
    nextBlueprint = { ...nextBlueprint, faq: persona.faq };
  }

  // services → soul.services (the "Services we offer" section reads the soul). Map
  // the deployment shape { name, description?, price? } onto SoulService; price is a
  // free-form string on the deployment side but numeric on the soul, so drop it
  // here (the name + description are what ground the answer) rather than coerce.
  let nextSoul = soul;
  if (persona.services !== null) {
    const mapped: SoulService[] = persona.services.map((s) => ({
      name: s.name,
      ...(s.description ? { description: s.description } : {}),
    }));
    nextSoul = { ...(soul ?? ({} as OrgSoul)), services: mapped };
  }

  const greetingPrefix =
    persona.greeting !== null && persona.greeting.trim() !== ""
      ? persona.greeting.trim()
      : null;

  return { blueprint: nextBlueprint, soul: nextSoul, greetingPrefix };
}

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
    greetingPrefix,
  } = input;

  // Resolve aliased archetypes (e.g. the builder's "chat-assistant" →
  // "website-chatbot") so persona + skills stay in lockstep.
  const canonical = canonicalArchetype(archetype);
  const personaTemplate =
    ARCHETYPE_PERSONAS[canonical] ?? ARCHETYPE_PERSONAS["website-chatbot"];
  const persona = personaTemplate.replace("{orgName}", orgName);

  const sections: string[] = [persona];

  // Per-deployment opener (P2). A deployment-resolved greeting becomes the agent's
  // opening line directive — emitted right after the persona so it leads the
  // conversation, mirroring how the voice path speaks the resolved greeting. The
  // string is already placeholder-filled by the resolver; emit verbatim.
  const trimmedGreeting = greetingPrefix?.trim() ?? "";
  if (trimmedGreeting.length > 0) {
    sections.push(
      `## Opening line\nOpen the conversation with: "${trimmedGreeting}"`,
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
  // Other skills (temporal-reasoning, be-smart-by-default, sdr) belong
  // here up front, before the dynamic content.
  //
  // 2026-05-17 — when the operator has set `customSkillMd` on the
  // blueprint, it REPLACES the up-front platform skills verbatim.
  // This is the "edit the SKILL.md in place" UX — the settings page
  // pre-fills the textarea with composeDefaultSkillMd(), the operator
  // edits the lines they care about, and saving stores their edited
  // copy. Hard-rules + pricing + business facts still get appended
  // below regardless, so the operator cannot disable safety invariants.
  // Empty/whitespace customSkillMd → fall back to the platform default.
  const allSkills = getSkillsForArchetype(archetype);
  const trimmedCustomSkillMd = blueprint.customSkillMd?.trim() ?? "";
  if (trimmedCustomSkillMd.length > 0) {
    sections.push(trimmedCustomSkillMd);
  } else {
    const upFrontSkills = allSkills.filter((s) => s.id !== "hard-rules");
    for (const skill of upFrontSkills) {
      sections.push(renderSkill(skill, skillVars));
    }
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
