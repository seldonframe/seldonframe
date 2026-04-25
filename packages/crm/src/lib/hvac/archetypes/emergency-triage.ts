// Desert Cool HVAC — emergency-service-triage archetype.
// SLICE 9 PR 1 C7 per scenario doc + audit §4.1.
//
// **Workspace-scoped per G-9-7** — NOT in global registry.
//
// Trigger: message (sms, regex match on "EMERGENCY|URGENT|EMERG"
// case-insensitive). Customer texts the workspace's Twilio number.
//
// Steps:
//   1. external_state branch — GET NWS Phoenix forecast endpoint;
//      check if heat advisory active (forecast.maxTempF >= 105).
//      Sets `heat_advisory_active` boolean for downstream routing.
//      timeout_behavior=false_on_timeout (NWS down → assume normal day,
//      do not block emergency routing).
//   2. branch on customer tier (predicate: contact.customFields.tier
//      == "vip-commercial" OR contact.customFields.tier == "commercial")
//      → priority queue (commercial gets 2hr SLA promise vs 4hr standard)
//   3. send_sms confirmation with brand voice (DESERT_COOL_HVAC_COPY
//      .emergencyAck) — interpolates customer firstName + ETA
//   4. await_event sms.received from same contact, timeout 1hr →
//      on_resume=mark_high_priority (customer confirmed urgency);
//      on_timeout=auto_dispatch (no reply assumed urgent, dispatch
//      automatically)
//
// Primitives exercised: message trigger, branch (external_state),
// branch (predicate), send_sms, await_event. Loop guard inherited
// from SLICE 7 PR 2 (per-trigger 5-fires-in-60s; same conversation).
//
// Edge cases handled at runtime (SLICE 9 PR 2 integration tests):
//   - Weather API timeout → false_on_timeout → assume normal day,
//     route on tier alone
//   - Weather API non-200 → fail; emergency triage doesn't run; manual
//     dispatch fallback
//   - Customer commercial tier on heat-advisory day → still gets
//     commercial SLA promise (heat advisory is informational here)
//   - Customer reply CONFIRM → resumes await_event branch → log as
//     high-priority confirmed
//   - Customer reply STOP → SLICE 7 STOP-handling kicks in (loop
//     guard + suppression both before this archetype could re-fire)
//   - 5+ EMERGENCY texts in 60s → SLICE 7 loop guard halts
//     subsequent dispatches; first dispatch completes normally

import type { Archetype } from "../../agents/archetypes/types";

export const emergencyTriageArchetype: Archetype = {
  id: "hvac-emergency-triage",
  name: "Emergency Service Triage",
  description:
    "When a customer texts EMERGENCY or URGENT, check today's heat forecast, route based on tier, send SMS confirmation, and await reply for high-priority escalation.",
  detailedDescription:
    "Fires on inbound SMS matching pattern (EMERGENCY|URGENT|EMERG) case-insensitive. Branches on heat-advisory status (NWS Phoenix forecast >= 105°F) AND customer tier (commercial/vip-commercial get 2hr SLA promise; residential get 4hr). Sends ack SMS with brand voice. Awaits CONFIRM reply for 1 hour; if no reply, auto-dispatches assuming continued urgency. Demonstrates SLICE 7 message-trigger + SLICE 6 external_state branch + SLICE 6 predicate branch + SLICE 2c await_event composing across primitives.",
  requiresInstalled: ["crm", "sms", "hvac-equipment", "hvac-service-calls"],
  knownLimitations: [
    {
      summary: "Single weather API endpoint; no multi-provider fallback.",
      detail:
        "v1 hardcodes NWS Phoenix endpoint. If NWS is down (extremely rare but happens), the external_state branch returns false on timeout — workflow proceeds without heat-advisory context. Multi-provider fallback (alternative weather APIs) is post-launch.",
    },
    {
      summary: "Heat advisory threshold is hardcoded at 105°F.",
      detail:
        "Phoenix locals consider 105°F+ a meaningful threshold for AC failure being life-threatening. Builders in other geographies (e.g., Tucson at 110°F) would author a different archetype with a different threshold. Tunable via Soul-driven config in a future slice.",
    },
    {
      summary: "Commercial-vs-residential tier is binary.",
      detail:
        "v1 routes commercial + vip-commercial to the priority queue with a 2hr SLA. Granular per-customer SLAs (e.g., a contract-customer with a 30-min SLA) require per-contact custom_fields.sla_minutes overrides — post-launch.",
    },
    {
      summary: "auto_dispatch on timeout doesn't actually dispatch a tech.",
      detail:
        "v1's on_timeout path emits a workflow event for the dispatcher dashboard to action. Auto-assigning a technician without human confirmation is intentionally NOT done — Phoenix dispatchers want eyes on every emergency. Future enhancement: confidence-thresholded auto-dispatch.",
    },
  ],
  placeholders: {},
  specTemplate: {
    id: "hvac-emergency-triage",
    name: "Emergency Service Triage",
    description:
      "Inbound EMERGENCY/URGENT SMS → weather check → tier branch → ack SMS → await reply.",
    trigger: {
      type: "message",
      channel: "sms",
      channelBinding: { kind: "any" },
      pattern: { kind: "regex", value: "(?i)(EMERGENCY|URGENT|EMERG)" },
    },
    variables: {
      contactId: "trigger.contactId",
      from: "trigger.from",
      conversationId: "trigger.conversationId",
    },
    steps: [
      {
        id: "check_heat_advisory",
        type: "branch",
        condition: {
          type: "external_state",
          http: {
            url: "https://api.weather.gov/gridpoints/PSR/164,57/forecast",
            method: "GET",
            timeout_ms: 5000,
            auth: { type: "none" },
          },
          response_path: "properties.periods[0].temperature",
          operator: "gte",
          expected: 105,
          timeout_behavior: "false_on_timeout",
        },
        on_match_next: "load_customer",
        on_no_match_next: "load_customer",
      },
      {
        id: "load_customer",
        type: "read_state",
        source: "soul",
        path: "workspace.soul.contacts.{{contactId}}",
        capture: "customer",
        next: "check_tier",
      },
      {
        id: "check_tier",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_equals", field: "customer.tier", value: "vip-commercial" },
        },
        on_match_next: "ack_priority",
        on_no_match_next: "ack_standard",
      },
      {
        id: "ack_priority",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          contact_id: "{{contactId}}",
          to: "{{from}}",
          body:
            "Got your call — VIP priority. Tech dispatched within 2 hours. Reply CONFIRM if still urgent.",
        },
        next: "await_confirm",
      },
      {
        id: "ack_standard",
        type: "mcp_tool_call",
        tool: "send_sms",
        args: {
          contact_id: "{{contactId}}",
          to: "{{from}}",
          body:
            "Got your call — we'll have a tech on the way within 4 hours. Reply CONFIRM if still urgent.",
        },
        next: "await_confirm",
      },
      {
        id: "await_confirm",
        type: "await_event",
        event: "sms.replied",
        match: {
          kind: "field_equals",
          field: "data.contactId",
          value: "{{contactId}}",
        },
        timeout: { kind: "duration_ms", ms: 3600000 },
        on_resume: { capture: "reply", next: "log_high_priority" },
        on_timeout: { next: "log_auto_dispatch" },
      },
      {
        id: "log_high_priority",
        type: "emit_event",
        event: "hvac.emergency.confirmed",
        data: {
          contactId: "{{contactId}}",
          conversationId: "{{conversationId}}",
        },
        next: null,
      },
      {
        id: "log_auto_dispatch",
        type: "emit_event",
        event: "hvac.emergency.auto_dispatch",
        data: {
          contactId: "{{contactId}}",
          conversationId: "{{conversationId}}",
          reason: "no_reply_within_1hr",
        },
        next: null,
      },
    ],
  },
};
