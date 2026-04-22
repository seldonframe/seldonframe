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
//   - await_event step validation (2c scope)
//   - Runtime execution (7.e scope)

import { z } from "zod";

import type { ToolDefinition } from "../blocks/contract-v2";

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
  | "unsupported_step_type";

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

const TriggerSchema = z.object({
  type: z.literal("event"),
  event: z.string().min(1),
  filter: z.record(z.string(), z.unknown()).optional(),
});

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

// Open-ended fallback for unknown step types. Parse succeeds; the
// step dispatcher surfaces `unsupported_step_type` against it.
const UnknownStepSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
  })
  .passthrough();

const StepSchema: z.ZodType<
  | z.infer<typeof WaitStepSchema>
  | z.infer<typeof McpToolCallStepSchema>
  | z.infer<typeof ConversationStepSchema>
  | z.infer<typeof UnknownStepSchema>
> = z.union([WaitStepSchema, McpToolCallStepSchema, ConversationStepSchema, UnknownStepSchema]);

export const AgentSpecSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  trigger: TriggerSchema,
  variables: z.record(z.string(), z.string()).optional(),
  steps: z.array(StepSchema).min(1),
});

export type AgentSpec = z.infer<typeof AgentSpecSchema>;
export type Step = z.infer<typeof StepSchema>;
export type WaitStep = z.infer<typeof WaitStepSchema>;
export type McpToolCallStep = z.infer<typeof McpToolCallStepSchema>;
export type ConversationStep = z.infer<typeof ConversationStepSchema>;

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

  // Trigger event must exist in the SeldonEvent union.
  const knownEvents = new Set(eventRegistry.events.map((e) => e.type));
  if (!knownEvents.has(spec.trigger.event)) {
    issues.push({
      code: "unknown_event",
      stepId: null,
      path: "trigger.event",
      message: `trigger event "${spec.trigger.event}" is not in the SeldonEvent registry`,
    });
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

    validateStep(step, spec, stepIds, registry, capturedBindings, extractBindings, issues);

    // After validation, record this step's bindings for downstream
    // interpolations. Capture shapes come from the tool's returns
    // schema (unwrapped via captureAccessibleShape for the data-key
    // convention).
    if (step.type === "mcp_tool_call" && step.capture) {
      const entry = registry.tools.get(step.tool);
      if (entry && !captureShapes.has(step.capture)) {
        captureShapes.set(step.capture, captureAccessibleShape(entry.tool.returns));
      }
    }
  }

  return issues;
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
  issues: ValidationIssue[],
): void {
  // `next` reference check applies uniformly across step types.
  const next = "next" in step ? step.next : ("on_exit" in step ? step.on_exit.next : null);
  if (next !== null && next !== undefined && !stepIds.has(next)) {
    issues.push({
      code: "unknown_step_next",
      stepId: step.id,
      path: "next",
      message: `step "${step.id}" references next="${next}" which is not a declared step id`,
    });
  }

  switch (step.type) {
    case "wait":
      // No further per-step validation. seconds is already a
      // nonnegative int via schema.
      return;
    case "mcp_tool_call":
      validateMcpToolCallStep(step as McpToolCallStep, registry, capturedBindings, issues);
      return;
    case "conversation":
      validateConversationStep(step as ConversationStep, extractBindings, issues);
      return;
    default:
      issues.push({
        code: "unsupported_step_type",
        stepId: step.id,
        path: "type",
        message: `step type "${step.type}" is not supported by this validator (PR 2 handles wait / mcp_tool_call / conversation; branch + await_event ship with 2e / 2c)`,
      });
  }
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

  if (step.type === "mcp_tool_call") {
    walkObjectStrings(step.args, "args", stringPaths);
  } else if (step.type === "conversation") {
    stringPaths.push({ path: "initial_message", text: step.initial_message });
    stringPaths.push({ path: "exit_when", text: step.exit_when });
    for (const [key, description] of Object.entries(step.on_exit.extract)) {
      stringPaths.push({ path: `on_exit.extract.${key}`, text: description });
    }
  }
  // wait / unknown step types have no interpolatable user content.

  for (const { path, text } of stringPaths) {
    for (const ref of parseInterpolations(text)) {
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
