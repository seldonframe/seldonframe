// Store contract for agent_action_drafts. Two implementations mirror
// lib/workflow/approvals: storage-memory (contract tests) and
// storage-drizzle (prod). Semantics that MUST stay identical across the two:
// pending-only dedupe per (org, conversation, step), all-statuses cap,
// CAS resolve, org scoping on every read/write.
import type {
  AgentActionDraftRow,
  AgentDraftContent,
  AgentDraftKind,
  AgentDraftStatus,
} from "@/db/schema/agent-action-drafts";

export type FileDraftInput = {
  orgId: string;
  agentId: string;
  conversationId: string;
  stepAction: string;
  kind: AgentDraftKind;
  title: string;
  content: AgentDraftContent;
  tier: "yellow" | "red";
};

export type FileDraftResult =
  | { outcome: "filed"; draftId: string }
  | { outcome: "deduped"; draftId: string }
  | { outcome: "capped" };

export type ResolveDraftInput = {
  orgId: string;
  draftId: string;
  status: "approved" | "dismissed";
  userId: string;
};

export interface AgentDraftStore {
  fileDraft(input: FileDraftInput): Promise<FileDraftResult>;
  /** null = CAS lost, not found, or wrong org — caller surfaces a conflict. */
  resolveDraft(input: ResolveDraftInput): Promise<AgentActionDraftRow | null>;
  listDrafts(input: { orgId: string; status?: AgentDraftStatus }): Promise<AgentActionDraftRow[]>;
  countPending(orgId: string): Promise<number>;
}
