// POST /api/v1/recordings/compile-agent
//
// The post-CLAIM step: once an operator has signed up/in and lands back on
// /record?claimed=1, this route compiles the session's recapped FlowModel
// into a real, draft agent_templates row.
//
// Auth is BOTH the session bearer token (proves "you're the one who
// recorded this") AND an authenticated operator session (getOrgId() —
// proves "you're signed in", same seam as workspace/media/upload/route.ts).
// Neither alone is enough — see resolveCompileAgentGate's header comment.
// orgId is ALWAYS the authed caller's (getOrgId()), never taken from the
// request body.
//
// `approve: true` in the body performs the recapped → approved transition
// inline (see the plan: "add approve:true handling to this route... keeping
// one route" rather than a second endpoint) before compiling.
//
// No LLM call happens in this route — flowModelToBundle (Task 11) is pure/
// deterministic, so there's no anonymous-spend guard to wire here.

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { recordingSessions, workflowRecordings } from "@/db/schema/recordings";
import { isRecordToAgentOn } from "@/lib/recordings/policy";
import { isDraftApprovalsOn } from "@/lib/agent-drafts/policy";
import { resolveCompileAgentGate, stampClaimedCompileOnboarded } from "@/lib/recordings/route-guards";
import { findSessionByToken } from "@/lib/recordings/session-store";
import { flowModelToBundle } from "@/lib/recordings/compile-agent";
import type { FlowModel, WorkflowTrace } from "@/lib/recordings/trace-schema";
import { getCurrentUser, getOrgId } from "@/lib/auth/helpers";
import { fillAllBindingTools } from "@/lib/agents/mcp/discover-vetted-tools";
import { markOperatorOnboarded } from "@/lib/web-onboarding/mark-operator-onboarded";
import { logEvent } from "@/lib/observability/log";
import {
  createAgentTemplate,
  updateAgentTemplate,
  type TemplateBlueprintPatch,
} from "@/lib/agent-templates/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseBody(body: unknown): { sessionId: string; token: string; approve: boolean } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const sessionId = typeof b.session_id === "string" ? b.session_id : "";
  const token = typeof b.token === "string" ? b.token : "";
  const approve = b.approve === true;
  if (!sessionId || !token) return null;
  return { sessionId, token, approve };
}

export async function POST(request: Request): Promise<Response> {
  const env = { SF_RECORD_TO_AGENT: process.env.SF_RECORD_TO_AGENT };
  if (!isRecordToAgentOn(env)) {
    return new Response(null, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const parsed = parseBody(rawBody);
  if (!parsed) {
    return NextResponse.json({ error: "session_id and token are required" }, { status: 400 });
  }

  // Both auth factors are resolved BEFORE the gate — the gate itself is a
  // pure decision function so it (and every rejection path) is unit-tested
  // with plain fakes (see compile-agent-route-authz.spec.ts).
  const orgId = await getOrgId().catch(() => null);
  const tokenEnv = { AUTH_SECRET: process.env.AUTH_SECRET, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET };
  const session = await findSessionByToken(db, parsed.token, tokenEnv);

  const gate = resolveCompileAgentGate({
    env,
    orgId,
    rawToken: parsed.token,
    sessionIdFromBody: parsed.sessionId,
    session: session ? { id: session.id, status: session.status } : null,
    approve: parsed.approve,
  });

  if (gate.kind === "not_found") return new Response(null, { status: 404 });
  if (gate.kind === "unauthorized") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (gate.kind === "conflict") return NextResponse.json({ error: "session_not_ready" }, { status: 409 });

  // gate.kind === "ok" here — session is non-null (resolveCompileAgentGate
  // requires session.id === sessionIdFromBody to reach "ok").
  const sessionRow = session!;

  // Record v3 (S4b root fix) — every "ok" outcome above already required a
  // non-null orgId, so this IS the claimed-compile path: an operator who
  // signed up/in and is compiling the session they recorded. Without this
  // stamp, record-claimers stay soulCompleted=false forever (only
  // /claim-build's link-owner route stamped it before), so proxy.ts's
  // onboarding gate 307s them to /clients/new on every future dashboard
  // link — the exact bug this slice fixes. Soft-fail: never blocks the
  // compile response itself.
  const currentUser = await getCurrentUser().catch(() => null);
  await stampClaimedCompileOnboarded(orgId!, currentUser?.id ?? null, markOperatorOnboarded, (error) => {
    logEvent(
      "compile_agent_onboarding_stamp_failed",
      { error: error instanceof Error ? error.message : String(error) },
      { request, orgId: orgId!, severity: "warn" },
    );
  });

  if (gate.shouldApprove) {
    await db
      .update(recordingSessions)
      .set({ status: "approved", updatedAt: new Date() })
      .where(eq(recordingSessions.id, sessionRow.id));
  }

  const flowModel = sessionRow.flowModel as FlowModel | null;
  if (!flowModel) {
    return NextResponse.json({ error: "no_flow_model" }, { status: 422 });
  }

  const tracedRecordings = await db
    .select()
    .from(workflowRecordings)
    .where(eq(workflowRecordings.sessionId, sessionRow.id));
  const recordings = tracedRecordings
    .filter((r) => r.status === "traced" && r.trace)
    .map((r) => ({ label: r.label, trace: r.trace as WorkflowTrace }));

  const { bundle, scenarios, warnings } = flowModelToBundle({
    model: flowModel,
    recordings,
    draftApprovals: isDraftApprovalsOn({ SF_DRAFT_APPROVALS: process.env.SF_DRAFT_APPROVALS }),
  });

  // Widen any never-discovered composio binding's enabledTools with real
  // tools before the first persist — catalog defaults, then live discovery
  // for non-catalog toolkits (youtube, synthflow_ai, …). Never throws (T1
  // contract) — no new failure mode is introduced here.
  bundle.blueprint.connectors = (
    await fillAllBindingTools(orgId!, bundle.blueprint.connectors)
  ).connectors;

  const template = await createAgentTemplate({
    builderOrgId: orgId!,
    name: bundle.name,
    type: "chat_assistant",
  });
  const saved = await updateAgentTemplate({
    id: template.id,
    patch: bundle.blueprint as unknown as TemplateBlueprintPatch,
  });
  if (!saved.ok) {
    return NextResponse.json({ error: saved.error }, { status: 422 });
  }

  const redSteps = flowModel.coverage.filter((c) => c.tier === "red").length;

  await db
    .update(recordingSessions)
    .set({
      orgId: orgId!,
      agentTemplateId: template.id,
      derivedScenarios: scenarios,
      status: "compiled",
      updatedAt: new Date(),
    })
    .where(eq(recordingSessions.id, sessionRow.id));

  return NextResponse.json({
    ok: true,
    template_id: template.id,
    name: saved.template.name,
    warnings,
    red_steps: redSteps,
  });
}
