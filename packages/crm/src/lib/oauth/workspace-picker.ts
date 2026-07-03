import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, organizations } from "@/db/schema";

export interface WorkspaceOption {
  orgId: string;
  name: string;
  role: string;
}

/**
 * Every workspace a user can consent to grant OAuth access for — the
 * consent screen's picker (design doc §2.5). Defaults the CALLER's
 * pre-selection to session.user.orgId (the currently-active workspace);
 * this function just returns the full list, selection logic lives in the
 * page component.
 */
export async function listWorkspacesForUser(userId: string): Promise<WorkspaceOption[]> {
  const rows = await db
    .select({ orgId: orgMembers.orgId, name: organizations.name, role: orgMembers.role })
    .from(orgMembers)
    .innerJoin(organizations, eq(organizations.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, userId));
  return rows;
}
