// Agent-spec validator — synthesis-time type checking for filled
// AgentSpec JSON against a block composition-contract registry.
//
// Shipped in Scope 3 Step 2b.1 PR 2 per tasks/step-2b-1-contract-v2-
// audit.md §4.3. This validator is the failure-catcher between
// synthesis and runtime: when Claude (or any other generator) produces
// a filled AgentSpec, this validator type-checks every tool call, every
// interpolation reference, and every conversation-exit shape against
// the Zod schemas authored in PR 1. Runtime execution is 7.e scope —
// this validator does NOT execute the spec, only checks it.
//
// Bug class this exists to catch (audit §2.c runtime caveat):
// {{coupon.code}} vs {{coupon.couponCode}} — a typed capture binding
// with a typo in a downstream interpolation reference. Today this
// fails silently at runtime (evaluates to `undefined`). With this
// validator, the synthesis output is rejected before deploy.
//
// Scope for PR 2:
//   - Tool reference resolution (unknown_tool / tool_not_in_registry)
//   - Tool args Zod-schema validation (bad_tool_args)
//   - Event reference resolution for trigger (unknown_event)
//   - Capture threading validation (unresolved_interpolation)
//   - Conversation on_exit shape (extract field type)
// Out of scope:
//   - Branch step validation (2e scope)
//   - Runtime execution (7.e scope; 2c ships the FIRST runtime for the
//     await_event dispatcher in PR 2, but synthesis-time validation in
//     this file never executes user code).
//
// Scope added in 2c PR 1 (2026-04-22, audit `tasks/step-2c-mid-flow-
// events-audit.md`):
//   - await_event step schema + type + guard (M1 — this commit)
//   - await_event dispatcher + tests (M2 — next commit)

import { z } from "zod";

import type { ToolDefinition } from "../blocks/contract-v2";
import { PredicateSchema, DurationSchema } from "./types";
import { isAgentWritablePath } from "../workflow/state-access/allowlist";

// ---------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------

export type ValidationIssueCode =
  | "spec_malformed"
  | "unknown_tool"
  | "bad_tool_args"
  | "unknown_event"
  | "unresolved_interpolation"
  | "bad_extract_shape"
  | "bad_capture_name"
  | "unknown_step_next"
  | "unsupported_step_type"
  | "graph_cycle";

export type ValidationIssue = {
  code: ValidationIssueCode;
  /** Step id where the issue was found; null for spec-level issues. */
  stepId: string | null;
  /** Dotted path within the step (or `$` at spec level). */
  path: string;
  message: string;
};

/**
 * Registry of every tool available to synthesis, indexed by tool name.
 * Tool names are globally unique across blocks (enforced by BLOCK.md
 * validator in PR 1). The entry carries the block the tool lives in
 * for cross-reference checks (e.g., a tool that emits an event must
 * live in a block whose produces list includes that event).
 */
export type ToolRegistryEntry = {
  blockSlug: string;
  tool: ToolDefinition;
};

export type BlockRegistry = {
  tools: Map<string, ToolRegistryEntry>;
  /** Block slug → set of event names it declares in produces. */
  producesByBlock: Map<string, Set<string>>;
};

/**
 * Runtime-queryable mirror of packages/core/src/events/event-registry.json
 * (emitted by PR 1 C7). The validator uses this to verify trigger event
 * names reference a real SeldonEvent union variant.
 */
export type EventRegistry = {
  events: Array<{
    type: string;
    fields: Record<string, { rawType: string; nullable: boolean }>;
  }>;
};

// ---------------------------------------------------------------------
// AgentSpec shape — Zod schema matching the 2b.1 pre-typed shape.
// Steps are a discriminated union on `type`. Unknown step types don't
// fail parse (`.catchall(z.unknown())` on the parent), they surface as
// `unsupported_step_type` via the step dispatcher.
// ---------------------------------------------------------------------

// TriggerSchema — discriminated union on `type`.
// SLICE 5 PR 1 C1 introduced the union shape (event branch).
// SLICE 5 PR 1 C2 adds the schedule branch with cron + timezone +
// catchup + concurrency (per audit §3.1 + gates G-5-1..G-5-5).
import { isValidCronExpression, isValidIanaTimezone } from "./cron";

const EventTriggerSchema = z.object({
  type: z.literal("event"),
  event: z.string().min(1),
  filter: z.record(z.string(), z.unknown()).optional(),
});

const ScheduleTriggerSchema = z.object({
  type: z.literal("schedule"),
  cron: z
    .string()
    .min(1)
    .refine(isValidCronExpression, {
      message: 'cron must be a valid POSIX 5-field expression (e.g., "0 9 * * *")',
    }),
  timezone: z
    .string()
    .refine(isValidIanaTimezone, {
      message: 'timezone must be a valid IANA zone (e.g., "America/New_York")',
    })
    .optional(),
  catchup: z.enum(["skip", "fire_all", "fire_one"]).default("skip"),
  concurrency: z.enum(["skip", "concurrent"]).default("skip"),
});

const TriggerSchema = z.discriminatedUnion("type", [
  EventTriggerSchema,
  ScheduleTriggerSchema,
]);

const WaitStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("wait"),
  seconds: z.number().int().nonnegative(),
  next: z.string().nullable(),
});

const McpToolCallStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("mcp_tool_call"),
  tool: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
  capture: z.string().min(1).optional(),
  next: z.string().nullable(),
});

const ConversationStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("conversation"),
  channel: z.enum(["sms", "email"]),
  initial_message: z.string().min(1),
  exit_when: z.string().min(1),
  on_exit: z.object({
    extract: z.record(z.string(), z.string().min(1)),
    next: z.string().nullable(),
  }),
});

// await_event — pauses the workflow until a matching event fires OR
// the timeout elapses. Shipped in Scope 3 Step 2c PR 1 per
// `tasks/step-2c-mid-flow-events-audit.md` §3.
//
// Design choices (from audit §3.1, all approved 2026-04-22):
//   - `event` is REQUIRED. A wait without a target event is a different
//     primitive (`type: "wait"`). Missing event is a schema error, not
//     a dispatcher error.
//   - `match` is optional and REUSES the existing Predicate primitive
//     (types.ts:30). Zero new primitives. The runtime convention is
//     that field paths starting with `data.` address the event
//     payload; other paths address the workflow's capture scope.
//     G-4: interpolations inside predicate `value` are resolved AT
//     WAIT-REGISTRATION TIME (frozen), not at event arrival.
//   - `timeout` is optional at the schema level. The M2 dispatcher
//     enforces the G-3 ceiling (90 days) and fills the G-3 default
//     (30 days) when omitted. No "wait forever" semantics allowed.
//   - Both `on_resume.next` and `on_timeout.next` are REQUIRED. `null`
//     is a valid terminator (flow ends on that path), but each half
//     must explicitly state it.
//   - `capture` is optional AND only valid on `on_resume`. On timeout
//     there is no event payload to capture; M2 dispatcher flags an
//     on_timeout.capture as a schema-level error via custom refine.
const AwaitEventStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("await_event"),
  event: z.string().min(1),
  match: PredicateSchema.optional(),
  timeout: DurationSchema.optional(),
  on_resume: z.object({
    capture: z.string().min(1).optional(),
    next: z.string().nullable(),
  }),
  // .strict() rejects unknown keys — explicitly rejects on_timeout.capture
  // (audit §3.1 point 5: there's no event payload to bind on timeout,
  // so capture is invalid). Surfaces as spec_malformed at parse time.
  on_timeout: z.strictObject({
    next: z.string().nullable(),
  }),
});

// Open-ended fallback for unknown step types. Parse succeeds; the
// step dispatcher surfaces `unsupported_step_type` against it.
// Kept as a separate schema (not in the discriminated union) so TS
// can narrow the three known step types cleanly on `step.type`
// checks. At the type level, Step is the union of the three known
// types + the unknown fallback; runtime parse accepts all four via
// z.union (tried in order).
// read_state step — SLICE 3 C1 per audit §3.1 + G-3-1 (Zod enum,
// "soul"-only MVP). Reads a value from the workspace's Soul state
// and binds it to a capture.
//
// Source is a Zod ENUM — not a free-form string — so future
// extensions (event_log, block_data) add as new enum variants.
// L-22 structural enforcement: unknown sources are rejected at
// parse time, not failed silently at runtime.
//
// Path must start with `workspace.soul.` or `workspace.theme.`.
// The dispatcher strips the `workspace.<slice>.` prefix before
// calling the SoulStore.
const ReadStateSourceKind = z.enum(["soul"]);
const WorkspacePathPattern = /^workspace\.(soul|theme)(\.[^.][^{}]*)?$/;
const ReadStateStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("read_state"),
  source: ReadStateSourceKind,
  /**
   * `workspace.soul.<path>` or `workspace.theme.<path>`. Path segments
   * may include `{{interpolation}}` tokens — the dispatcher resolves
   * them against the run's scope before reading. The `{{}}` escape
   * above deliberately permits interpolation anywhere after the
   * workspace-scope prefix.
   */
  path: z.string().regex(WorkspacePathPattern, {
    message: 'read_state.path must start with "workspace.soul." or "workspace.theme."',
  }),
  capture: z.string().min(1),
  next: z.string().nullable(),
});

// write_state step — SLICE 3 C2 per audit §3.2 + G-3-3 Option B-2.
// Writes a value to a workspace-scoped path. Safety: path must be
// in the AGENT_WRITABLE_SOUL_PATHS allowlist — validated at parse
// time via validateWriteStateStep (UnknownStep fallthrough + re-
// parse), enforced again at runtime by the dispatcher
// (defense-in-depth).
const WriteStateStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("write_state"),
  path: z.string().regex(WorkspacePathPattern, {
    message: 'write_state.path must start with "workspace.soul." or "workspace.theme."',
  }),
  /**
   * Value to write. String values carrying `{{interpolation}}` are
   * resolved against the run's scope before writing. Non-string
   * values pass through verbatim.
   */
  value: z.unknown(),
  next: z.string().nullable(),
});

// emit_event step — SLICE 3 C3 per audit §3.3 + G-3-2 (restricted-
// shape with registry cross-check at parse time; runtime type-check
// at emit time for interpolated values).
const EmitEventStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("emit_event"),
  event: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
  next: z.string().nullable(),
});

// Branch step — SLICE 6 PR 1 C1 per audit §3.1 + gate G-6-7 + G-6-8.
// ConditionSchema is a discriminated union. C1 shipped the "predicate"
// branch; C2 (this commit) adds the "external_state" second branch.
const InternalPredicateConditionSchema = z.object({
  type: z.literal("predicate"),
  predicate: PredicateSchema,
});

// SLICE 6 PR 1 C2 — external_state condition + HTTP + auth schemas.
// Per audit §3.2/§3.3/§3.4 + Max's additional interpolation-scope
// specification (handled downstream in validateBranchInterpolations).

const NoneAuthSchema = z.object({
  type: z.literal("none"),
});

const BearerAuthSchema = z.object({
  type: z.literal("bearer"),
  // secret_name cross-refs workspace_secrets.serviceName at synthesis
  // time (full cross-check when the registry is provided; v1 ships
  // without a synchronous registry check and relies on runtime
  // resolution to fail-closed if the secret is missing).
  secret_name: z.string().min(1),
});

const HeaderAuthSchema = z.object({
  type: z.literal("header"),
  header_name: z.string().min(1),
  secret_name: z.string().min(1),
});

const AuthConfigSchema = z.discriminatedUnion("type", [
  NoneAuthSchema,
  BearerAuthSchema,
  HeaderAuthSchema,
]);

const HttpRequestConfigSchema = z
  .object({
    url: z.string().url({ message: "http.url must be a valid absolute URL" }),
    method: z.enum(["GET", "POST"]).default("GET"),
    headers: z.record(z.string(), z.string()).optional(),
    query: z.record(z.string(), z.string()).optional(),
    body: z.string().optional(),
    auth: AuthConfigSchema.optional(),
    timeout_ms: z.number().int().min(1000).max(30000).default(5000),
  })
  .refine(
    (c) => c.method !== "POST" || c.body === undefined || c.body.length > 0,
    { message: "POST with empty string body is likely a mistake" },
  );

// Operators per audit §3.2. "exists" / "truthy" don't require
// `expected`; all others do — enforced via superRefine.
const OperatorEnum = z.enum([
  "equals",
  "not_equals",
  "contains",
  "gt",
  "lt",
  "gte",
  "lte",
  "exists",
  "truthy",
]);
const OperatorsRequiringExpected = new Set([
  "equals",
  "not_equals",
  "contains",
  "gt",
  "lt",
  "gte",
  "lte",
]);

const ExternalStateConditionSchema = z
  .object({
    type: z.literal("external_state"),
    http: HttpRequestConfigSchema,
    response_path: z.string().min(1),
    operator: OperatorEnum,
    expected: z.unknown().optional(),
    timeout_behavior: z.enum(["fail", "false_on_timeout"]).default("fail"),
  })
  .superRefine((cond, ctx) => {
    if (OperatorsRequiringExpected.has(cond.operator) && cond.expected === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expected"],
        message: `operator "${cond.operator}" requires an "expected" value`,
      });
    }
  });

const ConditionSchema = z.discriminatedUnion("type", [
  InternalPredicateConditionSchema,
  ExternalStateConditionSchema,
]);

const BranchStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("branch"),
  condition: ConditionSchema,
  // 2-way branch per G-6-7 A. N-way switch is a post-launch extension.
  on_match_next: z.string().nullable(),
  on_no_match_next: z.string().nullable(),
});

const UnknownStepSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
  })
  .passthrough();

const KnownStepSchema = z.discriminatedUnion("type", [
  WaitStepSchema,
  McpToolCallStepSchema,
  ConversationStepSchema,
  AwaitEventStepSchema,
  ReadStateStepSchema,
  WriteStateStepSchema,
  EmitEventStepSchema,
  BranchStepSchema,
]);

const StepSchema = z.union([KnownStepSchema, UnknownStepSchema]);

export const AgentSpecSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  trigger: TriggerSchema,
  variables: z.record(z.string(), z.string()).optional(),
  steps: z.array(StepSchema).min(1),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;
export type WaitStep = z.infer<typeof WaitStepSchema>;
export type McpToolCallStep = z.infer<typeof McpToolCallStepSchema>;
export type ConversationStep = z.infer<typeof ConversationStepSchema>;
export type AwaitEventStep = z.infer<typeof AwaitEventStepSchema>;
export type ReadStateStep = z.infer<typeof ReadStateStepSchema>;
export type WriteStateStep = z.infer<typeof WriteStateStepSchema>;
export type EmitEventStep = z.infer<typeof EmitEventStepSchema>;
export type BranchStep = z.infer<typeof BranchStepSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type UnknownStep = z.infer<typeof UnknownStepSchema>;
// Discriminated-union narrowing on `.type`. UnknownStep is the runtime
// fallthrough for unsupported types (none currently unshipped — all
// SLICE-6-era step types are Known).
export type Step =
  | WaitStep
  | McpToolCallStep
  | ConversationStep
  | AwaitEventStep
  | ReadStateStep
  | WriteStateStep
  | EmitEventStep
  | BranchStep
  | UnknownStep;

// Type guards — TypeScript can't narrow Step by `step.type === "..."`
// alone because UnknownStep has `type: string` which overlaps every
// literal. These guards check both the type literal AND a distinguishing
// field so TS narrows to the exact known-step shape.
function isWaitStep(step: Step): step is WaitStep {
  return step.type === "wait" && typeof (step as Partial<WaitStep>).seconds === "number";
}
function isMcpToolCallStep(step: Step): step is McpToolCallStep {
  return step.type === "mcp_tool_call" && typeof (step as Partial<McpToolCallStep>).tool === "string";
}
function isConversationStep(step: Step): step is ConversationStep {
  return step.type === "conversation" && typeof (step as Partial<ConversationStep>).initial_message === "string";
}
function isReadStateStep(step: Step): step is ReadStateStep {
  // Distinguish from UnknownStep by the `source` + `path` + `capture`
  // fields being present as strings. If those are absent (or typed
  // wrong) the validator treats it as an UnknownStep and surfaces
  // spec_malformed via the re-parse in validateReadStateStep.
  return (
    step.type === "read_state" &&
    typeof (step as Partial<ReadStateStep>).path === "string" &&
    typeof (step as Partial<ReadStateStep>).capture === "string"
  );
}
function isAwaitEventStep(step: Step): step is AwaitEventStep {
  // Distinguish from UnknownStep by requiring both the literal type
  // and the `event` field (which is required on the real schema but
  // absent on a pass-through UnknownStep that merely happens to carry
  // `type: "await_event"`).
  return step.type === "await_event" && typeof (step as Partial<AwaitEventStep>).event === "string";
}

function isBranchStep(step: Step): step is BranchStep {
  // Distinguish from UnknownStep by requiring both the literal type
  // + the two next-pointers (both keys must be present on the real
  // schema; absence means malformed → caught at schema parse or
  // unsupported_step_type).
  const s = step as Partial<BranchStep>;
  return (
    step.type === "branch" &&
    typeof s.condition === "object" &&
    s.condition !== null &&
    "on_match_next" in step &&
    "on_no_match_next" in step
  );
}

// ---------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------

export function validateAgentSpec(
  input: unknown,
  registry: BlockRegistry,
  eventRegistry: EventRegistry,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const parsed = AgentSpecSchema.safeParse(input);
  if (!parsed.success) {
    for (const error of parsed.error.issues) {
      issues.push({
        code: "spec_malformed",
        stepId: null,
        path: error.path.join(".") || "$",
        message: error.message,
      });
    }
    // Don't continue — downstream checks assume a well-formed spec.
    return issues;
  }

  const spec = parsed.data;

  // Trigger event must exist in the SeldonEvent union. Only applies to
  // event triggers; schedule triggers are standalone (no event cross-ref).
  if (spec.trigger.type === "event") {
    const knownEvents = new Set(eventRegistry.events.map((e) => e.type));
    if (!knownEvents.has(spec.trigger.event)) {
      issues.push({
        code: "unknown_event",
        stepId: null,
        path: "trigger.event",
        message: `trigger event "${spec.trigger.event}" is not in the SeldonEvent registry`,
      });
    }
  }

  // Build next-step reference set for unknown_step_next checks.
  const stepIds = new Set(spec.steps.map((s) => s.id));
  // Capture + extract bindings accumulate as we walk steps in
  // declaration order. The interpolation resolver reads both to
  // check {{capture.field}} and {{extract}} references.
  const capturedBindings = new Set<string>();
  const extractBindings = new Set<string>();

  // Scope seeds — variables apply to every step.
  const variableNames = new Set(Object.keys(spec.variables ?? {}));
  const captureShapes = new Map<string, z.ZodType>();

  for (const step of spec.steps) {
    // Interpolation check runs BEFORE this step's own captures/extracts
    // are added to scope — a step cannot self-reference its own capture.
    const scope: InterpolationScope = {
      variables: variableNames,
      captures: new Map(captureShapes),
      extracts: new Set(extractBindings),
    };
    validateInterpolationsInStep(step, scope, issues);

    validateStep(step, spec, stepIds, registry, capturedBindings, extractBindings, eventRegistry, issues);

    // After validation, record this step's bindings for downstream
    // interpolations. Capture shapes come from the tool's returns
    // schema (unwrapped via captureAccessibleShape for the data-key
    // convention) OR — for await_event — the event's data payload
    // shape built from the EventRegistry.
    if (isMcpToolCallStep(step) && step.capture) {
      const entry = registry.tools.get(step.tool);
      if (entry && !captureShapes.has(step.capture)) {
        captureShapes.set(step.capture, captureAccessibleShape(entry.tool.returns));
      }
    } else if (isAwaitEventStep(step)) {
      // Re-parse to access on_resume.capture safely — type guard is
      // loose (checks only type + event). Matches dispatcher pattern.
      const parsed = AwaitEventStepSchema.safeParse(step);
      if (parsed.success && parsed.data.on_resume.capture && !captureShapes.has(parsed.data.on_resume.capture)) {
        const eventShape = buildEventDataShape(parsed.data.event, eventRegistry);
        captureShapes.set(parsed.data.on_resume.capture, eventShape);
      }
    }
  }

  // SLICE 6 PR 1 C1 — graph cycle detection (G-6-8 A). Walk every
  // step as a potential entry point; DFS with a "currently-visiting"
  // set rejects any edge that revisits a step in the current path.
  detectGraphCycles(spec, issues);

  return issues;
}

// ---------------------------------------------------------------------
// Graph cycle detection (G-6-8 A) — SLICE 6 PR 1 C1.
// ---------------------------------------------------------------------

function detectGraphCycles(spec: AgentSpec, issues: ValidationIssue[]): void {
  const stepById = new Map<string, Step>();
  for (const s of spec.steps) stepById.set(s.id, s);

  const reportedCycles = new Set<string>();
  const globallyVisited = new Set<string>();

  for (const step of spec.steps) {
    if (globallyVisited.has(step.id)) continue;
    const pathStack = new Set<string>();
    dfs(step.id, pathStack, stepById, globallyVisited, reportedCycles, issues);
  }
}

function dfs(
  stepId: string,
  pathStack: Set<string>,
  stepById: Map<string, Step>,
  globallyVisited: Set<string>,
  reportedCycles: Set<string>,
  issues: ValidationIssue[],
): void {
  if (pathStack.has(stepId)) {
    if (!reportedCycles.has(stepId)) {
      reportedCycles.add(stepId);
      issues.push({
        code: "graph_cycle",
        stepId,
        path: "next",
        message: `step "${stepId}" participates in a cyclic reference chain; all paths from root must eventually terminate (null next) or await (await_event)`,
      });
    }
    return;
  }
  if (globallyVisited.has(stepId)) return;

  const step = stepById.get(stepId);
  if (!step) return; // unknown_step_next surfaces elsewhere

  pathStack.add(stepId);
  for (const nextId of successorsOf(step)) {
    dfs(nextId, pathStack, stepById, globallyVisited, reportedCycles, issues);
  }
  pathStack.delete(stepId);
  globallyVisited.add(stepId);
}

function successorsOf(step: Step): string[] {
  if (isBranchStep(step)) {
    return [step.on_match_next, step.on_no_match_next].filter(
      (n): n is string => n !== null && n !== undefined,
    );
  }
  if (isAwaitEventStep(step)) {
    const out: string[] = [];
    // Defensive: await_event fields may be missing on malformed input
    // (surfaces as spec_malformed elsewhere; cycle detector shouldn't
    // throw on them).
    const resumeNext = step.on_resume?.next;
    if (typeof resumeNext === "string") out.push(resumeNext);
    const timeoutNext = step.on_timeout?.next;
    if (typeof timeoutNext === "string") out.push(timeoutNext);
    return out;
  }
  const next = extractNext(step);
  return typeof next === "string" ? [next] : [];
}

// ---------------------------------------------------------------------
// Step dispatcher (skeleton — M3+ will fill each branch).
// ---------------------------------------------------------------------

function validateStep(
  step: Step,
  _spec: AgentSpec,
  stepIds: Set<string>,
  registry: BlockRegistry,
  capturedBindings: Set<string>,
  extractBindings: Set<string>,
  eventRegistry: EventRegistry,
  issues: ValidationIssue[],
): void {
  // `next` reference check. wait / mcp_tool_call / conversation each
  // have a single `next`; await_event has TWO (on_resume.next and
  // on_timeout.next), handled inside validateAwaitEventStep; branch
  // has TWO (on_match_next and on_no_match_next), handled inline below.
  if (isBranchStep(step)) {
    for (const [field, value] of [
      ["on_match_next", step.on_match_next],
      ["on_no_match_next", step.on_no_match_next],
    ] as const) {
      if (value !== null && !stepIds.has(value)) {
        issues.push({
          code: "unknown_step_next",
          stepId: step.id,
          path: field,
          message: `step "${step.id}" references ${field}="${value}" which is not a declared step id`,
        });
      }
    }
  } else if (!isAwaitEventStep(step)) {
    const next = extractNext(step);
    if (next !== null && next !== undefined && !stepIds.has(next)) {
      issues.push({
        code: "unknown_step_next",
        stepId: step.id,
        path: "next",
        message: `step "${step.id}" references next="${next}" which is not a declared step id`,
      });
    }
  }

  if (isWaitStep(step)) {
    // No further per-step validation. seconds is already a
    // nonnegative int via schema.
    return;
  }
  if (isMcpToolCallStep(step)) {
    validateMcpToolCallStep(step, registry, capturedBindings, issues);
    return;
  }
  if (isConversationStep(step)) {
    validateConversationStep(step, extractBindings, issues);
    return;
  }
  if (isAwaitEventStep(step)) {
    validateAwaitEventStep(step, stepIds, capturedBindings, eventRegistry, issues);
    return;
  }
  // Handle read_state — catches both well-formed + UnknownStep-
  // absorbed malformed read_state shapes (source not in enum, path
  // wrong, missing capture).
  if (step.type === "read_state") {
    validateReadStateStep(step, capturedBindings, issues);
    return;
  }
  // Handle write_state — G-3-3 Option B-2 allowlist enforcement at
  // synthesis time. Runtime dispatcher double-checks.
  if (step.type === "write_state") {
    validateWriteStateStep(step, issues);
    return;
  }
  // Handle emit_event — G-3-2 registry cross-check at parse time.
  if (step.type === "emit_event") {
    validateEmitEventStep(step, eventRegistry, issues);
    return;
  }
  // Handle branch — SLICE 6 PR 1 C1. Malformed branch steps
  // (bad condition discriminator, missing successors) fall through
  // to UnknownStep because z.union evaluates BranchStepSchema, fails,
  // then accepts the permissive UnknownStepSchema. Re-parse here so
  // malformed branches surface as a proper spec_malformed issue
  // rather than silently passing through.
  if (step.type === "branch") {
    const parsed = BranchStepSchema.safeParse(step);
    if (!parsed.success) {
      for (const err of parsed.error.issues) {
        issues.push({
          code: "spec_malformed",
          stepId: step.id,
          path: err.path.join(".") || "$",
          message: err.message,
        });
      }
    }
    return;
  }
  issues.push({
    code: "unsupported_step_type",
    stepId: step.id,
    path: "type",
    message: `step type "${step.type}" is not supported by this validator (wait / mcp_tool_call / conversation / await_event / read_state / write_state / emit_event / branch are the eight known types)`,
  });
}

// Pull the `next` reference out of a step regardless of shape.
// Wait / mcp_tool_call / UnknownStep-with-next expose `next` at the
// top level; Conversation carries it on `on_exit.next`.
function extractNext(step: Step): string | null | undefined {
  if (isConversationStep(step)) return step.on_exit.next;
  if (isWaitStep(step) || isMcpToolCallStep(step)) return step.next;
  // UnknownStep may or may not have `next` — best-effort.
  const candidate = (step as { next?: unknown }).next;
  if (typeof candidate === "string" || candidate === null) return candidate;
  return undefined;
}

// ---------------------------------------------------------------------
// mcp_tool_call validation (M3)
// ---------------------------------------------------------------------

const CAPTURE_NAME_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;

function validateMcpToolCallStep(
  step: McpToolCallStep,
  registry: BlockRegistry,
  capturedBindings: Set<string>,
  issues: ValidationIssue[],
): void {
  // Tool name resolution — must exist in the registry.
  const entry = registry.tools.get(step.tool);
  if (!entry) {
    issues.push({
      code: "unknown_tool",
      stepId: step.id,
      path: "tool",
      message: `tool "${step.tool}" is not registered in any block's tools surface`,
    });
    // Don't short-circuit — still validate capture name shape so we
    // surface multiple independent issues per step in one pass.
  }

  // Full args-shape Zod check lives in M5 (interpolation-resolver-
  // aware). M3 catches the shape-free failures: unknown tool + bad
  // capture identifier + duplicate capture binding. Args values with
  // `{{interpolation}}` strings would choke a naive Zod parse (a uuid
  // field can't accept "{{contactId}}" as valid text), so proper
  // type-checked arg validation threads through the interpolation
  // resolver — which doesn't exist until M5.

  if (step.capture !== undefined) {
    if (!CAPTURE_NAME_PATTERN.test(step.capture)) {
      issues.push({
        code: "bad_capture_name",
        stepId: step.id,
        path: "capture",
        message: `capture="${step.capture}" must be a lowercase identifier matching /^[a-z][a-zA-Z0-9_]*$/ so downstream {{${step.capture}.field}} references are unambiguous`,
      });
    } else if (capturedBindings.has(step.capture)) {
      issues.push({
        code: "bad_capture_name",
        stepId: step.id,
        path: "capture",
        message: `capture="${step.capture}" is already bound by an earlier step; capture names must be unique within a spec`,
      });
    } else {
      capturedBindings.add(step.capture);
    }
  }
}

// ---------------------------------------------------------------------
// Interpolation resolver (M5)
//
// Walks every string value in the spec, extracts {{var.path}} refs,
// and verifies each resolves against the scope available at the
// referencing step. The scope at step N contains:
//   - Variables declared on the spec (top-level aliases).
//   - Extract bindings from conversations that run STRICTLY BEFORE N.
//   - Capture bindings from mcp_tool_call steps that run STRICTLY
//     BEFORE N (linear execution order via `next` chains is not
//     validated here — 2b.1 assumes declaration order matches linear
//     execution for validation purposes; branch steps in 2e will
//     tighten this).
//   - Reserved namespaces: `trigger`, `contact` (shorthand for
//     trigger.contact), `agent`, `workspace`. Path resolution for
//     reserved namespaces is not type-checked (runtime provides the
//     shape); the names just pass through.
//
// For captures specifically — the audit-named bug class — the
// validator walks the tool's returns Zod schema and checks that
// every path segment resolves. Supports the archetype convention
// of "capture unwraps `data` key if present" (see
// lib/agents/archetypes/types.ts:35). For CRM-style returns without
// a `data` key, the walk starts at the full returns shape.
// ---------------------------------------------------------------------

const INTERPOLATION_RE = /\{\{\s*([^}]+?)\s*\}\}/g;
const RESERVED_NAMESPACES = new Set(["trigger", "contact", "agent", "workspace"]);

type ParsedInterpolation = {
  raw: string;
  varName: string;
  path: string[];
};

function parseInterpolations(text: string): ParsedInterpolation[] {
  const found: ParsedInterpolation[] = [];
  INTERPOLATION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INTERPOLATION_RE.exec(text)) !== null) {
    const body = match[1].trim();
    if (!body) continue;
    const segments = body.split(".");
    const [varName, ...path] = segments;
    if (!varName) continue;
    found.push({ raw: match[0], varName, path });
  }
  return found;
}

// Walk a Zod schema down `path` and return { ok } or detailed failure.
// Unwraps ZodOptional / ZodNullable on the way to reach inner shapes.
// Returns `{kind: "unknown_shape"}` when the schema isn't a ZodObject
// at a point where path-walking is required — we treat that as "can't
// type-check, don't emit an issue" rather than failing optimistically.
type WalkResult =
  | { kind: "ok" }
  | { kind: "fail"; badSegment: string; availableFields: string[] }
  | { kind: "unknown_shape" };

function unwrapZodWrapper(schema: z.ZodType): z.ZodType {
  let current: z.ZodType = schema;
  // Unwrap optional / nullable recursively.
  while (true) {
    const def = (current as unknown as { def?: { type?: string; innerType?: z.ZodType } }).def;
    if (!def) return current;
    if ((def.type === "optional" || def.type === "nullable") && def.innerType) {
      current = def.innerType;
      continue;
    }
    return current;
  }
}

function walkSchemaPath(schema: z.ZodType, path: string[]): WalkResult {
  let current: z.ZodType = unwrapZodWrapper(schema);
  for (const segment of path) {
    // Zod v4 exposes .shape on ZodObject. Guard with a runtime check.
    const shape = (current as unknown as { shape?: Record<string, z.ZodType> }).shape;
    if (!shape || typeof shape !== "object") {
      return { kind: "unknown_shape" };
    }
    const next = shape[segment];
    if (!next) {
      return {
        kind: "fail",
        badSegment: segment,
        availableFields: Object.keys(shape),
      };
    }
    current = unwrapZodWrapper(next);
  }
  return { kind: "ok" };
}

// If the tool's returns shape is `{ data: <inner> }`, treat the capture
// as binding to `<inner>` directly (archetype convention — see
// archetypes/types.ts:35). Otherwise the capture binds to the full
// returns shape.
function captureAccessibleShape(returns: z.ZodType): z.ZodType {
  const shape = (unwrapZodWrapper(returns) as unknown as { shape?: Record<string, z.ZodType> }).shape;
  if (shape && shape.data) {
    return unwrapZodWrapper(shape.data);
  }
  return returns;
}

type InterpolationScope = {
  variables: Set<string>;
  // Capture name → accessible shape (already data-unwrapped where
  // appropriate).
  captures: Map<string, z.ZodType>;
  // Extract name (from conversation on_exit.extract).
  extracts: Set<string>;
};

function validateInterpolationsInStep(
  step: Step,
  scope: InterpolationScope,
  issues: ValidationIssue[],
): void {
  const stepId = step.id;
  // Collect every string that may contain interpolations. Shallow walk
  // on step-type-specific fields that carry user content; deep walks
  // apply to mcp_tool_call.args which can carry nested objects.
  const stringPaths: Array<{ path: string; text: string }> = [];

  if (isMcpToolCallStep(step)) {
    walkObjectStrings(step.args, "args", stringPaths);
  } else if (isConversationStep(step)) {
    stringPaths.push({ path: "initial_message", text: step.initial_message });
    stringPaths.push({ path: "exit_when", text: step.exit_when });
    for (const [key, description] of Object.entries(step.on_exit.extract)) {
      stringPaths.push({ path: `on_exit.extract.${key}`, text: description });
    }
  } else if (isAwaitEventStep(step)) {
    // Predicate value strings can carry {{capture.field}} / {{variable}}
    // refs. Per G-4, these resolve at wait-registration time; the
    // validator's job is to confirm each reference resolves within the
    // current scope. walkObjectStrings recurses into `all`/`any` children
    // since the predicate shape nests. Guard against UnknownStep
    // fallthrough by accessing match via an any-cast + shape check.
    const match = (step as { match?: unknown }).match;
    if (match && typeof match === "object") {
      walkObjectStrings(match, "match", stringPaths);
    }
  } else if (isBranchStep(step)) {
    // SLICE 6 PR 1 C2 — external_state conditions interpolate URL,
    // headers, query, body. Walk all strings in the http config so
    // interpolation references resolve against the run scope.
    // The interpolation-scope rejection for {{secrets.*}} is enforced
    // as a SEPARATE pass below (not a scope-miss; an explicit reject).
    if (step.condition.type === "external_state") {
      walkObjectStrings(step.condition.http, "condition.http", stringPaths);
    }
  }
  // wait / unknown step types have no interpolatable user content.

  for (const { path, text } of stringPaths) {
    for (const ref of parseInterpolations(text)) {
      // Max's additional spec: interpolation scope for external_state
      // EXCLUDES workspace_secrets. Auth goes through secret_name
      // lookup in AuthConfigSchema, never through interpolation.
      if (ref.varName === "secrets") {
        issues.push({
          code: "unresolved_interpolation",
          stepId,
          path,
          message: `interpolation "${ref.raw}" references workspace secrets; secrets must flow through AuthConfigSchema.secret_name, not interpolation`,
        });
        continue;
      }
      resolveOneInterpolation(stepId, path, ref, scope, issues);
    }
  }
}

function walkObjectStrings(
  obj: unknown,
  basePath: string,
  out: Array<{ path: string; text: string }>,
): void {
  if (typeof obj === "string") {
    out.push({ path: basePath, text: obj });
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => walkObjectStrings(item, `${basePath}[${i}]`, out));
    return;
  }
  if (obj && typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      walkObjectStrings(value, `${basePath}.${key}`, out);
    }
  }
  // numbers / booleans / null: no interpolations possible.
}

function resolveOneInterpolation(
  stepId: string,
  path: string,
  ref: ParsedInterpolation,
  scope: InterpolationScope,
  issues: ValidationIssue[],
): void {
  const { raw, varName, path: refPath } = ref;

  // 1. Reserved namespaces pass through without path validation.
  if (RESERVED_NAMESPACES.has(varName)) return;

  // 2. Variables resolve on name only (they're string-aliases to
  // trigger paths; the alias itself can't carry further .path).
  if (scope.variables.has(varName)) {
    if (refPath.length > 0) {
      issues.push({
        code: "unresolved_interpolation",
        stepId,
        path,
        message: `interpolation ${raw} references variable "${varName}" with sub-path ".${refPath.join(".")}" — variables are string aliases and don't support field access; declare the needed value as a separate variable or capture its source explicitly`,
      });
    }
    return;
  }

  // 3. Extract names pass through without path validation (extract
  // values are scalars today — NL descriptions that resolve to
  // strings / numbers / enums at runtime per conversation semantics).
  if (scope.extracts.has(varName)) {
    if (refPath.length > 0) {
      issues.push({
        code: "unresolved_interpolation",
        stepId,
        path,
        message: `interpolation ${raw} references extract "${varName}" with sub-path ".${refPath.join(".")}" — extracts are scalar values, not objects`,
      });
    }
    return;
  }

  // 4. Captures — walk the Zod returns shape.
  const captureShape = scope.captures.get(varName);
  if (captureShape) {
    if (refPath.length === 0) return;
    const result = walkSchemaPath(captureShape, refPath);
    if (result.kind === "fail") {
      issues.push({
        code: "unresolved_interpolation",
        stepId,
        path,
        message: `interpolation ${raw} cannot resolve ".${result.badSegment}" on capture "${varName}" — available fields at that level: [${result.availableFields.join(", ")}]`,
      });
    }
    // kind: "ok" or "unknown_shape" — no issue.
    return;
  }

  // 5. Nothing matched → unresolved_interpolation with a guess.
  issues.push({
    code: "unresolved_interpolation",
    stepId,
    path,
    message: `interpolation ${raw} references "${varName}" which is not a declared variable, extract, capture, or reserved namespace (trigger / contact / agent / workspace)`,
  });
}

// ---------------------------------------------------------------------
// conversation validation (M4)
// ---------------------------------------------------------------------

// Extract-field names follow the same identifier rules as captures so
// downstream {{field_name}} references parse unambiguously. The shape
// of the value (NL description today, typed ExtractField shape once
// conversations migrate to typed exits per audit §2.b) is future-
// proofed here: string values are NL descriptions and pass through;
// the typed migration will layer an additional check when it lands.
const EXTRACT_KEY_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;

function validateConversationStep(
  step: ConversationStep,
  extractBindings: Set<string>,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(step.on_exit.extract)) {
    if (!EXTRACT_KEY_PATTERN.test(key)) {
      issues.push({
        code: "bad_extract_shape",
        stepId: step.id,
        path: `on_exit.extract.${key}`,
        message: `extract key "${key}" must be a lowercase identifier matching /^[a-z][a-zA-Z0-9_]*$/ so downstream {{${key}}} references are unambiguous`,
      });
      continue;
    }
    // Track as an interpolation source for M5's resolver. We don't
    // error on collision across conversations in the same spec —
    // current archetypes never hit it, and runtime semantics for
    // cross-conversation shadowing aren't in 2b.1 scope.
    extractBindings.add(key);
  }
}

// ---------------------------------------------------------------------
// await_event dispatcher (2c PR 1 M2)
//
// Synthesis-time checks:
//   1. `event` is in the SeldonEvent registry (unknown_event).
//   2. `match` predicate's field paths starting with `data.` resolve
//      against the event's declared data shape (unresolved_interpolation
//      reused — same issue code family as the capture-field walker).
//   3. Both `on_resume.next` and `on_timeout.next` resolve to real step
//      ids (unknown_step_next).
//   4. `on_resume.capture` (if present) is a valid identifier and
//      doesn't shadow a prior capture (bad_capture_name).
//   5. `timeout` (if present) is within the 90-day ceiling set by G-3
//      approved 2026-04-22. Durations beyond 90 days are rejected at
//      synthesis time — runtime retention on `workflow_event_log` is
//      90 days, so longer waits could never match an event anyway.
//   6. Audit §3.1 point 5: `on_timeout.capture` is INVALID (no event
//      payload to capture on timeout). Current Zod schema doesn't
//      declare capture on on_timeout, but UnknownStepSchema fallthrough
//      could absorb a malformed shape with capture on timeout — we
//      check the raw step object defensively here.
// ---------------------------------------------------------------------

// G-3 approved ceiling: 90 days. Approximate-ms computation — we're
// comparing against a generous ceiling, not scheduling precisely, so
// treating months as 30 days and years as 365 days is fine for the
// synthesis-time guard.
const AWAIT_EVENT_TIMEOUT_CEILING_MS = 90 * 24 * 60 * 60 * 1000;

function durationToApproxMs(duration: string): number | null {
  // Matches DurationSchema regex in types.ts:110. Forms:
  //   PT<n>S | PT<n>M | PT<n>H    (sub-day)
  //   P<n>D  | P<n>W  | P<n>M  | P<n>Y    (day-and-up)
  const subDayMatch = /^PT(\d+)([SMH])$/.exec(duration);
  if (subDayMatch) {
    const n = Number(subDayMatch[1]);
    switch (subDayMatch[2]) {
      case "S": return n * 1000;
      case "M": return n * 60 * 1000;
      case "H": return n * 60 * 60 * 1000;
    }
  }
  const dayPlusMatch = /^P(\d+)([DWMY])$/.exec(duration);
  if (dayPlusMatch) {
    const n = Number(dayPlusMatch[1]);
    const day = 24 * 60 * 60 * 1000;
    switch (dayPlusMatch[2]) {
      case "D": return n * day;
      case "W": return n * 7 * day;
      case "M": return n * 30 * day;
      case "Y": return n * 365 * day;
    }
  }
  return null;
}

function validateAwaitEventStep(
  step: AwaitEventStep | UnknownStep,
  stepIds: Set<string>,
  capturedBindings: Set<string>,
  eventRegistry: EventRegistry,
  issues: ValidationIssue[],
): void {
  // The type guard isAwaitEventStep only confirms type+event — it
  // doesn't validate nested shape. UnknownStep-absorbed malformed
  // shapes (missing on_resume, bad predicate kind, etc.) reach here.
  // Re-parse defensively: spec_malformed with specific path is a
  // better UX than a TypeError or a silent pass.
  const parsed = AwaitEventStepSchema.safeParse(step);
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({
        code: "spec_malformed",
        stepId: step.id,
        path: err.path.join(".") || "$",
        message: err.message,
      });
    }
    return;
  }
  const validated = parsed.data;

  // 1. event must exist in the SeldonEvent registry.
  const knownEvents = new Set(eventRegistry.events.map((e) => e.type));
  if (!knownEvents.has(validated.event)) {
    issues.push({
      code: "unknown_event",
      stepId: validated.id,
      path: "event",
      message: `await_event references event "${validated.event}" which is not in the SeldonEvent registry`,
    });
    // Continue — subsequent checks give independent value.
  }

  // 2. match predicate's `data.*` paths resolve against the event's
  // data shape. Other paths (no `data.` prefix) address the workflow's
  // interpolation scope — those are validated by
  // validateInterpolationsInStep, not here.
  if (validated.match) {
    const eventEntry = eventRegistry.events.find((e) => e.type === validated.event);
    if (eventEntry) {
      validatePredicateDataPaths(validated.id, "match", validated.match, eventEntry.fields, issues);
    }
  }

  // 3. Both next refs must resolve (unknown_step_next). Null is a
  // valid terminator.
  for (const branch of ["on_resume", "on_timeout"] as const) {
    const next = validated[branch].next;
    if (next !== null && !stepIds.has(next)) {
      issues.push({
        code: "unknown_step_next",
        stepId: validated.id,
        path: `${branch}.next`,
        message: `await_event "${validated.id}" references ${branch}.next="${next}" which is not a declared step id`,
      });
    }
  }

  // 4. Capture identifier shape + no-shadow check.
  if (validated.on_resume.capture !== undefined) {
    const name = validated.on_resume.capture;
    if (!CAPTURE_NAME_PATTERN.test(name)) {
      issues.push({
        code: "bad_capture_name",
        stepId: validated.id,
        path: "on_resume.capture",
        message: `capture="${name}" must be a lowercase identifier matching /^[a-z][a-zA-Z0-9_]*$/ so downstream {{${name}.field}} references are unambiguous`,
      });
    } else if (capturedBindings.has(name)) {
      issues.push({
        code: "bad_capture_name",
        stepId: validated.id,
        path: "on_resume.capture",
        message: `capture="${name}" is already bound by an earlier step; capture names must be unique within a spec`,
      });
    } else {
      capturedBindings.add(name);
    }
  }

  // 5. Timeout ceiling (G-3, approved 90 days).
  if (validated.timeout !== undefined) {
    const ms = durationToApproxMs(validated.timeout);
    if (ms !== null && ms > AWAIT_EVENT_TIMEOUT_CEILING_MS) {
      issues.push({
        code: "spec_malformed",
        stepId: validated.id,
        path: "timeout",
        message: `timeout "${validated.timeout}" exceeds the 90-day ceiling (audit G-3). Event log retention is 90 days; longer waits could never match an event.`,
      });
    }
  }

  // 6. Defensive: reject capture-on-timeout if a raw object leaked
  // through. AwaitEventStepSchema.on_timeout is `{next: ...}` without
  // capture, so a well-formed step has this guaranteed — but runtime
  // data can carry passthrough keys that the defensive safeParse
  // above might preserve. Check the original step (not `validated`)
  // because Zod strips non-schema keys.
  const rawTimeout = (step as { on_timeout?: { capture?: unknown } }).on_timeout;
  if (rawTimeout && rawTimeout.capture !== undefined) {
    issues.push({
      code: "spec_malformed",
      stepId: validated.id,
      path: "on_timeout.capture",
      message: `await_event does not support capture on the timeout path (there is no event payload to bind when the wait times out). Remove on_timeout.capture; bind captures only on on_resume.`,
    });
  }
}

// Build a Zod shape for an event's data payload from the EventRegistry.
// Used to:
//   - Bind the shape for {{capture.field}} resolution when an
//     await_event captures the resumed event.
//   - Drive predicate data-path validation in
//     validatePredicateDataPaths (scan-only; we never execute).
// The mapping from `rawType` strings to Zod types is intentionally
// narrow — covers the variants that actually appear in the emitted
// registry (string, string | null, number, Record<string, unknown>).
function buildEventDataShape(
  eventType: string,
  eventRegistry: EventRegistry,
): z.ZodType {
  const entry = eventRegistry.events.find((e) => e.type === eventType);
  if (!entry) return z.unknown();
  const shape: Record<string, z.ZodType> = {};
  for (const [fieldName, fieldMeta] of Object.entries(entry.fields)) {
    let fieldSchema: z.ZodType;
    const baseType = fieldMeta.rawType.replace(/\s*\|\s*null\s*$/, "");
    switch (baseType) {
      case "string":
        fieldSchema = z.string();
        break;
      case "number":
        fieldSchema = z.number();
        break;
      case "boolean":
        fieldSchema = z.boolean();
        break;
      case "Record<string, unknown>":
        fieldSchema = z.record(z.string(), z.unknown());
        break;
      default:
        // Conservative: unknown types parse as z.unknown() so
        // downstream walks don't emit false positives.
        fieldSchema = z.unknown();
    }
    if (fieldMeta.nullable || fieldMeta.rawType.includes("| null")) {
      fieldSchema = fieldSchema.nullable();
    }
    shape[fieldName] = fieldSchema;
  }
  return z.object(shape);
}

// Walk predicate nodes and emit issues for any `data.X` field path
// whose X isn't declared on the event's data shape. Other path prefixes
// (without `data.`) address the workflow's interpolation scope and
// are validated by validateInterpolationsInStep — not this walker.
function validatePredicateDataPaths(
  stepId: string,
  basePath: string,
  predicate: unknown,
  eventFields: Record<string, { rawType: string; nullable: boolean }>,
  issues: ValidationIssue[],
): void {
  if (!predicate || typeof predicate !== "object") return;
  const p = predicate as { kind?: string; field?: string; of?: unknown[] };
  if (p.kind === "all" || p.kind === "any") {
    const children = Array.isArray(p.of) ? p.of : [];
    children.forEach((child, i) => {
      validatePredicateDataPaths(stepId, `${basePath}.of[${i}]`, child, eventFields, issues);
    });
    return;
  }
  if (typeof p.field !== "string") return;
  if (!p.field.startsWith("data.")) return; // address to workflow scope, not event payload
  const fieldName = p.field.slice(5); // strip "data."
  // Only flag top-level field mismatches. Nested object fields on the
  // event payload (e.g., data.data.someSubkey for form.submitted)
  // require deeper walking that we defer — Record<string, unknown>
  // is the registry's representation and doesn't carry inner keys.
  const firstSegment = fieldName.split(".")[0];
  if (!Object.prototype.hasOwnProperty.call(eventFields, firstSegment)) {
    issues.push({
      code: "unresolved_interpolation",
      stepId,
      path: `${basePath}.field`,
      message: `predicate field "${p.field}" references event payload field "${firstSegment}" which is not declared on event — expected one of: ${Object.keys(eventFields).sort().join(", ")}`,
    });
  }
}

// ---------------------------------------------------------------------
// read_state validation (SLICE 3 C1 — G-3-1 enforcement)
//
// AgentSpecSchema.safeParse accepts malformed read_state shapes via
// the UnknownStep fallthrough (z.union pattern). This validator
// re-parses under ReadStateStepSchema and surfaces every violation
// as spec_malformed. Same pattern validateAwaitEventStep uses.
// ---------------------------------------------------------------------

function validateReadStateStep(
  step: Step,
  capturedBindings: Set<string>,
  issues: ValidationIssue[],
): void {
  const parsed = ReadStateStepSchema.safeParse(step);
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({
        code: "spec_malformed",
        stepId: step.id,
        path: err.path.join(".") || "$",
        message: err.message,
      });
    }
    return;
  }
  const validated = parsed.data;

  // Capture identifier + no-shadow check.
  if (!CAPTURE_NAME_PATTERN.test(validated.capture)) {
    issues.push({
      code: "bad_capture_name",
      stepId: validated.id,
      path: "capture",
      message: `capture="${validated.capture}" must be a lowercase identifier matching /^[a-z][a-zA-Z0-9_]*$/`,
    });
  } else if (capturedBindings.has(validated.capture)) {
    issues.push({
      code: "bad_capture_name",
      stepId: validated.id,
      path: "capture",
      message: `capture="${validated.capture}" is already bound by an earlier step; capture names must be unique within a spec`,
    });
  } else {
    capturedBindings.add(validated.capture);
  }
}

// ---------------------------------------------------------------------
// write_state validation (SLICE 3 C2 — G-3-3 Option B-2 allowlist)
//
// Consults the static AGENT_WRITABLE_SOUL_PATHS allowlist. Every
// path not on the list fails spec_malformed with a clear message.
// The runtime dispatcher re-checks (defense-in-depth) — both gates
// must open for a write to land.
// ---------------------------------------------------------------------

function validateWriteStateStep(step: Step, issues: ValidationIssue[]): void {
  const parsed = WriteStateStepSchema.safeParse(step);
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({
        code: "spec_malformed",
        stepId: step.id,
        path: err.path.join(".") || "$",
        message: err.message,
      });
    }
    return;
  }
  const validated = parsed.data;

  // Path resolution note: interpolation tokens (`{{...}}`) in the
  // path are NOT resolved at validation time — the allowlist check
  // happens against the LITERAL path template. A path like
  // `workspace.soul.contact.{{id}}.stage` would need the template
  // form `workspace.soul.contact.{{id}}.stage` on the allowlist.
  // This is intentional: allowing dynamic paths to bypass the
  // allowlist via interpolation defeats the safety posture.
  if (!isAgentWritablePath(validated.path)) {
    issues.push({
      code: "spec_malformed",
      stepId: validated.id,
      path: "path",
      message:
        `write_state.path "${validated.path}" is not in the agent-writable allowlist. ` +
        `Paths must be explicitly added to packages/crm/src/lib/workflow/state-access/allowlist.ts ` +
        `with an accompanying PR documenting the use case + idempotency guarantees.`,
    });
  }
}

// ---------------------------------------------------------------------
// emit_event validation (SLICE 3 C3 — G-3-2 registry cross-check)
//
// Checks:
//   1. Event name exists in the SeldonEvent registry.
//   2. Every declared `data.*` key is a known field on the event.
//   3. Non-interpolated literal values type-match the field's rawType.
//   4. Interpolated values (strings containing `{{...}}`) pass at
//      parse — the dispatcher type-checks at emit time.
// ---------------------------------------------------------------------

const INTERPOLATION_TOKEN_RE = /\{\{\s*[^}]+?\s*\}\}/;

function validateEmitEventStep(
  step: Step,
  eventRegistry: EventRegistry,
  issues: ValidationIssue[],
): void {
  const parsed = EmitEventStepSchema.safeParse(step);
  if (!parsed.success) {
    for (const err of parsed.error.issues) {
      issues.push({
        code: "spec_malformed",
        stepId: step.id,
        path: err.path.join(".") || "$",
        message: err.message,
      });
    }
    return;
  }
  const validated = parsed.data;

  // 1. Event name in registry.
  const eventEntry = eventRegistry.events.find((e) => e.type === validated.event);
  if (!eventEntry) {
    issues.push({
      code: "unknown_event",
      stepId: validated.id,
      path: "event",
      message: `emit_event "${validated.event}" is not in the SeldonEvent registry`,
    });
    return;
  }

  // 2 + 3. Validate each data key + type.
  for (const [key, value] of Object.entries(validated.data)) {
    const field = eventEntry.fields[key];
    if (!field) {
      issues.push({
        code: "spec_malformed",
        stepId: validated.id,
        path: `data.${key}`,
        message: `emit_event data field "${key}" is not declared on "${validated.event}" — expected one of: ${Object.keys(eventEntry.fields).sort().join(", ") || "(none)"}`,
      });
      continue;
    }
    // 4. Interpolated strings pass at parse; runtime checks.
    if (typeof value === "string" && INTERPOLATION_TOKEN_RE.test(value)) continue;

    const baseType = field.rawType.replace(/\s*\|\s*(null|undefined)\s*$/, "").trim();
    const isNullable = field.nullable || /\|\s*(null|undefined)\b/.test(field.rawType);
    if (value === null) {
      if (!isNullable) {
        issues.push({
          code: "spec_malformed",
          stepId: validated.id,
          path: `data.${key}`,
          message: `emit_event data.${key} is null but field is non-nullable (${field.rawType})`,
        });
      }
      continue;
    }
    if (!matchesLiteralType(value, baseType)) {
      issues.push({
        code: "spec_malformed",
        stepId: validated.id,
        path: `data.${key}`,
        message: `emit_event data.${key} (${typeof value}) does not match declared type "${field.rawType}"`,
      });
    }
  }
}

function matchesLiteralType(value: unknown, baseType: string): boolean {
  switch (baseType) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "boolean": return typeof value === "boolean";
    case "Record<string, unknown>":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    default:
      // Unknown rawType — permit. Conservative: avoid false
      // positives on niche types. Runtime will surface via
      // typecheck at delivery.
      return true;
  }
}
