import { NextResponse } from "next/server";
import {
  requireManagedWorkspaceForUser,
  resolveAuthenticatedBuilderUserId,
} from "@/lib/openclaw/self-service";
import {
  getVerticalPackById,
  installVerticalPack,
  type VerticalPack,
} from "@/lib/openclaw/vertical-packs";

type InstallBody = {
  workspaceId?: unknown;
  packId?: unknown;
  pack?: unknown;
};

export async function POST(request: Request) {
  try {
    const userId = await resolveAuthenticatedBuilderUserId(request.headers);
    const body = (await request.json().catch(() => ({}))) as InstallBody;

    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const packId = typeof body.packId === "string" ? body.packId.trim() : "";
    const inlinePack = body.pack && typeof body.pack === "object" ? (body.pack as VerticalPack) : null;

    if (!workspaceId || (!packId && !inlinePack)) {
      return NextResponse.json(
        { error: "workspaceId and either packId or pack (inline) are required." },
        { status: 400 }
      );
    }

    const workspace = await requireManagedWorkspaceForUser(workspaceId, userId);

    let pack: VerticalPack | null = inlinePack;
    if (!pack && packId) {
      pack = await getVerticalPackById(packId);
      if (!pack) {
        return NextResponse.json({ error: `Vertical pack ${packId} not found.` }, { status: 404 });
      }
    }

    if (!pack) {
      return NextResponse.json({ error: "Pack could not be resolved." }, { status: 400 });
    }

    const outcome = await installVerticalPack(workspace.id, pack);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to install vertical pack.";
    const status =
      message.includes("Unauthorized") || message.includes("Invalid x-seldon-api-key")
        ? 401
        : message.includes("not found")
          ? 404
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
