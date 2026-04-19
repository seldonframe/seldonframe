import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations, users } from "@/db/schema";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { listManagedOrganizations } from "@/lib/billing/orgs";
import { demoApiBlockedResponse, isDemoReadonly } from "@/lib/demo/server";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (isDemoReadonly()) {
    return demoApiBlockedResponse();
  }

  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  // Destructive action — require a user identity. Workspace bearer tokens
  // are intentionally denied here: anonymous workspaces cannot delete themselves,
  // and a bearer minted for one workspace should not delete its peer.
  if (identity.kind !== "user") {
    return NextResponse.json(
      { error: "Deleting workspaces requires a user session or SELDONFRAME_API_KEY." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const targetOrgId = id.trim();

  if (!targetOrgId) {
    return NextResponse.json({ error: "Workspace id is required." }, { status: 400 });
  }

  const [caller] = await db
    .select({ orgId: users.orgId })
    .from(users)
    .where(eq(users.id, identity.userId))
    .limit(1);

  if (!caller?.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (targetOrgId === caller.orgId) {
    return NextResponse.json({ error: "Cannot delete your primary workspace." }, { status: 400 });
  }

  const managedOrgs = await listManagedOrganizations(identity.userId);
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
