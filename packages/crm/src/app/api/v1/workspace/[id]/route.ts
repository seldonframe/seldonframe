import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listManagedOrganizations } from "@/lib/billing/orgs";

function resolveUserIdFromSeldonApiKey(headers: Headers): string | null {
  const providedKey = headers.get("x-seldon-api-key")?.trim();
  if (!providedKey) {
    return null;
  }

  const configuredPairs = (process.env.SELDON_BUILDER_API_KEYS ?? "")
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const separator = pair.indexOf(":");
      if (separator < 1) {
        return null;
      }

      const key = pair.slice(0, separator).trim();
      const userId = pair.slice(separator + 1).trim();
      if (!key || !userId) {
        return null;
      }

      return { key, userId };
    })
    .filter((entry): entry is { key: string; userId: string } => Boolean(entry));

  const match = configuredPairs.find((entry) => entry.key === providedKey);
  return match?.userId ?? null;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const apiKeyUserId = resolveUserIdFromSeldonApiKey(request.headers);
  const hasApiKeyHeader = Boolean(request.headers.get("x-seldon-api-key")?.trim());

  const session = apiKeyUserId ? null : await auth();
  const userId = apiKeyUserId ?? session?.user?.id ?? null;

  if (hasApiKeyHeader && !apiKeyUserId) {
    return NextResponse.json({ error: "Invalid x-seldon-api-key." }, { status: 401 });
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const workspaceId = id.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace id is required." }, { status: 400 });
  }

  const managedWorkspaces = await listManagedOrganizations(userId);
  const workspace = managedWorkspaces.find((entry) => entry.id === workspaceId);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const workspaceBaseDomain = process.env.WORKSPACE_BASE_DOMAIN?.trim() || "seldonframe.app";

  return NextResponse.json({
    status: "ok",
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      subdomain: `${workspace.slug}.${workspaceBaseDomain}`,
      created_at: new Date(workspace.createdAt).toISOString(),
      contact_count: workspace.contactCount,
      soul_id: workspace.soulId,
      owner_id: workspace.ownerId,
      parent_user_id: workspace.parentUserId,
    },
  });
}
