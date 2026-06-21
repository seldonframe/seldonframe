// Task A5 — composeVoicePersona: per-workspace, timezone-grounded system
// prompt for voice-receptionist agents.
//
// Pure function (no DB, no Date.now). Mirrors the structure of
// composeSystemPrompt() in prompt.ts but is tailored for voice:
//   1. Temporal grounding (currentDate / currentTime / timezone) via Intl.
//   2. Skill body: customSkillMd verbatim if set, else composeDefaultSkillMd.
//   3. Business facts from soul (name, services, voice/tone) — defensive reads.
//   4. blueprint.faq inline if present.

import type { AgentBlueprint } from "@/db/schema/agents";
import type { BookingIntakeField } from "@/lib/bookings/actions";
import { composeDefaultSkillMd } from "@/lib/agents/skills/registry";

/**
 * Voice R1 — build the deterministic "what to collect before booking"
 * instruction for THIS workspace from its appointment-type intakeFields. Pure.
 *
 * A plumber workspace declares phone + address + service (no email); the agency
 * declares email. We list each field's label with required/optional, and tell
 * the model to pass them to book_appointment as `intakeResponses` keyed by the
 * exact field id. With NO custom fields we fall back to name + email.
 */
export function composeBookingFieldsInstruction(
  intakeFields: BookingIntakeField[] | undefined,
): string {
  const fields = (intakeFields ?? []).filter(
    (f): f is BookingIntakeField =>
      !!f && typeof f.id === "string" && f.id.trim().length > 0,
  );

  if (fields.length === 0) {
    // Legacy / agency default: name + email.
    return (
      "## Booking — what to collect\n\n" +
      "To book, collect the caller's full name and email. Pass the email to " +
      "book_appointment (the `email` field). Always read the details back and " +
      "get a yes before calling book_appointment with confirmed:true."
    );
  }

  const lines = fields.map((f) => {
    const label = typeof f.label === "string" && f.label.trim().length > 0 ? f.label.trim() : f.id;
    const req = f.required ? "required" : "optional";
    return `- ${label} (${req}) — field id: \`${f.id}\``;
  });
  const ids = fields.map((f) => f.id).join(", ");

  return (
    "## Booking — what to collect\n\n" +
    "To book, collect the caller's full name plus:\n" +
    `${lines.join("\n")}\n\n` +
    `Pass these to book_appointment as \`intakeResponses\` keyed by field id ` +
    `(${ids}). Collect every required field before booking. Always read the ` +
    `details back and get a yes before calling book_appointment with confirmed:true.`
  );
}

export function composeVoicePersona(args: {
  soul: unknown;
  blueprint: AgentBlueprint;
  timezone: string;
  now: Date;
  // Voice R1 — this workspace's appointment-type intake fields. Drives the
  // deterministic "To book, collect…" instruction so the receptionist asks for
  // exactly what THIS workspace needs (plumber: phone+address+service; agency:
  // email). Absent/empty → falls back to name + email.
  intakeFields?: BookingIntakeField[];
  // Stage B — learned patterns from past calls (loadAgentBrainContext). Injected
  // as a trailing section so the model treats them as soft guidance, not hard
  // rules. Optional: absent/empty → no brain section.
  brainNotes?: string[];
  // Voice R1+ — true when the inbound call carries the caller's number (caller
  // ID). When set, the persona tells the agent NOT to ask for the phone — it's
  // captured automatically from the caller ID. False/absent (e.g. anonymous
  // callers) → no such line, so the agent collects the phone normally.
  callerPhoneKnown?: boolean;
}): string {
  const { soul, blueprint, timezone, now } = args;

  // ── Temporal grounding ──────────────────────────────────────────────────
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const currentDate = dateFormatter.format(now);
  const currentTime = timeFormatter.format(now);
  const skillVars: Record<string, string> = {
    currentDate,
    currentTime,
    timezone,
  };

  // ── Skill body ──────────────────────────────────────────────────────────
  const trimmedCustomSkillMd = blueprint.customSkillMd?.trim() ?? "";
  const skillBody =
    trimmedCustomSkillMd.length > 0
      ? trimmedCustomSkillMd
      : composeDefaultSkillMd("voice-receptionist", skillVars);

  // ── Business facts from soul ────────────────────────────────────────────
  // Soul is loosely typed (OrgSoul or enriched snake_case JSONB blob).
  // Read defensively via Record<string, unknown>.
  const soulRaw = (soul as Record<string, unknown> | null) ?? {};

  const businessName =
    typeof soulRaw.businessName === "string"
      ? soulRaw.businessName
      : typeof soulRaw.business_name === "string"
        ? soulRaw.business_name
        : "";

  const sections: string[] = [];

  // Persona header — always emitted
  const personaLine = businessName
    ? `You are the warm, efficient phone receptionist for ${businessName}. You speak naturally, listen carefully, and help callers schedule visits or get connected to the right person.`
    : "You are the warm, efficient phone receptionist for this business. You speak naturally, listen carefully, and help callers schedule visits or get connected to the right person.";
  sections.push(personaLine);

  // Skill section
  sections.push(skillBody);

  // Voice R1 — per-workspace booking fields. Emitted right after the skill body
  // so the deterministic "collect exactly these" instruction sits alongside the
  // booking-flow guidance the model just read.
  sections.push(composeBookingFieldsInstruction(args.intakeFields));

  // Voice R1+ — caller-ID short-circuit. When the inbound call carries the
  // caller's number, the agent already HAS the phone — asking for it is a
  // jarring, redundant question on a phone call. Emit a deterministic line right
  // after the booking-fields block instructing the agent not to ask (the number
  // is recorded automatically from caller ID). Omitted for anonymous callers so
  // the agent collects the phone the normal way.
  if (args.callerPhoneKnown) {
    sections.push(
      "You already have the caller's phone number from their caller ID — do NOT " +
        "ask them for it; it's recorded automatically. Collect only the remaining fields.",
    );
  }

  // Business facts header
  const factLines: string[] = [];

  const businessDesc =
    typeof soulRaw.businessDescription === "string"
      ? soulRaw.businessDescription.trim()
      : typeof soulRaw.business_description === "string"
        ? soulRaw.business_description.trim()
        : "";
  if (businessDesc) {
    factLines.push(`About this business: ${businessDesc}`);
  }

  // Services — supports both OrgSoul.services (array of SoulService objects)
  // and raw snake_case services (strings or objects).
  const servicesRaw = Array.isArray(soulRaw.services) ? soulRaw.services : null;
  if (servicesRaw && servicesRaw.length > 0) {
    const serviceLines: string[] = [];
    for (const svc of servicesRaw) {
      if (typeof svc === "string") {
        serviceLines.push(`- ${svc}`);
      } else if (svc && typeof svc === "object") {
        const s = svc as Record<string, unknown>;
        const name = typeof s.name === "string" ? s.name : "";
        const desc = typeof s.description === "string" ? s.description : "";
        if (name) serviceLines.push(`- ${name}${desc ? ` — ${desc}` : ""}`);
      }
    }
    if (serviceLines.length > 0) {
      factLines.push(`\nServices we offer:\n${serviceLines.join("\n")}`);
    }
  }

  // Voice / tone
  const voiceRaw =
    soulRaw.voice && typeof soulRaw.voice === "object"
      ? (soulRaw.voice as Record<string, unknown>)
      : null;
  if (voiceRaw) {
    const voiceLines: string[] = [];
    if (typeof voiceRaw.style === "string") {
      voiceLines.push(`Tone: ${voiceRaw.style}.`);
    }
    const avoidWords = Array.isArray(voiceRaw.avoidWords)
      ? voiceRaw.avoidWords.filter((w): w is string => typeof w === "string")
      : [];
    if (avoidWords.length > 0) {
      voiceLines.push(`Never use these words: ${avoidWords.join(", ")}.`);
    }
    const samplePhrases = Array.isArray(voiceRaw.samplePhrases)
      ? voiceRaw.samplePhrases.filter((p): p is string => typeof p === "string")
      : [];
    if (samplePhrases.length > 0) {
      voiceLines.push(
        `Sample phrases that capture our voice: ${samplePhrases.slice(0, 3).map((p) => `"${p}"`).join("; ")}.`,
      );
    }
    if (voiceLines.length > 0) {
      factLines.push(`\nVoice:\n${voiceLines.join("\n")}`);
    }
  }

  if (factLines.length > 0) {
    sections.push(
      `## Business facts\n\n${factLines.join("\n")}\n\n` +
        `Use this information to answer business-specific questions accurately. ` +
        `Don't make up facts not in this section — if asked about something not ` +
        `listed, say so honestly and offer to escalate to a human.`,
    );
  }

  // FAQ from blueprint
  if (blueprint.faq && blueprint.faq.length > 0) {
    const faqLines = blueprint.faq
      .map((entry) => `Q: ${entry.q}\nA: ${entry.a}`)
      .join("\n\n");
    sections.push(`## FAQ\n\n${faqLines}`);
  }

  // Brain — patterns this workspace (and the global pool) have learned from
  // past calls. Soft guidance, emitted last so it's recent context but doesn't
  // override the hard rules already in the skill body.
  if (args.brainNotes && args.brainNotes.length > 0) {
    sections.push(
      `## Patterns we've learned from past calls\n\n${args.brainNotes.join("\n")}`,
    );
  }

  return sections.join("\n\n");
}
