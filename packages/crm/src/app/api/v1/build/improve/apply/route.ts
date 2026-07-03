// POST /api/v1/build/improve/apply — Task 10: the bearer-authed apply verb.
//
// Applies a proposed improve patch (T9's `applyImproveProposal`, the
// PROPOSE-ONLY apply gate — deps.ts) for the org resolved from the BEARER
// TOKEN, never the body. Same auth posture as improve/route.ts and
// `/api/v1/build/deploy`: `guardApiRequest` → `guard.orgId`. This route calls
// the SAME plain-module core `applyImproveProposalAction` delegates to
// internally (`applyImproveProposal` + `defaultApplyProposalDeps()`, both
// already living in a non-"use server" module — deps.ts) — no extraction was
// needed; the apply core was already factored out ahead of this task.
//
// No `maxDuration` override: apply does a single guardrail re-validation +
// one DB write, not an LLM replay — the platform default is fine (mirrors
// the brief: "apply is fast — default is fine there unless the deploy route
// sets one", and deploy/route.ts itself sets none).
//
// Testability: `handleApplyRequest` mirrors improve/route.ts's
// `handleImproveRequest` — DI'd bearer resolution + dispatch, so 401/400/
// happy-path is unit-testable over fakes.

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import {
  applyImproveProposal,
  defaultApplyProposalDeps,
  type ApplyProposalResult,
} from "@/lib/agents/improve/deps";

/** Same shape as improve/route.ts's ResolveBearerResult — kept local (not
 *  shared via import) so each route file stays independently readable and
 *  neither depends on the other's internals; both wrap the same
 *  `guardApiRequest` primitive underneath. */
export type ResolveBearerResult = { orgId: string } | { error: NextResponse };

export type ApplyProposalFn = (proposalId: string, orgId: string) => Promise<ApplyProposalResult>;

/**
 * DI'd core: resolve the bearer, parse the body, validate `proposal_id`,
 * then delegate to `applyProposal`. The bearer is resolved and validated
 * BEFORE the body is ever parsed. A body-supplied `orgId` is never
 * consulted — only the bearer's orgId is used.
 */
export async function handleApplyRequest(
  request: Request,
  deps: { resolveBearer: (request: Request) => Promise<ResolveBearerResult>; applyProposal: ApplyProposalFn },
): Promise<NextResponse> {
  const resolved = await deps.resolveBearer(request);
  if ("error" in resolved) return resolved.error;
  const { orgId } = resolved;

  const body = (await request.json().catch(() => ({}))) as { proposal_id?: unknown };
  const proposalId = typeof body.proposal_id === "string" ? body.proposal_id.trim() : "";
  if (!proposalId) {
    return NextResponse.json({ ok: false, error: "missing_proposal_id" }, { status: 400 });
  }

  const result = await deps.applyProposal(proposalId, orgId);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

/** Real bearer resolver — identical to improve/route.ts's (see that file for
 *  the guardApiRequest composition note). */
async function resolveBearer(request: Request): Promise<ResolveBearerResult> {
  const guard = await guardApiRequest(request);
  if ("error" in guard && guard.error) return { error: guard.error };
  if (!("orgId" in guard) || !guard.orgId) {
    return { error: NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }) };
  }
  return { orgId: guard.orgId };
}

/** Real applyProposal: the SAME core + real deps `applyImproveProposalAction`
 *  (actions.ts) delegates to, minus the session org resolution. */
function applyProposal(proposalId: string, orgId: string): Promise<ApplyProposalResult> {
  return applyImproveProposal({ proposalId, orgId }, defaultApplyProposalDeps());
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleApplyRequest(request, { resolveBearer, applyProposal });
}
