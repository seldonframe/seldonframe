import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";
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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

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
  const targetOrgId = id.trim();

  if (!targetOrgId) {
    return NextResponse.json({ error: "Workspace id is required." }, { status: 400 });
  }

  const [caller] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!caller?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (targetOrgId === caller.orgId) {
    return NextResponse.json({ error: "Cannot delete your primary workspace." }, { status: 400 });
  }

  const managedOrgs = await listManagedOrganizations(userId);
  const targetOrg = managedOrgs.find((org) => org.id === targetOrgId);

  if (!targetOrg) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  const [deleted] = await db
    .delete(organizations)
    .where(and(eq(organizations.id, targetOrgId)))
    .returning({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
    });

  if (!deleted) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: "deleted",
    workspace: deleted,
  });
}
