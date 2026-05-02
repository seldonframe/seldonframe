import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import {
  DEFAULT_PERSONALITY,
  readPersonalityFromSettings,
  type CRMPersonality,
} from "@/lib/crm/personality";

/**
 * Server-side: resolve the active workspace's CRMPersonality from
 * `organizations.settings.crmPersonality`. Falls back to the default
 * (coaching) personality when no active org, no settings entry, or a
 * shape mismatch — every admin surface can rely on a non-null return.
 *
 * Workspaces created before the personality system landed have no
 * `settings.crmPersonality`; they transparently get DEFAULT_PERSONALITY.
 */
export async function getPersonality(): Promise<CRMPersonality> {
  try {
    const orgId = await getOrgId();
    if (!orgId) return DEFAULT_PERSONALITY;

    const [row] = await db
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!row) return DEFAULT_PERSONALITY;
    const stored = (row.settings as Record<string, unknown> | null)?.crmPersonality;
    return readPersonalityFromSettings(stored);
  } catch {
    return DEFAULT_PERSONALITY;
  }
}
