import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { resolveV1Identity } from "@/lib/auth/v1-identity";
import { listManagedOrganizations } from "@/lib/billing/orgs";

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveV1Identity(request);
  if (!auth.ok) return auth.response;
  const { identity } = auth;

  const { id } = await params;
  const workspaceId = id.trim();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace id is required." }, { status: 400 });
  }

  if (identity.kind === "workspace") {
    if (workspaceId !== identity.orgId) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    const [row] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        createdAt: organizations.createdAt,
        ownerId: organizations.ownerId,
        parentUserId: organizations.parentUserId,
        soulId: organizations.soulId,
      })
      .from(organizations)
      .where(eq(organizations.id, workspaceId))
      .limit(1);
    if (!row) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }
    return NextResponse.json({
      status: "ok",
      workspace: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        subdomain: `${row.slug}.${WORKSPACE_BASE_DOMAIN}`,
        created_at: new Date(row.createdAt).toISOString(),
        owner_id: row.ownerId,
        parent_user_id: row.parentUserId,
        soul_id: row.soulId,
      },
    });
  }

  const managedWorkspaces = await listManagedOrganizations(identity.userId);
  const workspace = managedWorkspaces.find((entry) => entry.id === workspaceId);

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
  }

  return NextResponse.json({
    status: "ok",
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      subdomain: `${workspace.slug}.${WORKSPACE_BASE_DOMAIN}`,
      created_at: new Date(workspace.createdAt).toISOString(),
      contact_count: workspace.contactCount,
      soul_id: workspace.soulId,
      owner_id: workspace.ownerId,
      parent_user_id: workspace.parentUserId,
    },
  });
}
