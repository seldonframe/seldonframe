// Desert Cool HVAC — post-service-followup archetype.
// SLICE 9 PR 2 C3 per scenario doc + audit §4.4.
//
// **Workspace-scoped per G-9-7** — NOT in global registry.
//
// Trigger: event (`payment.completed`) — payments block emits after
// a service-call payment lands; this archetype subscribes to drive
// satisfaction follow-up.
//
// Steps:
//   1. wait — 24 hours (gives the customer time to settle on
//      satisfaction; texting too soon feels rushed)
//   2. mcp_tool_call — send_sms with brand voice
//      DESERT_COOL_HVAC_COPY.followUp ("How was your service today?
//      Reply 1-5 stars or any feedback.")
//   3. await_event sms.replied (timeout 48h) → on_resume=branch on
//      rating; on_timeout=send_reminder
//   4. branch (predicate, field gte) — rating >= 4 (high)
//      on_match → request_review
//      on_no_match → support_escalation
//   5a. send_sms — review request with Google review link
//   5b. emit_event hvac.satisfaction.escalation — operator
//       dashboard alerts; manual outreach
//   6. (timeout path) send_sms — gentle reminder + fresh 1-5 ask;
//      no second await (one shot to avoid SMS storm)
//
// Primitives exercised: subscription/event trigger, wait,
// mcp_tool_call (×3), await_event, branch (predicate),
// emit_event. 8-step flow demonstrating the longest archetype
// composition in SLICE 9.
//
// Edge cases handled at runtime (PR 2 integration tests):
//   - Payment refund (different event) → not subscribed; no run
//   - Customer reply non-numeric → branch defaults to "no_match"
//     path → support escalation (better-safe-than-sorry: surface
//     unparseable replies to operator)
//   - Customer reply 3 (boundary) → no_match → escalation (3 means
//     "meh"; treat as low to capture feedback)
//   - Timeout (no reply in 48h) → reminder + log; no further wait
//   - Workspace test mode (per SLICE 8) → SMS routes to Twilio
//     sandbox; no real-customer reach during operator testing
//   - Payment for a service with no tech assigned → still fires
//     (the archetype doesn't gate on technicianId — operator
//     follow-up is valuable regardless)

import type { Archetype } from "../../agents/archetypes/types";

export const postServiceFollowupArchetype: Archetype = {
  id: "hvac-post-service-followup",
  name: "Post-Service Follow-Up",
  description:
    "After a payment lands, wait 24h then SMS the customer asking for a 1-5 rating. High ratings get a review request; low ratings escalate to operator. Reminds at 48h if no reply.",
  detailedDescription:
    "Subscribes to payment.completed event from the payments block. Waits 24 hours to give the service experience time to settle, then SMS the customer asking for a 1-5 rating. Branches on the reply: high (>=4) gets a Google review ask; low (<=3, ambiguous, no reply) escalates to operator via emit_event for the dashboard to action. If no reply in 48h, sends a gentle reminder. Demonstrates SLICE 1 (subscription) + SLICE 2c (wait + await_event) + SLICE 6 (predicate branch) + SLICE 3 (emit_event) primitives composing into the longest SLICE 9 archetype (8 steps).",
  requiresInstalled: ["crm", "sms", "payments", "hvac-service-calls"],
  knownLimitations: [
    {
      summary: "Hardcoded 24h follow-up delay; no per-workspace tuning.",
      detail:
        "Phoenix HVAC convention is 24h follow-up. Other markets (e.g., commercial-only contractors) may prefer 1-week follow-up. Per-workspace timing requires builder-edit of the archetype JSON; configurable via Soul-driven param is post-launch.",
    },
    {
      summary: "Boundary 3-star routes to escalation, not review request.",
      detail:
        "v1 treats 3-star as 'meh' and surfaces to operator. Some workspaces may want 3-star to either request review (overly optimistic) or just thank the customer (overly conservative). Tunable via archetype edit; default chosen for SMB owner-operator who values capturing all feedback.",
    },
    {
      summary: "Single reminder; no escalating cadence.",
      detail:
        "v1 sends one reminder at 48h then ends. No second reminder, no escalation to phone call. Multi-step retention cadences are post-launch.",
    },
    {
      summary: "Doesn't filter out test-mode payments before sending.",
      detail:
        "If a workspace is in test mode and runs a test payment, the post-service follow-up will fire too. SLICE 8 test mode handles the SMS dispatch routing (sandbox), so customers don't get test surveys — but operator should be aware that the workflow runs.",
    },
  ],
  placeholders: {},
  specTemplate: {
    id: "hvac-post-service-followup",
    name: "Post-Service Follow-Up",
    description:
      "Subscribes to payment.completed → 24h wait → satisfaction SMS → branch on rating → review request OR escalation.",
    trigger: {
      type: "event",
      event: "payment.completed",
    },
    variables: {
      orgId: "trigger.orgId",
      contactId: "trigger.contactId",
      from: "trigger.contact.phone",
      paymentAmount: "trigger.amount",
    },
    steps: [
      {
        id: "wait_24h",
        type: "wait",
        seconds: 86400,
        next: "send_satisfaction",
      },
      {
        id: "send_satisfaction",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          contact_id: "{{contactId}}",
          to: "{{from}}",
          body:
            "Hi {{firstName}}, how was your service today? Reply 1-5 stars or any feedback.",
        },
        next: "await_rating",
      },
      {
        id: "await_rating",
        type: "await_event",
        event: "sms.replied",
        match: {
          kind: "field_equals",
          field: "data.contactId",
          value: "{{contactId}}",
        },
        timeout: { kind: "duration_ms", ms: 172800000 },
        on_resume: { capture: "rating_reply", next: "check_rating" },
        on_timeout: { next: "send_reminder" },
      },
      {
        id: "check_rating",
        type: "branch",
        condition: {
          type: "predicate",
          // PredicateSchema lacks field_gte; compose via `any` of
          // field_equals against the high-rating literals (4, 5).
          // Any other reply (1-3, non-numeric, ambiguous) takes the
          // no_match path → escalation. Better-safe-than-sorry posture.
          predicate: {
            kind: "any",
            of: [
              { kind: "field_equals", field: "rating_reply.body", value: "4" },
              { kind: "field_equals", field: "rating_reply.body", value: "5" },
              { kind: "field_equals", field: "rating_reply.body", value: "5 stars" },
              { kind: "field_equals", field: "rating_reply.body", value: "4 stars" },
            ],
          },
        },
        on_match_next: "request_review",
        on_no_match_next: "log_escalation",
      },
      {
        id: "request_review",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          contact_id: "{{contactId}}",
          to: "{{from}}",
          body:
            "Thanks! Mind sharing on Google? https://desertcool.example.com/review",
        },
        next: null,
      },
      {
        id: "log_escalation",
        type: "emit_event",
        event: "hvac.satisfaction.escalation",
        data: {
          contactId: "{{contactId}}",
          rating: "{{rating_reply.parsed_rating}}",
          rawReply: "{{rating_reply.body}}",
          reason: "low_or_unparseable_rating",
        },
        next: null,
      },
      {
        id: "send_reminder",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          contact_id: "{{contactId}}",
          to: "{{from}}",
          body:
            "Hi {{firstName}}, just following up — how was your service yesterday? Reply 1-5 stars when you get a chance.",
        },
        next: null,
      },
    ],
  },
};
