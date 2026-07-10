import { z } from "zod";

// ─── Shared vocabulary (record-to-agent plan, Task 3) ──────────────────────
// Consumed by trace-compiler, merge-traces, coverage, compile-agent, and the
// recorder reducer. Types below are z.infer'd from the schemas so the two
// never drift.

export const TranscriptSegmentSchema = z.object({
  atMs: z.number(),
  text: z.string(),
});
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;

const WorkflowStepSchema = z.object({
  index: z.number().int().min(0),
  app: z.string().min(1),
  action: z.string().min(1),
  intent: z.string().min(1),
  dataIn: z.array(z.string()),
  dataOut: z.array(z.string()),
  checks: z.array(z.string()),
  decision: z.string().optional(),
});
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

const BranchSchema = z.object({
  condition: z.string().min(1),
  behavior: z.string(),
});

// Base object kept separate from its superRefine so FlowModelSchema can
// `.extend()` it (ZodEffects — the superRefine wrapper — is not extendable)
// and still share the exact same cross-field validation.
const WorkflowTraceBaseSchema = z.object({
  title: z.string().min(1),
  goal: z.string().min(1),
  apps: z.array(z.string()),
  steps: z.array(WorkflowStepSchema).min(1),
  variables: z.array(z.string()),
  constants: z.array(z.string()),
  branches: z.array(BranchSchema),
  openQuestions: z.array(z.string()),
});

function refineWorkflowTrace(
  trace: { steps: WorkflowStep[]; apps: string[] },
  ctx: z.RefinementCtx,
): void {
  // (a) step indexes strictly ascending from 0
  trace.steps.forEach((step, position) => {
    if (step.index !== position) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `step indexes must be strictly ascending from 0 — expected ${position} at position ${position}, got ${step.index}`,
        path: ["steps", position, "index"],
      });
    }
  });

  // (b) enforced inline via BranchSchema.condition.min(1) above.

  // (c) apps[] must contain every distinct steps[].app
  const declaredApps = new Set(trace.apps);
  const missingApps = new Set<string>();
  for (const step of trace.steps) {
    if (!declaredApps.has(step.app)) missingApps.add(step.app);
  }
  for (const app of missingApps) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `app "${app}" is used by a step but missing from apps[]`,
      path: ["apps"],
    });
  }
}

export const WorkflowTraceSchema = WorkflowTraceBaseSchema.superRefine(refineWorkflowTrace);
export type WorkflowTrace = z.infer<typeof WorkflowTraceSchema>;

export const CoverageEntrySchema = z
  .object({
    stepIndex: z.number().int().min(0),
    tier: z.enum(["green", "yellow", "red"]),
    toolkit: z.string().optional(),
    reason: z.string(),
  })
  .superRefine((entry, ctx) => {
    if (entry.tier === "green" && !entry.toolkit) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "toolkit is required when tier is 'green'",
        path: ["toolkit"],
      });
    }
  });
export type CoverageTier = "green" | "yellow" | "red";
export type CoverageEntry = z.infer<typeof CoverageEntrySchema>;

export const FlowModelSchema = WorkflowTraceBaseSchema.extend({
  recordingsSeen: z.number().int().min(1),
  coverage: z.array(CoverageEntrySchema),
}).superRefine(refineWorkflowTrace);
export type FlowModel = z.infer<typeof FlowModelSchema>;

export type TraceLlmRequest = {
  system: string;
  user: Array<
    | { type: "text"; text: string }
    | { type: "image"; mediaType: "image/jpeg"; base64: string }
  >;
  maxTokens: number;
};
export type TraceLlm = (req: TraceLlmRequest) => Promise<unknown>;
