// Prod AgentDraftStore. Idempotency truth lives in the DB:
//  - fileDraft: INSERT ... ON CONFLICT (the pending-only unique partial
//    index agent_action_drafts_pending_step_uniq) DO NOTHING; on conflict,
//    re-select the surviving pending row (idempotent-success, never an error).
//  - resolveDraft: single CAS UPDATE ... WHERE status='pending' RETURNING *.
// The cap check (count → insert) is not fully race-proof and that's accepted:
// turns within one conversation are effectively serialized; the hard
// guarantee (no duplicate pending draft) is the index's job, not the cap's.
import { and, count, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { agentActionDrafts } from "@/db/schema/agent-action-drafts";
import { MAX_DRAFTS_PER_CONVERSATION } from "./policy";
import type {
  AgentDraftStore,
  FileDraftInput,
  FileDraftResult,
  ResolveDraftInput,
} from "./types";

export function createDrizzleDraftStore(dbi: typeof db = db): AgentDraftStore {
  return {
    async fileDraft(input: FileDraftInput): Promise<FileDraftResult> {
      const [{ total }] = await dbi
        .select({ total: count() })
        .from(agentActionDrafts)
        .where(
          and(
            eq(agentActionDrafts.orgId, input.orgId),
            eq(agentActionDrafts.conversationId, input.conversationId),
          ),
        );
      if (Number(total) >= MAX_DRAFTS_PER_CONVERSATION) return { outcome: "capped" };

      const inserted = await dbi
        .insert(agentActionDrafts)
        .values({
          orgId: input.orgId,
          agentId: input.agentId,
          conversationId: input.conversationId,
          stepAction: input.stepAction,
          kind: input.kind,
          title: input.title,
          content: input.content,
          tier: input.tier,
        })
        .onConflictDoNothing({
          target: [
            agentActionDrafts.orgId,
            agentActionDrafts.conversationId,
            agentActionDrafts.stepAction,
          ],
          // Installed drizzle-orm@0.45.1's onConflictDoNothing config is
          // { target?, where? } — no separate targetWhere. `where` here IS
          // the target's partial-index predicate (see insert.js: `(${target})
          // ${where} do nothing`), so this produces exactly
          // `ON CONFLICT (org_id, conversation_id, step_action)
          //  WHERE status = 'pending' DO NOTHING` — the plan's documented
          // fallback for a drizzle version without targetWhere.
          where: sql`status = 'pending'`,
        })
        .returning({ id: agentActionDrafts.id });

      if (inserted.length > 0) return { outcome: "filed", draftId: inserted[0]!.id };

      const [existing] = await dbi
        .select({ id: agentActionDrafts.id })
        .from(agentActionDrafts)
        .where(
          and(
            eq(agentActionDrafts.orgId, input.orgId),
            eq(agentActionDrafts.conversationId, input.conversationId),
            eq(agentActionDrafts.stepAction, input.stepAction),
            eq(agentActionDrafts.status, "pending"),
          ),
        )
        .limit(1);
      // Conflict fired but the pending row vanished between statements (it
      // resolved concurrently) — retry the insert once; if that still
      // conflicts, surface deduped-with-unknown-id as capped-safe fallback.
      if (!existing) {
        const retried = await dbi
          .insert(agentActionDrafts)
          .values({
            orgId: input.orgId,
            agentId: input.agentId,
            conversationId: input.conversationId,
            stepAction: input.stepAction,
            kind: input.kind,
            title: input.title,
            content: input.content,
            tier: input.tier,
          })
          .onConflictDoNothing({
            target: [
              agentActionDrafts.orgId,
              agentActionDrafts.conversationId,
              agentActionDrafts.stepAction,
            ],
            where: sql`status = 'pending'`,
          })
          .returning({ id: agentActionDrafts.id });
        if (retried.length > 0) return { outcome: "filed", draftId: retried[0]!.id };
        return { outcome: "capped" };
      }
      return { outcome: "deduped", draftId: existing.id };
    },

    async resolveDraft(input: ResolveDraftInput) {
      const updated = await dbi
        .update(agentActionDrafts)
        .set({
          status: input.status,
          resolvedByUserId: input.userId,
          resolvedAt: new Date(),
        })
        .where(
          and(
            eq(agentActionDrafts.id, input.draftId),
            eq(agentActionDrafts.orgId, input.orgId),
            eq(agentActionDrafts.status, "pending"),
          ),
        )
        .returning();
      return updated[0] ?? null;
    },

    async listDrafts({ orgId, status }) {
      const where = status
        ? and(eq(agentActionDrafts.orgId, orgId), eq(agentActionDrafts.status, status))
        : eq(agentActionDrafts.orgId, orgId);
      return dbi
        .select()
        .from(agentActionDrafts)
        .where(where)
        .orderBy(desc(agentActionDrafts.createdAt))
        .limit(200);
    },

    async countPending(orgId: string) {
      const [{ total }] = await dbi
        .select({ total: count() })
        .from(agentActionDrafts)
        .where(
          and(
            eq(agentActionDrafts.orgId, orgId),
            eq(agentActionDrafts.status, "pending"),
          ),
        );
      return Number(total);
    },
  };
}
