import { NextResponse } from "next/server";
import {
  requireManagedWorkspaceForUser,
  resolveAuthenticatedBuilderUserId,
} from "@/lib/openclaw/self-service";
import { generateVerticalPack } from "@/lib/openclaw/vertical-packs";

type GenerateBody = {
  workspaceId?: unknown;
  description?: unknown;
  vertical?: unknown;
};

export async function POST(request: Request) {
  try {
    const userId = await resolveAuthenticatedBuilderUserId(request.headers);
    const body = (await request.json().catch(() => ({}))) as GenerateBody;

    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const vertical = typeof body.vertical === "string" ? body.vertical.trim() : undefined;

    if (!workspaceId || !description) {
      return NextResponse.json({ error: "workspaceId and description are required." }, { status: 400 });
    }

    const workspace = await requireManagedWorkspaceForUser(workspaceId, userId);

    const pack = await generateVerticalPack({
      orgId: workspace.id,
      userId,
      description,
      vertical,
    });

    return NextResponse.json({ ok: true, pack });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate vertical pack.";
    const status =
      message.includes("Unauthorized") || message.includes("Invalid x-seldon-api-key")
        ? 401
        : message.includes("not found")
          ? 404
          : message.includes("required")
            ? 400
            : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
