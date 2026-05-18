// 2026-05-18 — outbound-messaging skill registry (plan v2, slice 2).
//
// Mirror of lib/agents/skills/registry.ts for the outbound side.
// Each entry pairs a skill id with its prose + the events + channels
// it applies to. Dispatcher looks up by skill id at send time.
//
// To add a new outbound message kind: create the prose file in this
// directory + add an entry to REGISTRY. No dispatcher code change.

import bookingConfirmationSkill from "./booking-confirmation";
import bookingConfirmationSmsSkill from "./booking-confirmation-sms";
import bookingCancellationSkill from "./booking-cancellation";
import intakeAutoReplySkill from "./intake-auto-reply";
import intakeAutoReplySmsSkill from "./intake-auto-reply-sms";

export type OutboundMessageSkill = {
  /** Stable id matching outbound_message_triggers.skill_id. */
  id: string;
  /** Human-friendly label for the operator UI. */
  label: string;
  /** Markdown-shaped prose with {{placeholder}} slots. */
  content: string;
  /** Channels this skill is valid for. Determines provider routing. */
  channels: Array<"email" | "sms">;
  /** Events this skill is intended to be wired to by default. Does
   *  not enforce — operators can wire any skill to any event via
   *  outbound_message_triggers.event_type. Used to seed defaults. */
  defaultEvents: string[];
};

const REGISTRY: OutboundMessageSkill[] = [
  {
    id: "booking-confirmation",
    label: "Booking confirmation (email)",
    content: bookingConfirmationSkill,
    channels: ["email"],
    defaultEvents: ["booking.created"],
  },
  {
    id: "booking-confirmation-sms",
    label: "Booking confirmation (SMS)",
    content: bookingConfirmationSmsSkill,
    channels: ["sms"],
    defaultEvents: ["booking.created"],
  },
  {
    id: "booking-cancellation",
    label: "Booking cancellation (email)",
    content: bookingCancellationSkill,
    channels: ["email"],
    defaultEvents: ["booking.cancelled"],
  },
  {
    id: "intake-auto-reply",
    label: "Intake auto-reply (email)",
    content: intakeAutoReplySkill,
    channels: ["email"],
    defaultEvents: ["form.submitted"],
  },
  {
    id: "intake-auto-reply-sms",
    label: "Intake auto-reply (SMS)",
    content: intakeAutoReplySmsSkill,
    channels: ["sms"],
    defaultEvents: ["form.submitted"],
  },
];

export function getMessageSkill(skillId: string): OutboundMessageSkill | null {
  return REGISTRY.find((s) => s.id === skillId) ?? null;
}

export function listMessageSkills(): OutboundMessageSkill[] {
  return REGISTRY.slice();
}

/**
 * Render a skill's prose with the supplied vars. Unknown {{slot}}
 * tokens are left intact so the LLM can see what the harness
 * couldn't fill (often "this field isn't set on the workspace soul").
 */
export function renderSkillPrompt(
  skill: OutboundMessageSkill,
  vars: Record<string, string>,
): string {
  return skill.content.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    key in vars ? vars[key] : `{{${key}}}`,
  );
}
