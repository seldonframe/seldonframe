import { NextResponse } from "next/server";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { requireManagedWorkspaceForUser } from "@/lib/openclaw/self-service";
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
    const auth = await resolveV1Identity(request);
    if (!auth.ok) return auth.response;
    const { identity } = auth;

    const body = (await request.json().catch(() => ({}))) as InstallBody;

    const requestedWorkspaceId =
      typeof body.workspaceId === "string" ? body.workspaceId.trim() : "";
    const packId = typeof body.packId === "string" ? body.packId.trim() : "";
    const inlinePack = body.pack && typeof body.pack === "object" ? (body.pack as VerticalPack) : null;

    let resolvedWorkspaceId = requestedWorkspaceId;

    if (identity.kind === "workspace") {
      // Bearer token is scoped to a single workspace. If the caller omits
      // workspaceId, use the bearer's workspace. If they pass a different one, deny.
      if (!resolvedWorkspaceId) {
        resolvedWorkspaceId = identity.orgId;
      } else if (resolvedWorkspaceId !== identity.orgId) {
        return NextResponse.json(
          { error: "Bearer token does not authorize this workspace." },
          { status: 403 }
        );
      }
    }

    if (!resolvedWorkspaceId || (!packId && !inlinePack)) {
      return NextResponse.json(
        { error: "workspaceId and either packId or pack (inline) are required." },
        { status: 400 }
      );
    }

    // For user identity, verify ownership via existing helper.
    // For workspace bearer, the bearer IS the authorization — no extra check needed.
    let workspaceIdForInstall = resolvedWorkspaceId;
    if (identity.kind === "user") {
      const workspace = await requireManagedWorkspaceForUser(resolvedWorkspaceId, identity.userId);
      workspaceIdForInstall = workspace.id;
    }

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

    const outcome = await installVerticalPack(workspaceIdForInstall, pack);
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
