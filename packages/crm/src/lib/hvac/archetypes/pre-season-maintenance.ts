// Desert Cool HVAC — pre-season-maintenance archetype.
// SLICE 9 PR 1 C6 per scenario doc + audit §4.2.
//
// **Workspace-scoped per G-9-7** — NOT registered in the global
// archetype registry (preserves the 6-archetype baseline for synthesis
// testing). Installed via the SLICE 9 hvac-arizona vertical pack
// (PR 2 ships the install path).
//
// Trigger: schedule (cron `0 6 * * *` America/Phoenix — 6am daily)
// Steps:
//   1. mcp_tool_call — list_due_customers (returns batched candidates
//      with last_service_at < now() - 6 months AND tier != commercial)
//   2. branch — predicate: candidates.count > 0
//      on_match → continue to step 3
//      on_no_match → END (no SMS sent; quiet day)
//   3. mcp_tool_call — send_pre_season_outreach (bulk-sends SMS via
//      Twilio with personalized {{firstName}} + brand-voice copy from
//      DESERT_COOL_HVAC_COPY.preSeasonInvite)
//
// Primitives exercised: schedule trigger, mcp_tool_call (×2), branch
// (predicate, internal). Demonstrates a quiet-day no-op + active-day
// dispatch path.
//
// Edge cases handled at runtime (see SLICE 9 PR 2 integration tests):
//   - Empty due-customer list → branch's no_match path → end (no SMS)
//   - send_pre_season_outreach Twilio failure → workflow_event_log
//     captures sms.failed event → manual triage by dispatcher
//   - Workspace test mode (per SLICE 8) → SMS routes to Twilio test
//     creds; no real-customer contact

import type { Archetype } from "../../agents/archetypes/types";

export const preSeasonMaintenanceArchetype: Archetype = {
  id: "hvac-pre-season-maintenance",
  name: "Pre-Season Maintenance Campaign",
  description:
    "Every morning at 6am Phoenix time, scan customers due for maintenance and batch SMS the residential ones with a tune-up offer.",
  detailedDescription:
    "Fires daily at 6am America/Phoenix. Calls list_due_customers (residential tier, last service > 6 months ago). If any are due, calls send_pre_season_outreach which dispatches personalized SMS to each. Quiet days (no due customers) end without sending. Demonstrates SLICE 5 schedule-trigger primitive composing with hvac-equipment block's customer-querying tools + Twilio SMS dispatch.",
  requiresInstalled: ["crm", "sms", "hvac-equipment"],
  knownLimitations: [
    {
      summary: "Sends to all due residential customers in a single batch.",
      detail:
        "v1 dispatches the full SMS batch in a single tool call. For workspaces with thousands of due customers, this could hit Twilio rate limits. Production fix is a paginated batch tool — workspace-specific tuning post-launch.",
    },
    {
      summary: "Doesn't deduplicate against recent outreach.",
      detail:
        "If a customer was contacted via this archetype yesterday and is still 'due' (their last_service_at hasn't changed), they'll be contacted again today. The send tool's suppression layer catches STOP-keyword opt-outs but not soft-frequency-cap.",
    },
    {
      summary: "Commercial customers are excluded by design.",
      detail:
        "Commercial accounts have explicit service contracts; outreach via this archetype would feel automated/spammy. The list_due_customers tool filters tier != commercial.",
    },
  ],
  placeholders: {},
  specTemplate: {
    id: "hvac-pre-season-maintenance",
    name: "Pre-Season Maintenance Campaign",
    description:
      "Daily 6am Phoenix scan + batched SMS outreach for residential customers due for AC tune-up.",
    trigger: {
      type: "schedule",
      cron: "0 6 * * *",
      timezone: "America/Phoenix",
      catchup: "skip",
      concurrency: "skip",
    },
    variables: {
      orgId: "trigger.orgId",
    },
    steps: [
      {
        id: "scan_due_customers",
        type: "mcp_tool_call",
        tool: "list_due_customers",
        args: {
          tier: "residential",
          last_service_threshold_days: 180,
        },
        capture: "due",
        next: "check_any_due",
      },
      {
        id: "check_any_due",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "due.customers" },
        },
        on_match_next: "send_outreach",
        on_no_match_next: null,
      },
      {
        id: "send_outreach",
        type: "mcp_tool_call",
        tool: "send_pre_season_outreach",
        args: {
          customer_ids: "{{due.customers}}",
          message_template:
            "Hi {{firstName}}, it's been over 6 months since your last AC service. Phoenix summer's coming — want to schedule a tune-up? Reply YES.",
        },
        next: null,
      },
    ],
  },
};
