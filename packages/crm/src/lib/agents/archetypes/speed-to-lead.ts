import type { Archetype } from "./types";

// Speed-to-Lead archetype — the reference implementation for the 7.c
// archetype library. Shape validated end-to-end by the 2026-04-21 live
// run (tasks/phase-7-synthesis-spike/live-run-report.md): 5 of 5
// determinism repeats converged on the trigger → wait → conversation →
// create_booking → send_email skeleton with 100% grounding / 0%
// hallucination. This template pins that proven shape so synthesis no
// longer has to re-derive it from scratch.

export const speedToLeadArchetype: Archetype = {
  id: "speed-to-lead",
  name: "Speed-to-Lead",
  description:
    "When someone submits an intake form, text them within minutes to qualify and book a consultation.",
  detailedDescription:
    "Fires on form.submitted. Waits a configurable delay (default 2 minutes — fast enough to feel immediate, slow enough to avoid double-fires on accidental double-submits), texts the prospect to qualify against your criteria (insurance, urgency, fit), extracts the preferred appointment time from the SMS conversation, books the consultation on your calendar via the booking block, and emails a confirmation. Logs an agent_action activity on the contact so you can audit what the agent did and when.",
  requiresInstalled: ["crm", "formbricks-intake", "sms", "caldiy-booking", "email"],
  knownLimitations: [
    {
      summary: "Qualification logic is Soul-derived, not user-configured.",
      detail:
        "The SMS conversation extracts what Soul suggests matters (insurance status / urgency / service fit). Users who want strict qualification rules — 'reject all under $X budget' — will need to tune the exit_when text post-synthesis. Per-archetype advanced qualification UI is V1.1.",
    },
    {
      summary: "Booking assumes standard business-hours availability.",
      detail:
        "create_booking schedules against the existing appointment type's availability window (Mon–Fri 9–5 by default, editable on /bookings). If the extracted preferred_start is outside that window, the booking create call 422s and the agent logs a fallback activity.",
    },
  ],
  placeholders: {
    $formId: {
      kind: "user_input",
      description: "Which intake form triggers this agent. Typically your new-client / consultation form.",
      valuesFromTool: "list_forms",
      example: "form_new_patient_intake",
    },
    $appointmentTypeId: {
      kind: "user_input",
      description: "Which appointment type to book qualified leads into.",
      valuesFromTool: "list_appointment_types",
      example: "appt_new_patient_consult",
    },
    $waitSeconds: {
      kind: "user_input",
      description:
        "Seconds to wait after form submission before the first SMS. Default 120 (2 min) — fast enough to feel immediate, slow enough to dedupe accidental double-submits.",
      example: "120",
    },
    $openingMessage: {
      kind: "soul_copy",
      description:
        "The opening SMS to the prospect. Warm, on-brand, mentions business name + what was requested, asks two concrete questions so the reply is easy. Keep under 320 chars.",
      soulFields: ["businessName", "tone", "offer", "services"],
      example:
        "Hi {{contact.firstName}}, thanks for reaching out to Bright Smile Dental! Happy to get you booked. Any preference on day/time? And do you have dental insurance you'd like us to check?",
    },
    $qualificationCriteria: {
      kind: "soul_copy",
      description:
        "What the conversation needs to establish before booking. Natural-language description; Claude reads this each turn to decide 'ready to book?' Use Soul's services + customer-fit signals.",
      soulFields: ["services", "customerFields", "customContext"],
      example:
        "The prospect has shared a preferred appointment day/time AND confirmed their insurance status (yes / no / unsure).",
    },
    $confirmationSubject: {
      kind: "soul_copy",
      description: "Email subject line for the booking confirmation. Brand-forward, reassuring.",
      soulFields: ["businessName", "tone"],
      example: "You're booked with Bright Smile Dental",
    },
    $confirmationBody: {
      kind: "soul_copy",
      description:
        "Email body for the booking confirmation. Confirms the time + location, restates what to expect, includes a 'reply to reschedule' out. Soul-tone matched.",
      soulFields: ["businessName", "tone", "mission", "offer"],
      example:
        "Hi {{contact.firstName}},\n\nYou're confirmed for {{preferred_start}} — we can't wait to meet you. What to expect: a relaxed 45-minute visit, no pressure, plenty of time for your questions.\n\nNeed to reschedule? Just reply to this email or text us back.\n\n— The Bright Smile team",
    },
  },
  specTemplate: {
    name: "Speed-to-Lead",
    description:
      "Qualify inbound intake-form submissions via SMS within minutes and book the next available consultation.",
    trigger: {
      type: "event",
      event: "form.submitted",
      filter: { formId: "$formId" },
    },
    variables: {
      contactId: "trigger.contactId",
      firstName: "trigger.contact.firstName",
      email: "trigger.contact.email",
      phone: "trigger.contact.phone",
    },
    steps: [
      {
        id: "wait_before_outreach",
        type: "wait",
        seconds: "$waitSeconds",
        next: "qualify_conversation",
      },
      {
        id: "qualify_conversation",
        type: "conversation",
        channel: "sms",
        initial_message: "$openingMessage",
        exit_when: "$qualificationCriteria",
        on_exit: {
          extract: {
            preferred_start: "ISO-8601 datetime for the preferred appointment start, snapped to the next available slot in the clinic's business hours (Mon–Fri 9am–5pm local time).",
            insurance_status: "one of: yes | no | unsure | not_asked",
          },
          next: "book_consultation",
        },
      },
      {
        id: "book_consultation",
        type: "mcp_tool_call",
        tool: "create_booking",
        args: {
          contact_id: "{{contactId}}",
          appointment_type_id: "$appointmentTypeId",
          starts_at: "{{preferred_start}}",
          notes: "Booked by Speed-to-Lead agent. Insurance status: {{insurance_status}}.",
        },
        next: "log_booking_activity",
      },
      {
        id: "log_booking_activity",
        type: "mcp_tool_call",
        tool: "create_activity",
        args: {
          contact_id: "{{contactId}}",
          type: "agent_action",
          subject: "Speed-to-Lead agent booked consultation",
          body: "Scheduled for {{preferred_start}}. Insurance: {{insurance_status}}.",
          metadata: {
            agentId: "{{agent.id}}",
            source: "speed-to-lead",
          },
        },
        next: "send_confirmation_email",
      },
      {
        id: "send_confirmation_email",
        type: "mcp_tool_call",
        tool: "send_email",
        args: {
          to: "{{email}}",
          subject: "$confirmationSubject",
          body: "$confirmationBody",
          contactId: "{{contactId}}",
        },
        next: null,
      },
    ],
  },
};
