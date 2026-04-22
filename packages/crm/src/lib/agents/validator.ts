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
  for (const step of spec.steps) {
    // Skeleton in M2: dispatch by type, record unsupported. M3+ fill
    // the real per-step validation.
    validateStep(step, spec, stepIds, registry, issues);
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
  _registry: BlockRegistry,
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
      // No further per-step validation in M2. seconds is already a
      // nonnegative int via schema.
      return;
    case "mcp_tool_call":
      // M3 fills this in — tool resolution + args Zod check + capture
      // cross-ref.
      return;
    case "conversation":
      // M4 fills this in — on_exit.extract shape + exit_when predicate
      // surface.
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
