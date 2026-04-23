// Scenario artifacts for the SLICE 3 synthesis comparison harness.
// Each scenario pairs a natural-language intent with two hand-crafted
// AgentSpec outputs: one baseline (mcp_tool_call-only) and one
// candidate (using the new state-access step types).
//
// Per L-17 artifact category: each scenario is ~20-40 LOC of data,
// counted as artifact — not unit-test LOC.
//
// Diversity axes (§9.1):
//   state-access pattern: read-only / write-only / read-then-write /
//                         emit-without-state
//   step count:          small / medium / large
//   event emission:       zero / one / multi
//
// 10 scenarios cover the Cartesian corners + middle per audit §9.1.

import type { AgentSpec } from "../../../../src/lib/agents/validator";

export type StateAccessPattern =
  | "read-only"
  | "write-only"
  | "read-then-write"
  | "emit-without-state"
  | "combined";

export type SizeBucket = "small" | "medium" | "large";
export type EventCount = "zero" | "one" | "multi";

export type ComparisonScenario = {
  id: string;
  description: string;
  nlIntent: string;
  stateAccessPatternExpected: StateAccessPattern;
  sizeBucket: SizeBucket;
  eventCount: EventCount;
  /** Baseline spec: only mcp_tool_call available. */
  baseline: AgentSpec;
  /** Candidate spec: may use read_state / write_state / emit_event. */
  candidate: AgentSpec;
};

const onboardingVars = {} as const;
const scoresVars = {} as const;

// ---------------------------------------------------------------------
// Helpers — spec builders. Keep concise; each scenario composes them.
// ---------------------------------------------------------------------

function baseSpec(name: string, steps: AgentSpec["steps"]): AgentSpec {
  return {
    name,
    description: `Baseline/candidate spec for "${name}"`,
    trigger: { type: "event", event: "contact.created" },
    steps,
  } as AgentSpec;
}

// ---------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------

export const SCENARIOS: ComparisonScenario[] = [
  {
    id: "01-read-only-small-zero",
    description: "Small spec that reads the contact's Soul stage and advances.",
    nlIntent: "When a contact is created, read their current onboarding stage.",
    stateAccessPatternExpected: "read-only",
    sizeBucket: "small",
    eventCount: "zero",
    baseline: baseSpec("read-only-small", [
      {
        id: "read_stage",
        type: "mcp_tool_call",
        tool: "read_soul_stage",
        args: {},
        next: null,
      },
    ]),
    candidate: baseSpec("read-only-small", [
      {
        id: "read_stage",
        type: "read_state",
        source: "soul",
        path: "workspace.soul.onboardingStage",
        capture: "stage",
        next: null,
      },
    ]),
  },

  {
    id: "02-write-only-small-one",
    description: "Small spec that writes a stage then emits via a tool.",
    nlIntent: "When a contact is created, mark them as 'qualified'.",
    stateAccessPatternExpected: "write-only",
    sizeBucket: "small",
    eventCount: "one",
    baseline: baseSpec("write-only-small", [
      {
        id: "write_stage",
        type: "mcp_tool_call",
        tool: "set_soul_field",
        args: { path: "onboardingStage", value: "qualified" },
        next: "notify",
      },
      {
        id: "notify",
        type: "mcp_tool_call",
        tool: "emit_notification",
        args: { event: "stage.changed", stage: "qualified" },
        next: null,
      },
    ]),
    candidate: baseSpec("write-only-small", [
      {
        id: "write_stage",
        type: "write_state",
        path: "workspace.soul.onboardingStage",
        value: "qualified",
        next: "notify",
      },
      {
        id: "notify",
        type: "emit_event",
        event: "contact.updated",
        data: { contactId: "{{trigger.contactId}}" },
        next: null,
      },
    ]),
  },

  {
    id: "03-read-then-write-medium-zero",
    description: "Read a contact's current stage, branch via conversation, write back.",
    nlIntent: "Load the stage, send a nudge, write a new stage.",
    stateAccessPatternExpected: "read-then-write",
    sizeBucket: "medium",
    eventCount: "zero",
    baseline: baseSpec("read-then-write-medium", [
      { id: "r", type: "mcp_tool_call", tool: "read_soul_stage", args: {}, next: "w1" },
      { id: "w1", type: "mcp_tool_call", tool: "set_soul_field", args: { path: "stage", value: "contacted" }, next: "w2" },
      { id: "w2", type: "mcp_tool_call", tool: "create_activity", args: { type: "stage-change" }, next: "w3" },
      { id: "w3", type: "mcp_tool_call", tool: "send_email", args: { to: "contact", subject: "Update" }, next: "w4" },
      { id: "w4", type: "mcp_tool_call", tool: "set_soul_field", args: { path: "lastContact", value: "now" }, next: null },
    ]),
    candidate: baseSpec("read-then-write-medium", [
      { id: "r", type: "read_state", source: "soul", path: "workspace.soul.onboardingStage", capture: "currentStage", next: "w1" },
      { id: "w1", type: "write_state", path: "workspace.soul.onboardingStage", value: "contacted", next: "w2" },
      { id: "w2", type: "mcp_tool_call", tool: "create_activity", args: { type: "stage-change" }, next: "w3" },
      { id: "w3", type: "mcp_tool_call", tool: "send_email", args: { to: "contact", subject: "Update" }, next: "w4" },
      { id: "w4", type: "write_state", path: "workspace.soul.lastContactAt", value: "{{trigger.contactId}}", next: null },
    ]),
  },

  {
    id: "04-emit-only-small-one",
    description: "Emit a single event without touching state.",
    nlIntent: "When a contact is created, fire a lead.qualified event.",
    stateAccessPatternExpected: "emit-without-state",
    sizeBucket: "small",
    eventCount: "one",
    baseline: baseSpec("emit-only-small", [
      {
        id: "emit",
        type: "mcp_tool_call",
        tool: "emit_lead_qualified",
        args: { contactId: "{{trigger.contactId}}" },
        next: null,
      },
    ]),
    candidate: baseSpec("emit-only-small", [
      {
        id: "emit",
        type: "emit_event",
        event: "contact.updated",
        data: { contactId: "{{trigger.contactId}}" },
        next: null,
      },
    ]),
  },

  {
    id: "05-read-only-medium-one",
    description: "Medium spec reading a value mid-flow then emitting downstream.",
    nlIntent: "Read onboarding stage, send email, emit an event.",
    stateAccessPatternExpected: "read-only",
    sizeBucket: "medium",
    eventCount: "one",
    baseline: baseSpec("read-only-medium", [
      { id: "r", type: "mcp_tool_call", tool: "read_soul_stage", args: {}, next: "s1" },
      { id: "s1", type: "mcp_tool_call", tool: "send_email", args: {}, next: "s2" },
      { id: "s2", type: "mcp_tool_call", tool: "send_sms", args: {}, next: "emit" },
      { id: "emit", type: "mcp_tool_call", tool: "emit_notify", args: {}, next: null },
    ]),
    candidate: baseSpec("read-only-medium", [
      { id: "r", type: "read_state", source: "soul", path: "workspace.soul.onboardingStage", capture: "stage", next: "s1" },
      { id: "s1", type: "mcp_tool_call", tool: "send_email", args: {}, next: "s2" },
      { id: "s2", type: "mcp_tool_call", tool: "send_sms", args: {}, next: "emit" },
      { id: "emit", type: "emit_event", event: "contact.updated", data: { contactId: "{{trigger.contactId}}" }, next: null },
    ]),
  },

  {
    id: "06-write-only-medium-multi",
    description: "Multiple state writes + multiple events fired.",
    nlIntent: "Update multiple Soul fields and notify listeners.",
    stateAccessPatternExpected: "write-only",
    sizeBucket: "medium",
    eventCount: "multi",
    baseline: baseSpec("write-only-medium-multi", [
      { id: "w1", type: "mcp_tool_call", tool: "set_soul_field", args: { path: "stage" }, next: "w2" },
      { id: "w2", type: "mcp_tool_call", tool: "set_soul_field", args: { path: "score" }, next: "e1" },
      { id: "e1", type: "mcp_tool_call", tool: "emit_stage_change", args: {}, next: "e2" },
      { id: "e2", type: "mcp_tool_call", tool: "emit_score_change", args: {}, next: "e3" },
      { id: "e3", type: "mcp_tool_call", tool: "emit_contact_updated", args: {}, next: null },
    ]),
    candidate: baseSpec("write-only-medium-multi", [
      { id: "w1", type: "write_state", path: "workspace.soul.onboardingStage", value: "qualified", next: "w2" },
      { id: "w2", type: "write_state", path: "workspace.soul.leadScore", value: "{{trigger.score}}", next: "e1" },
      { id: "e1", type: "emit_event", event: "contact.updated", data: { contactId: "{{trigger.contactId}}" }, next: "e2" },
      { id: "e2", type: "emit_event", event: "deal.stage_changed", data: { dealId: "d", from: "new", to: "qualified" }, next: "e3" },
      { id: "e3", type: "emit_event", event: "contact.created", data: { contactId: "{{trigger.contactId}}" }, next: null },
    ]),
  },

  {
    id: "07-read-then-write-large-one",
    description: "Large 12-step flow reading + writing + tool calls + emit.",
    nlIntent: "Read stage, conditionally call tools, then persist the new stage + emit.",
    stateAccessPatternExpected: "read-then-write",
    sizeBucket: "large",
    eventCount: "one",
    baseline: baseSpec("read-then-write-large", largeBaseline()),
    candidate: baseSpec("read-then-write-large", largeCandidate()),
  },

  {
    id: "08-emit-without-state-medium-multi",
    description: "Pure notification fan-out: call a tool, emit several events.",
    nlIntent: "Notify multiple downstream handlers via events.",
    stateAccessPatternExpected: "emit-without-state",
    sizeBucket: "medium",
    eventCount: "multi",
    baseline: baseSpec("emit-without-state-medium", [
      { id: "t", type: "mcp_tool_call", tool: "send_email", args: {}, next: "e1" },
      { id: "e1", type: "mcp_tool_call", tool: "emit_signal_a", args: {}, next: "e2" },
      { id: "e2", type: "mcp_tool_call", tool: "emit_signal_b", args: {}, next: "e3" },
      { id: "e3", type: "mcp_tool_call", tool: "emit_signal_c", args: {}, next: null },
    ]),
    candidate: baseSpec("emit-without-state-medium", [
      { id: "t", type: "mcp_tool_call", tool: "send_email", args: {}, next: "e1" },
      { id: "e1", type: "emit_event", event: "contact.updated", data: { contactId: "c" }, next: "e2" },
      { id: "e2", type: "emit_event", event: "contact.created", data: { contactId: "c" }, next: "e3" },
      { id: "e3", type: "emit_event", event: "deal.stage_changed", data: { dealId: "d", from: "a", to: "b" }, next: null },
    ]),
  },

  {
    id: "09-read-then-write-small-multi",
    description: "Small read-write-emit flow.",
    nlIntent: "Read a field, write a new value, emit multiple events.",
    stateAccessPatternExpected: "read-then-write",
    sizeBucket: "small",
    eventCount: "multi",
    baseline: baseSpec("read-then-write-small-multi", [
      { id: "r", type: "mcp_tool_call", tool: "read_soul_stage", args: {}, next: "w" },
      { id: "w", type: "mcp_tool_call", tool: "set_soul_field", args: { path: "stage" }, next: "e1" },
      { id: "e1", type: "mcp_tool_call", tool: "emit_signal_a", args: {}, next: "e2" },
      { id: "e2", type: "mcp_tool_call", tool: "emit_signal_b", args: {}, next: null },
    ]),
    candidate: baseSpec("read-then-write-small-multi", [
      { id: "r", type: "read_state", source: "soul", path: "workspace.soul.onboardingStage", capture: "stage", next: "w" },
      { id: "w", type: "write_state", path: "workspace.soul.onboardingStage", value: "qualified", next: "e1" },
      { id: "e1", type: "emit_event", event: "contact.updated", data: { contactId: "c" }, next: "e2" },
      { id: "e2", type: "emit_event", event: "contact.created", data: { contactId: "c" }, next: null },
    ]),
  },

  {
    id: "10-combined-large-multi",
    description: "Combined read + write + emit across a large flow.",
    nlIntent: "Read multiple fields, compute, write multiple fields, emit multiple events, chain tools.",
    stateAccessPatternExpected: "combined",
    sizeBucket: "large",
    eventCount: "multi",
    baseline: baseSpec("combined-large", combinedBaseline()),
    candidate: baseSpec("combined-large", combinedCandidate()),
  },
];

// ---------------------------------------------------------------------
// Large-scenario builders — kept separate so §10 / §07 stay readable.
// ---------------------------------------------------------------------

function largeBaseline(): AgentSpec["steps"] {
  return [
    { id: "r", type: "mcp_tool_call", tool: "read_soul_stage", args: {}, next: "s1" },
    { id: "s1", type: "mcp_tool_call", tool: "send_email", args: {}, next: "s2" },
    { id: "s2", type: "mcp_tool_call", tool: "send_sms", args: {}, next: "s3" },
    { id: "s3", type: "mcp_tool_call", tool: "create_activity", args: {}, next: "s4" },
    { id: "s4", type: "wait", seconds: 60, next: "s5" },
    { id: "s5", type: "mcp_tool_call", tool: "create_activity", args: {}, next: "s6" },
    { id: "s6", type: "mcp_tool_call", tool: "set_soul_field", args: { path: "stage" }, next: "s7" },
    { id: "s7", type: "mcp_tool_call", tool: "send_email", args: {}, next: "s8" },
    { id: "s8", type: "mcp_tool_call", tool: "set_soul_field", args: { path: "lastContact" }, next: "s9" },
    { id: "s9", type: "mcp_tool_call", tool: "emit_stage_change", args: {}, next: "s10" },
    { id: "s10", type: "wait", seconds: 300, next: "s11" },
    { id: "s11", type: "mcp_tool_call", tool: "create_activity", args: {}, next: null },
  ];
}

function largeCandidate(): AgentSpec["steps"] {
  return [
    { id: "r", type: "read_state", source: "soul", path: "workspace.soul.onboardingStage", capture: "stage", next: "s1" },
    { id: "s1", type: "mcp_tool_call", tool: "send_email", args: {}, next: "s2" },
    { id: "s2", type: "mcp_tool_call", tool: "send_sms", args: {}, next: "s3" },
    { id: "s3", type: "mcp_tool_call", tool: "create_activity", args: {}, next: "s4" },
    { id: "s4", type: "wait", seconds: 60, next: "s5" },
    { id: "s5", type: "mcp_tool_call", tool: "create_activity", args: {}, next: "s6" },
    { id: "s6", type: "write_state", path: "workspace.soul.onboardingStage", value: "contacted", next: "s7" },
    { id: "s7", type: "mcp_tool_call", tool: "send_email", args: {}, next: "s8" },
    { id: "s8", type: "write_state", path: "workspace.soul.lastContactAt", value: "{{now}}", next: "s9" },
    { id: "s9", type: "emit_event", event: "contact.updated", data: { contactId: "{{trigger.contactId}}" }, next: "s10" },
    { id: "s10", type: "wait", seconds: 300, next: "s11" },
    { id: "s11", type: "mcp_tool_call", tool: "create_activity", args: {}, next: null },
  ];
}

function combinedBaseline(): AgentSpec["steps"] {
  return [
    { id: "r1", type: "mcp_tool_call", tool: "read_soul_stage", args: {}, next: "r2" },
    { id: "r2", type: "mcp_tool_call", tool: "read_soul_score", args: {}, next: "w1" },
    { id: "w1", type: "mcp_tool_call", tool: "set_soul_field", args: { path: "stage" }, next: "w2" },
    { id: "w2", type: "mcp_tool_call", tool: "set_soul_field", args: { path: "score" }, next: "t1" },
    { id: "t1", type: "mcp_tool_call", tool: "send_email", args: {}, next: "e1" },
    { id: "e1", type: "mcp_tool_call", tool: "emit_stage_change", args: {}, next: "e2" },
    { id: "e2", type: "mcp_tool_call", tool: "emit_score_change", args: {}, next: "e3" },
    { id: "e3", type: "mcp_tool_call", tool: "emit_contact_updated", args: {}, next: null },
  ];
}

function combinedCandidate(): AgentSpec["steps"] {
  return [
    { id: "r1", type: "read_state", source: "soul", path: "workspace.soul.onboardingStage", capture: "stage", next: "r2" },
    { id: "r2", type: "read_state", source: "soul", path: "workspace.soul.leadScore", capture: "score", next: "w1" },
    { id: "w1", type: "write_state", path: "workspace.soul.onboardingStage", value: "qualified", next: "w2" },
    { id: "w2", type: "write_state", path: "workspace.soul.leadScore", value: "100", next: "t1" },
    { id: "t1", type: "mcp_tool_call", tool: "send_email", args: {}, next: "e1" },
    { id: "e1", type: "emit_event", event: "deal.stage_changed", data: { dealId: "d", from: "new", to: "qualified" }, next: "e2" },
    { id: "e2", type: "emit_event", event: "contact.updated", data: { contactId: "{{trigger.contactId}}" }, next: "e3" },
    { id: "e3", type: "emit_event", event: "contact.created", data: { contactId: "{{trigger.contactId}}" }, next: null },
  ];
}
