import type { Archetype } from "./types";

// Appointment-Confirm-SMS archetype — SLICE 7 PR 2 C3 per audit + L-23.
//
// First archetype using trigger.type="message". Demonstrates the
// SLICE 7 dispatch path end-to-end:
//   1. Patient texts "CONFIRM" to the workspace's Twilio number.
//   2. Twilio webhook → message-trigger dispatcher (SLICE 7 PR 1)
//      → matches this archetype's pattern → loop guard (PR 2 C1) →
//      runtime.startRun (PR 2 C2).
//   3. Run executes:
//      a. read_state pulls upcoming-appointment from Soul
//      b. branch on predicate (does the appointment exist?)
//      c. match: write_state confirmed + send_sms reply
//         (no-match): send_sms "no upcoming appointment" reply
//
// v1 design choices:
//   - Placeholder-FREE archetype. No $placeholders to fill at install
//     time. Per-workspace customization (e.g., custom reply copy) is
//     a follow-up slice that requires the installer flow + workspace
//     archetype-install table.
//   - Pattern is exact match on "CONFIRM" (case-insensitive default).
//     Other confirmation keywords ("YES", "OK", numeric 1) are
//     post-launch additions.
//   - Channel binding is `any` — fires on any inbound SMS to any
//     workspace number. Per-number routing requires the installer
//     flow.
//   - Soul read paths use the workspace.soul.* convention from
//     SLICE 3. Branch predicate uses field_exists against the
//     captured appointment payload.
//
// This is the L-23 3-run baseline durability check archetype:
// during C3 introduction, the probe runs 3 times and verifies the
// structural hash is identical across all runs before locking the
// baseline.

export const appointmentConfirmSmsArchetype: Archetype = {
  id: "appointment-confirm-sms",
  name: "Appointment Confirm via SMS",
  description:
    "When a patient texts CONFIRM, look up their upcoming appointment and reply with confirmation.",
  detailedDescription:
    "Fires on inbound SMS matching 'CONFIRM' (case-insensitive). Reads the sender's upcoming appointment from Soul. If found, marks it confirmed in Soul and replies with the appointment time. If no upcoming appointment, replies with a help prompt. End-to-end exercise of message trigger + read_state + branch (predicate) + write_state + send_sms.",
  requiresInstalled: ["crm", "sms"],
  knownLimitations: [
    {
      summary: "Single confirmation keyword (CONFIRM) — no synonyms in v1.",
      detail:
        "Builders who want YES/OK/1 as alternatives can author additional triggers. Multi-keyword regex pattern is supported via trigger.pattern.kind='regex' but not bundled into this archetype.",
    },
    {
      summary: "No reschedule branch — only confirm or no-match.",
      detail:
        "If the patient wants to reschedule, the no-match reply nudges them to ask for help. A future archetype handles the reschedule conversation thread.",
    },
    {
      summary: "Reply copy is not Soul-personalized in v1.",
      detail:
        "The reply is a fixed template ('Confirmed for {{appointment.time}}.'). Soul-generated copy is a follow-up that requires the placeholder-fill installer flow.",
    },
  ],
  placeholders: {},
  specTemplate: {
    id: "appointment-confirm-sms",
    name: "Appointment Confirm via SMS",
    description:
      "Inbound CONFIRM → look up upcoming appointment → mark confirmed + reply.",
    trigger: {
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "exact", value: "CONFIRM", caseSensitive: false },
    },
    variables: {
      contactId: "trigger.contactId",
      from: "trigger.from",
    },
    steps: [
      {
        id: "load_appointment",
        type: "read_state",
        source: "soul",
        path: "workspace.soul.appointments.upcoming.{{contactId}}",
        capture: "appointment",
        next: "check_appointment_exists",
      },
      {
        id: "check_appointment_exists",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "appointment.startsAt" },
        },
        on_match_next: "mark_confirmed",
        on_no_match_next: "reply_no_appointment",
      },
      {
        id: "mark_confirmed",
        type: "write_state",
        path: "workspace.soul.appointments.upcoming.{{contactId}}.status",
        value: "confirmed",
        next: "reply_confirmed",
      },
      {
        id: "reply_confirmed",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          contact_id: "{{contactId}}",
          to: "{{from}}",
          body: "Confirmed for {{appointment.startsAt}}. See you then!",
        },
        next: null,
      },
      {
        id: "reply_no_appointment",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          contact_id: "{{contactId}}",
          to: "{{from}}",
          body: "No upcoming appointment found. Reply HELP for assistance.",
        },
        next: null,
      },
    ],
  },
};
