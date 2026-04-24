import type { Archetype } from "./types";

// Daily-Digest archetype — SLICE 5 PR 2 C2 per audit §7.2.
//
// The first archetype shipping with trigger.type="schedule". Proves
// the SLICE 5 dispatcher path end-to-end: builder declares a schedule
// trigger with cron + timezone; the workflow-tick dispatcher fires the
// trigger at the scheduled minute; the agent runs send_email against
// the workspace's owner email.
//
// Structurally:
//   trigger (schedule: cron + timezone)
//     → send_email (daily summary to the workspace owner)
//
// Soul-derived placeholders: $digestSubject, $digestBody carry tone +
// content guidance. Synthesis generates prose from Soul's tone /
// sample-messages fields.
//
// User-input placeholders: $dailyCron (when to fire), $ownerEmail
// (where to send). Cron is validated by ScheduleTriggerSchema at
// AgentSpec parse; owner email by downstream email-sending tool.

export const dailyDigestArchetype: Archetype = {
  id: "daily-digest",
  name: "Daily Digest",
  description:
    "Every morning, email the workspace owner a short summary of what happened yesterday.",
  detailedDescription:
    "Fires on a cron schedule (default daily 8am workspace time). Sends a single email with yesterday's highlights: bookings added, intake submissions received, notable contact activity. The digest content is Soul-generated; tone matches the workspace's voice. No user action required per fire — the agent is autonomous.",
  requiresInstalled: ["crm", "email"],
  knownLimitations: [
    {
      summary: "Digest content is static-template, not Brain-synthesized.",
      detail:
        "v1 ships a one-step send_email with Soul-generated copy slotted at synthesis time. Brain v2 integration (dynamic summarization from recent CRM state) is a follow-up slice. Today the digest narrates workspace tone without summarizing specific numbers.",
    },
    {
      summary: "Single timezone per trigger.",
      detail:
        "The schedule fires at one time in one timezone. Multi-timezone fan-out (e.g., 'send at 8am local to each of my clients') is a future archetype that consumes contact-level timezone data.",
    },
  ],
  placeholders: {
    $dailyCron: {
      kind: "user_input",
      description:
        "Cron expression for when to fire (POSIX 5-field: minute hour day-of-month month day-of-week). Default 8am workspace timezone.",
      example: "0 8 * * *",
    },
    $scheduleTimezone: {
      kind: "user_input",
      description:
        "IANA timezone for the schedule (e.g., \"America/New_York\"). Falls back to the workspace default if unset.",
      example: "America/New_York",
    },
    $ownerEmail: {
      kind: "user_input",
      description: "Recipient email — typically the workspace owner.",
      example: "owner@example.com",
    },
    $digestSubject: {
      kind: "soul_copy",
      description:
        "Short subject line for the digest email. Matches the workspace's voice. Under 60 characters.",
      soulFields: ["tone", "brandName", "sampleMessages"],
      example: "Your Tuesday morning at {{orgName}}",
    },
    $digestBody: {
      kind: "soul_copy",
      description:
        "Body of the digest email — 2-3 short paragraphs. Mentions the workspace's recent activity without citing specific counts. Matches the workspace's voice. Ends with a sign-off.",
      soulFields: ["tone", "brandName", "sampleMessages", "ownerName"],
      example:
        "Morning {{firstName}},\n\nHere's a quick note on what came through yesterday. A couple of new contacts, a handful of bookings. Nothing urgent; just wanted to make sure you had the picture before the day gets busy.\n\n— {{brandName}}",
    },
  },
  specTemplate: {
    id: "daily-digest",
    name: "Daily Digest",
    description:
      "Daily morning email summary of yesterday's workspace activity, sent to the owner at a scheduled time.",
    trigger: {
      type: "schedule",
      cron: "$dailyCron",
      timezone: "$scheduleTimezone",
      catchup: "skip",
      concurrency: "skip",
    },
    variables: {
      orgName: "trigger.orgName",
      firstName: "trigger.ownerFirstName",
    },
    steps: [
      {
        id: "send_digest",
        type: "mcp_tool_call",
        tool: "send_email",
        args: {
          to: "$ownerEmail",
          subject: "$digestSubject",
          body: "$digestBody",
        },
        next: null,
      },
    ],
  },
};
