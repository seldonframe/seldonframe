import { NextResponse } from "next/server";
import { resolveAuthenticatedBuilderUserId } from "@/lib/openclaw/self-service";
import { propagateSeldonChangeToWorkspaces } from "@/lib/openclaw/orchestration";

type PropagateBody = {
  workspaceIds?: unknown;
  description?: unknown;
  sessionIdPrefix?: unknown;
};

export async function POST(request: Request) {
  try {
    const userId = await resolveAuthenticatedBuilderUserId(request.headers);
    const body = (await request.json().catch(() => ({}))) as PropagateBody;

    const workspaceIds = Array.isArray(body.workspaceIds)
      ? body.workspaceIds.filter((id): id is string => typeof id === "string")
      : [];
    const description = typeof body.description === "string" ? body.description : "";
    const sessionIdPrefix = typeof body.sessionIdPrefix === "string" ? body.sessionIdPrefix : undefined;

    if (workspaceIds.length === 0 || !description.trim()) {
      return NextResponse.json({ error: "workspaceIds and description are required." }, { status: 400 });
    }

    const outcome = await propagateSeldonChangeToWorkspaces(userId, {
      workspaceIds,
      description,
      sessionIdPrefix,
    });

    const status = outcome.succeeded === 0 ? 207 : outcome.failed === 0 ? 200 : 207;
    return NextResponse.json({ ok: outcome.failed === 0, ...outcome }, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Propagation failed.";
    const status = message.includes("Unauthorized") || message.includes("Invalid x-seldon-api-key") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
