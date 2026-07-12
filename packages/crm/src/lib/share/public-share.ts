// Agent setup mode slice (T5) — the public /a/[slug] route's ONLY data
// dependency. Resolves the org/template from the share_cards row itself
// (the slug is the capability token — NEVER from session/auth), returning
// only what's safe to render publicly: the agent name + the already-
// scrubbed step labels. L-18: this module must never import a
// dashboard/client-only chain — db + schema + drizzle only.

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shareCards, type ShareCardStep } from "@/db/schema/share-cards";
import { agentTemplates } from "@/db/schema/agent-templates";

export type PublicShareCard = {
  agentName: string;
  steps: ShareCardStep[];
};

/** Org-anonymous, auth-free lookup by slug — the row's existence IS the
 *  publish state (see share-card-actions.ts), so a missing row is a
 *  perfectly normal "unpublished/never existed" case, not an error. */
export async function getPublicShareCard(slug: string): Promise<PublicShareCard | null> {
  const trimmed = slug.trim();
  if (!trimmed) return null;

  const [row] = await db
    .select({
      sanitizedSteps: shareCards.sanitizedSteps,
      agentName: agentTemplates.name,
    })
    .from(shareCards)
    .innerJoin(agentTemplates, eq(agentTemplates.id, shareCards.templateId))
    .where(eq(shareCards.slug, trimmed))
    .limit(1);

  if (!row) return null;
  return { agentName: row.agentName, steps: row.sanitizedSteps ?? [] };
}
