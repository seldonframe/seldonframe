// Agent lifecycle slice (T6) — the pure stage-completion derivation.
//
// Five stages, each DERIVED from data the page already loads server-side —
// never a redundant stored flag. Pure, no I/O, safe to unit-test directly:
//   01 Learned    — the template exists (always true once the page renders).
//   02 Verified   — lifecycleGate's evalPass (>=80% pass rate, >=1 scenario).
//   03 Connected  — every REQUIRED toolkit (from the template's Composio
//                   bindings) has an active connection. Vacuously true when
//                   the template requires none.
//   04 Run        — a `supervised_runs` row for this template has
//                   status:'succeeded' (lifecycleGate's supervisedRun).
//   05 Sell       — at least one deployment OR a marketplace listing exists
//                   for this template.
//
// Single source of truth for both the ladder's checkmarks and the Sell
// stage's gate checklist — never two places computing "is this verified"
// differently.

export type LifecycleStageId = "learned" | "verified" | "connected" | "run" | "sell";

export type LifecycleStageInput = {
  /** Always true once the page has a template row to render — kept as an
   *  explicit input (not hardcoded) so the derivation stays a pure function
   *  of its args, not an assumption baked into the shape. */
  hasTemplate: boolean;
  evalPass: boolean;
  requiredToolkitCount: number;
  connectedToolkitCount: number;
  supervisedRunSucceeded: boolean;
  hasDeploymentOrListing: boolean;
};

export type LifecycleStage = {
  id: LifecycleStageId;
  step: string;
  title: string;
  complete: boolean;
};

/** True iff every required toolkit has an active connection — vacuously true
 *  when the template requires none (nothing to connect). */
export function isConnectedStageComplete(input: {
  requiredToolkitCount: number;
  connectedToolkitCount: number;
}): boolean {
  if (input.requiredToolkitCount <= 0) return true;
  return input.connectedToolkitCount >= input.requiredToolkitCount;
}

/** Derive the five-stage ladder's completion state. Pure; order is fixed
 *  (Learned → Verified → Connected → Run → Sell) — the spec's stage order. */
export function deriveLifecycleStages(input: LifecycleStageInput): LifecycleStage[] {
  return [
    { id: "learned", step: "01", title: "Learned", complete: input.hasTemplate },
    { id: "verified", step: "02", title: "Verified", complete: input.evalPass },
    {
      id: "connected",
      step: "03",
      title: "Connected",
      complete: isConnectedStageComplete(input),
    },
    { id: "run", step: "04", title: "Run", complete: input.supervisedRunSucceeded },
    { id: "sell", step: "05", title: "Sell", complete: input.hasDeploymentOrListing },
  ];
}
