// POST /api/v1/build/improve — Task 10: the bearer-authed "improve" verb.
//
// Runs one full improve cycle for a deployed agent (T8's `runImproveForAgent`,
// real deps from T9's `buildImproveDeps`) for the ORG RESOLVED FROM THE
// BEARER TOKEN — never from the request body. Mirrors
// `/api/v1/build/deploy`'s auth verbatim (`guardApiRequest` → `guard.orgId`,
// same 401 shape) since this is exactly the same class of caller (the MCP /
// CLI, bearer-authed, no session cookie) — the T9 "use server" actions
// resolve org via `getOrgId()` (the cookie/session chain) with NO override
// seam, so they can't serve this caller; this route instead calls the SAME
// plain-module cores (`runImproveForAgent`, `buildImproveDeps`) those actions
// call internally, passing the bearer-resolved orgId explicitly — byte-for-
// byte the same business logic, only the org-resolution seam differs (same
// composition note as deploy/route.ts).
//
// `maxDuration = 300`: an improve run does TWO full eval replay passes
// (baseline + candidate shadow), each replaying up to `SF_IMPROVE_MAX_SCENARIOS`
// scenarios against a real LLM — the default serverless timeout is too short.
//
// Testability: `handleImproveRequest` factors out auth + body-parsing +
// dispatch as a plain, DI'd function (fake `resolveBearer` + fake
// `runImprove`) so the 401/400/happy-path control flow is unit-testable
// without a real bearer token or Postgres — mirrors the deploy route's own
// `runDeploy`-over-fakes testing style, applied here at the route-handler
// layer since (per the brief) there is no separate orchestrator to extract
// the improve verb's auth+dispatch into.

export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { guardApiRequest } from "@/lib/api/guard";
import { runImproveForAgent, type ImproveRunResult } from "@/lib/agents/improve/improve-run";
import { buildImproveDeps } from "@/lib/agents/improve/deps";

/** The bearer-resolution seam: real callers get `{ orgId }` or a ready-made
 *  NextResponse error (401/400/429/403 — whatever guardApiRequest decided).
 *  Kept as the SAME shape `guardApiRequest` already returns so the real route
 *  can pass it through with zero mapping. */
export type ResolveBearerResult = { orgId: string } | { error: NextResponse };

export type RunImproveFn = (
  agentId: string,
  orgId: string,
) => Promise<ImproveRunResult | { ok: false; reason: "no_llm_key"; message?: string }>;

/**
 * DI'd core: resolve the bearer, parse the body, validate `agent_id`, then
 * delegate to `runImprove`. The bearer is resolved and validated BEFORE the
 * body is ever parsed — an invalid/missing bearer never triggers a body read.
 * A body-supplied `orgId` (if a caller sends one) is never consulted; the
 * bearer's orgId is the only source of truth.
 */
export async function handleImproveRequest(
  request: Request,
  deps: { resolveBearer: (request: Request) => Promise<ResolveBearerResult>; runImprove: RunImproveFn },
): Promise<NextResponse> {
  const resolved = await deps.resolveBearer(request);
  if ("error" in resolved) return resolved.error;
  const { orgId } = resolved;

  const body = (await request.json().catch(() => ({}))) as { agent_id?: unknown };
  const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
  if (!agentId) {
    return NextResponse.json({ ok: false, reason: "missing_agent_id" }, { status: 400 });
  }

  const result = await deps.runImprove(agentId, orgId);
  const status = result.ok ? 200 : result.reason === "no_llm_key" ? 402 : 422;
  return NextResponse.json(result, { status });
}

/** Real bearer resolver: `guardApiRequest` already implements the exact wst
 *  bearer → org resolution `/api/v1/build/deploy` uses (401 on missing/
 *  invalid bearer, 400 on the legacy x-org-id path, 429 on rate limit) —
 *  reused verbatim, not reimplemented. */
async function resolveBearer(request: Request): Promise<ResolveBearerResult> {
  const guard = await guardApiRequest(request);
  if ("error" in guard && guard.error) return { error: guard.error };
  if (!("orgId" in guard) || !guard.orgId) {
    return { error: NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 }) };
  }
  return { orgId: guard.orgId };
}

/** Real runImprove: assemble T9's real deps (BYOK-gated) and delegate to T8's
 *  orchestrator — identical composition to `runImproveAction` (actions.ts),
 *  minus the session org resolution. */
async function runImprove(agentId: string, orgId: string) {
  const built = await buildImproveDeps({ orgId, agentId });
  if (!built.ok) {
    return { ok: false as const, reason: "no_llm_key" as const, message: built.message };
  }
  return runImproveForAgent({ agentId, orgId }, built.deps);
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleImproveRequest(request, { resolveBearer, runImprove });
}
