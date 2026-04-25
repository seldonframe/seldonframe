// Desert Cool HVAC — heat-advisory-outreach archetype.
// SLICE 9 PR 2 C2 per scenario doc + audit §4.3.
//
// **Workspace-scoped per G-9-7** — NOT in global registry.
//
// Trigger: schedule (cron `0 5 * * *` America/Phoenix — 5am daily,
// before the heat builds + before customers start texting EMERGENCY).
//
// Steps:
//   1. external_state branch — GET NWS Phoenix forecast endpoint;
//      check tomorrow's max temp >= 110°F. timeout_behavior=
//      false_on_timeout (NWS down → assume normal day, end without
//      outreach; missed advisory > false-alarm cascade).
//      on_match → continue to vulnerability scan
//      on_no_match → END (normal-temperature day)
//   2. mcp_tool_call — list_vulnerable_customers (residential tier
//      AND (equipment_age_years > 12 OR last_service_at >365d ago OR
//      customer.tags includes "elderly" / "infant" / "medical-equip"))
//   3. branch — predicate: candidates.count > 0
//      on_no_match → END (vulnerability scan empty)
//   4. mcp_tool_call — send_heat_advisory_outreach (bulk SMS with
//      brand voice from DESERT_COOL_HVAC_COPY.heatAdvisory; offers
//      free pre-failure check)
//   5. write_state — log outreach to Soul (workspace.soul.outreach_log
//      .heat_advisory.<date>) for de-duplication on consecutive heat
//      advisory days
//
// Primitives exercised: schedule trigger, branch (external_state),
// mcp_tool_call (×2), branch (predicate), write_state. Composes
// SLICE 5 + SLICE 6 + SLICE 3 primitives in a 5-step flow.
//
// Edge cases handled at runtime (PR 2 integration tests):
//   - Weather API timeout → false_on_timeout → end (no outreach)
//   - Forecast under 110°F → branch end (normal day)
//   - Empty vulnerable list → branch end (no SMS)
//   - Twilio failure during cascade → workflow_event_log captures
//     sms.failed; subsequent customers in batch still receive
//     (per send_heat_advisory_outreach internal retry policy)
//   - Workspace test mode (per SLICE 8) → SMS routes to Twilio
//     sandbox; no real-customer reach during operator testing
//   - Repeat advisory days → write_state log enables future
//     dedup (post-launch enhancement; not in v1 archetype steps)

import type { Archetype } from "../../agents/archetypes/types";

export const heatAdvisoryArchetype: Archetype = {
  id: "hvac-heat-advisory-outreach",
  name: "Heat Advisory Proactive Outreach",
  description:
    "Daily 5am Phoenix forecast check. If 110°F+ predicted, scan vulnerable residential customers (old equipment, no recent service, flagged tags) and SMS cascade offering a free pre-failure check.",
  detailedDescription:
    "Fires daily at 5am America/Phoenix — before customers wake and before EMERGENCY-text traffic begins. Checks NWS forecast; if max temp >= 110°F, queries Soul for vulnerable customers (residential tier × old equipment OR overdue service OR elderly/infant/medical-equip tags). If any qualify, dispatches batched SMS with brand-voice copy + records outreach to Soul. Demonstrates SLICE 5 + SLICE 6 (external_state + predicate branches) + SLICE 3 (read/write_state) + Twilio dispatch composing across primitives. Quiet days end without sending; advisory days surface in /agents/runs.",
  requiresInstalled: ["crm", "sms", "hvac-equipment"],
  knownLimitations: [
    {
      summary: "Single weather endpoint; no multi-provider fallback.",
      detail:
        "v1 hardcodes the NWS Phoenix grid endpoint. If NWS is down, the external_state branch returns false on timeout — the archetype ends without outreach. Builders in other regions would author a sister archetype with a different endpoint + threshold. Multi-provider fallback (alternative weather APIs) is post-launch.",
    },
    {
      summary: "Vulnerability heuristic is hardcoded.",
      detail:
        "v1 flags customers as vulnerable when equipment is >12 years old OR no service in past year OR tagged elderly/infant/medical-equip. Per-workspace tuning of the heuristic (e.g., commercial properties with elderly residents) is post-launch; today builders edit this archetype directly.",
    },
    {
      summary: "No dedup across consecutive advisory days.",
      detail:
        "v1 logs outreach to workspace.soul.outreach_log.heat_advisory.<date> via write_state — but doesn't yet read it back to skip customers already contacted in the past 7 days. Three consecutive 110°F days would re-contact the same customer 3x. Dedup is a post-launch enhancement (small archetype edit + new read_state step).",
    },
    {
      summary: "Bulk SMS cascade is single-tool dispatch.",
      detail:
        "Like the pre-season campaign, send_heat_advisory_outreach handles the full batch in one tool call. For workspaces with hundreds of vulnerable customers, this could hit Twilio rate limits. Pagination is post-launch.",
    },
  ],
  placeholders: {},
  specTemplate: {
    id: "hvac-heat-advisory-outreach",
    name: "Heat Advisory Proactive Outreach",
    description:
      "Daily 5am Phoenix forecast check + vulnerable-customer outreach at 110°F+.",
    trigger: {
      type: "schedule",
      cron: "0 5 * * *",
      timezone: "America/Phoenix",
      catchup: "skip",
      concurrency: "skip",
    },
    variables: {
      orgId: "trigger.orgId",
      today: "trigger.fireTimeUtc",
    },
    steps: [
      {
        id: "check_heat_threshold",
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
          expected: 110,
          timeout_behavior: "false_on_timeout",
        },
        on_match_next: "scan_vulnerable",
        on_no_match_next: null,
      },
      {
        id: "scan_vulnerable",
        type: "mcp_tool_call",
        tool: "list_vulnerable_customers",
        args: {
          tier: "residential",
          equipment_age_threshold_years: 12,
          last_service_threshold_days: 365,
          tag_flags: ["elderly", "infant", "medical-equip"],
        },
        capture: "vulnerable",
        next: "check_any_vulnerable",
      },
      {
        id: "check_any_vulnerable",
        type: "branch",
        condition: {
          type: "predicate",
          predicate: { kind: "field_exists", field: "vulnerable.customers" },
        },
        on_match_next: "send_advisory",
        on_no_match_next: null,
      },
      {
        id: "send_advisory",
        type: "mcp_tool_call",
        tool: "send_heat_advisory_outreach",
        args: {
          customer_ids: "{{vulnerable.customers}}",
          message_template:
            "Heads up — 110°+ forecast tomorrow. Want a free AC check before it hits? Reply YES.",
        },
        capture: "outreach_result",
        next: "log_outreach",
      },
      {
        id: "log_outreach",
        type: "write_state",
        path: "workspace.soul.outreach_log.heat_advisory.{{today}}",
        value: {
          customers_contacted: "{{outreach_result.count}}",
          dispatched_at: "{{today}}",
        },
        next: null,
      },
    ],
  },
};
