// In-memory AgentDraftStore — the contract twin (same pattern as
// lib/workflow/approvals/storage-memory.ts). Tests run against THIS; the
// drizzle impl must keep byte-equivalent semantics.
import type { AgentActionDraftRow } from "@/db/schema/agent-action-drafts";
import { MAX_DRAFTS_PER_CONVERSATION } from "./policy";
import type {
  AgentDraftStore,
  FileDraftInput,
  FileDraftResult,
  ResolveDraftInput,
} from "./types";

export function createMemoryDraftStore(): AgentDraftStore {
  const rows: AgentActionDraftRow[] = [];
  let seq = 0;

  return {
    async fileDraft(input: FileDraftInput): Promise<FileDraftResult> {
      const inConversation = rows.filter(
        (r) => r.orgId === input.orgId && r.conversationId === input.conversationId,
      );
      const pendingDupe = inConversation.find(
        (r) => r.stepAction === input.stepAction && r.status === "pending",
      );
      if (pendingDupe) return { outcome: "deduped", draftId: pendingDupe.id };
      if (inConversation.length >= MAX_DRAFTS_PER_CONVERSATION) {
        return { outcome: "capped" };
      }
      const row: AgentActionDraftRow = {
        id: `draft-${++seq}`,
        orgId: input.orgId,
        agentId: input.agentId,
        conversationId: input.conversationId,
        stepAction: input.stepAction,
        kind: input.kind,
        title: input.title,
        content: input.content,
        tier: input.tier,
        status: "pending",
        resolvedByUserId: null,
        resolvedAt: null,
        createdAt: new Date(),
      };
      rows.push(row);
      return { outcome: "filed", draftId: row.id };
    },

    async resolveDraft(input: ResolveDraftInput) {
      const row = rows.find(
        (r) => r.id === input.draftId && r.orgId === input.orgId && r.status === "pending",
      );
      if (!row) return null;
      row.status = input.status;
      row.resolvedByUserId = input.userId;
      row.resolvedAt = new Date();
      return row;
    },

    async listDrafts({ orgId, status }) {
      return rows
        .filter((r) => r.orgId === orgId && (status ? r.status === status : true))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async countPending(orgId: string) {
      return rows.filter((r) => r.orgId === orgId && r.status === "pending").length;
    },
  };
}
