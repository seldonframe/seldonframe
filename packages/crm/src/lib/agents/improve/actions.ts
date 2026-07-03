// Improve verb + trust rail (2026-07-02) — Task 9: the server actions.
//
// `runImproveAction` / `applyImproveProposalAction` / `dismissImproveProposalAction`
// are the THIN "use server" wrappers over the pure/DI'd cores this feature
// already shipped: `runImproveForAgent` (improve-run.ts, Task 8) and
// `applyImproveProposal`/`dismissImproveProposal` (deps.ts, this task). Every
// bit of logic lives in those tested modules — this file only: guards (write-
// block + org resolution), assembles the REAL deps (`buildImproveDeps` for
// run; `defaultApplyProposalDeps`/`defaultDismissProposalDeps` for apply/
// dismiss), calls the core, and shapes the result. Mirrors eval-actions.ts's
// own "intentionally thin" posture byte-for-byte.
//
// ORG SCOPING: every action resolves `orgId` via `getOrgId()` (the same
// session-org helper eval-actions.ts / store.ts's server actions use) —
// never trusts a client-supplied orgId. `runImproveForAgent` and
// `applyImproveProposal`/`dismissImproveProposal` are themselves org-scoped
// internally (every load is `and(eq(id), eq(orgId))`), so a caller who
// isn't unauthenticated but doesn't own the agent/proposal still gets a
// clean "not found"-shaped rejection from the core, not a cross-org leak.
//
// MONEY-SAFE: `runImproveAction` requires the operator's own BYOK key
// (buildImproveDeps's resolveStudioBuildGate) — improve is unbounded-COGS
// build/test work, same posture as runAgentEvalsAction. Apply/dismiss touch
// no LLM at all (re-validation is the PURE guardrail; updateAgentBlueprint
// is a plain DB write), so they carry no BYOK gate of their own.
//
// "use server": only async functions are exported here (the result TYPEs
// are exported as `type`, which the use-server guard allows — mirrors
// eval-actions.ts's own RunAgentEvalsActionResult export). The
// orchestration + real-deps assembly live in the plain modules this action
// imports (improve-run.ts, deps.ts).

"use server";

import { assertWritable } from "@/lib/demo/server";
import { getOrgId } from "@/lib/auth/helpers";
import { runImproveForAgent, type ImproveRunResult } from "@/lib/agents/improve/improve-run";
import {
  buildImproveDeps,
  applyImproveProposal,
  dismissImproveProposal,
  defaultApplyProposalDeps,
  defaultDismissProposalDeps,
} from "@/lib/agents/improve/deps";

export type RunImproveActionResult =
  | ImproveRunResult
  | { ok: false; reason: "unauthorized" | "no_llm_key"; message?: string };

/**
 * Run one full improve cycle for a deployed agent (org-scoped, BYOK-gated).
 * Thin wrapper: resolves the session org, assembles the real deps
 * (`buildImproveDeps` — rejects with `"no_llm_key"` if the operator has no
 * Anthropic BYOK key configured), and delegates entirely to
 * `runImproveForAgent` (improve-run.ts). See that module for the full
 * pipeline (source → scenario assembly → baseline replay → cluster →
 * propose → guardrail → candidate replay → persist → paired flips +
 * verdict) — this action adds no logic of its own.
 */
export async function runImproveAction(agentId: string): Promise<RunImproveActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, reason: "unauthorized" };

  const built = await buildImproveDeps({ orgId, agentId });
  if (!built.ok) {
    return { ok: false, reason: "no_llm_key", message: built.message };
  }

  return runImproveForAgent({ agentId, orgId }, built.deps);
}

export type ApplyImproveProposalActionResult =
  | { ok: true; version: number; note?: string }
  | { ok: false; error: string };

/**
 * Apply a proposed improve patch (org-scoped). Thin wrapper: resolves the
 * session org and delegates entirely to `applyImproveProposal` (deps.ts) —
 * the PROPOSE-ONLY apply gate that re-validates the patch against the
 * CURRENT blueprint before calling `updateAgentBlueprint` with publishNotes
 * `"improve run <proposalId>"`. Version drift does NOT block (see that
 * module's header) — it only annotates the return with a drift note.
 */
export async function applyImproveProposalAction(
  proposalId: string,
): Promise<ApplyImproveProposalActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  return applyImproveProposal({ proposalId, orgId }, defaultApplyProposalDeps());
}

export type DismissImproveProposalActionResult = { ok: boolean };

/**
 * Dismiss a proposed improve patch (org-scoped). Thin wrapper: resolves the
 * session org and delegates entirely to `dismissImproveProposal` (deps.ts)
 * — flips the proposal's status only, never touches the blueprint.
 */
export async function dismissImproveProposalAction(
  proposalId: string,
): Promise<DismissImproveProposalActionResult> {
  assertWritable();

  const orgId = await getOrgId();
  if (!orgId) return { ok: false };

  return dismissImproveProposal({ proposalId, orgId }, defaultDismissProposalDeps());
}
