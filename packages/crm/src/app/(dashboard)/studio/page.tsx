import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceListings } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { listManagedOrganizations } from "@/lib/billing/orgs";
import { StudioPageClient } from "./studio-page-client";

export default async function CreatorStudioPage() {
  const orgId = await getOrgId();

  if (!orgId) {
    return null;
  }

  const [listings, workspaces] = await Promise.all([
    db
      .select({
        id: marketplaceListings.id,
        name: marketplaceListings.name,
      })
      .from(marketplaceListings)
      .where(eq(marketplaceListings.creatorOrgId, orgId))
      .orderBy(desc(marketplaceListings.updatedAt)),
    listManagedOrganizations(),
  ]);

  const activeWorkspace = workspaces.find((workspace) => workspace.id === orgId) ?? workspaces[0] ?? null;

  return (
    <StudioPageClient
      activeWorkspaceId={activeWorkspace?.id ?? orgId}
      activeWorkspaceName={activeWorkspace?.name ?? "Active Workspace"}
      listings={listings}
      workspaces={workspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      }))}
    />
  );
}
