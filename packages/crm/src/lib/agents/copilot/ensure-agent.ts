// Hidden per-org SeldonChat agent bootstrap (win-ladder P0/Task 2).
//
// The win-ladder plan's SeldonChat dock (Phase A) needs a real `agents` row
// to run through the existing agent runtime (executeTurn) so the copilot
// gets the same conversation/turn/validator plumbing every other agent
// gets — for free. This module get-or-creates exactly ONE such row per org
// plus ONE agent_conversations row per (agent, operator user id), and is
// the ONLY writer that should ever create a "workspace_copilot" agent.
//
// Schema note: the plan's spec language calls the discriminator column
// `type`, but packages/crm/src/db/schema/agents.ts has no `type` column —
// the existing discriminator is `archetype` (text, not-null), used exactly
// this way by every other kind ("website-chatbot", "voice-receptionist",
// "sms-followup-bot"). We reuse `archetype: "workspace_copilot"` rather
// than adding a new column — no migration, byte-for-byte consistent with
// how every other archetype is stored.
//
// Conversation dedupe: agent_conversations has no dedicated "external key"
// column either. The closest fit is `anonymousSessionId` (text, indexed) —
// the same column the public turn route (api/v1/public/agent/[slug]/turn)
// uses to carry a caller-stable session id. We store `copilot:<userId>`
// there so one operator always resumes the same copilot conversation.
//
// DI: all four deps are injected (defaultDeps below wires the real DB) so
// this module's own logic — get-or-create semantics, the per-user
// conversation key — is testable with zero DB access.

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { agents, agentConversations, type AgentBlueprint } from "@/db/schema";
import { COPILOT_CAPABILITY } from "@/lib/agents/copilot/tools";

export const COPILOT_AGENT_NAME = "SeldonChat";
export const COPILOT_ARCHETYPE = "workspace_copilot";

/** Builds the `anonymousSessionId` external key a copilot conversation is
 *  keyed on for a given operator user id. Exported so callers (and other
 *  ladder-plan tasks) can look up the same conversation without re-deriving
 *  the format. */
export function copilotConversationExternalKey(userId: string): string {
  return `copilot:${userId}`;
}

type AgentRow = { id: string };
type ConversationRow = { id: string };

export type EnsureCopilotAgentDeps = {
  findAgent: (orgId: string) => Promise<AgentRow | undefined>;
  createAgent: (input: {
    orgId: string;
    name: string;
    archetype: string;
    blueprint: Partial<AgentBlueprint>;
  }) => Promise<AgentRow>;
  findConversation: (input: {
    agentId: string;
    externalKey: string;
  }) => Promise<ConversationRow | undefined>;
  createConversation: (input: {
    agentId: string;
    orgId: string;
    externalKey: string;
  }) => Promise<ConversationRow>;
};

async function defaultFindAgent(orgId: string): Promise<AgentRow | undefined> {
  const [row] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.orgId, orgId), eq(agents.archetype, COPILOT_ARCHETYPE)))
    .limit(1);
  return row;
}

async function defaultCreateAgent(input: {
  orgId: string;
  name: string;
  archetype: string;
  blueprint: Partial<AgentBlueprint>;
}): Promise<AgentRow> {
  const [created] = await db
    .insert(agents)
    .values({
      orgId: input.orgId,
      name: input.name,
      // Slug is per-org unique; "seldonchat" is stable and never surfaced
      // (the agent is invisible everywhere users see agents — see
      // list-filter comments in store.ts/activation.ts).
      slug: "seldonchat",
      channel: "web_chat",
      archetype: input.archetype,
      blueprint: input.blueprint as AgentBlueprint,
      currentVersion: 1,
      status: "live",
    })
    .returning({ id: agents.id });
  if (!created) {
    throw new Error("ensureWorkspaceCopilotAgent: agent insert returned no row");
  }
  return created;
}

async function defaultFindConversation(input: {
  agentId: string;
  externalKey: string;
}): Promise<ConversationRow | undefined> {
  const [row] = await db
    .select({ id: agentConversations.id })
    .from(agentConversations)
    .where(
      and(
        eq(agentConversations.agentId, input.agentId),
        eq(agentConversations.anonymousSessionId, input.externalKey),
      ),
    )
    .limit(1);
  return row;
}

async function defaultCreateConversation(input: {
  agentId: string;
  orgId: string;
  externalKey: string;
}): Promise<ConversationRow> {
  const [created] = await db
    .insert(agentConversations)
    .values({
      agentId: input.agentId,
      agentVersion: 1,
      orgId: input.orgId,
      anonymousSessionId: input.externalKey,
      status: "active",
    })
    .returning({ id: agentConversations.id });
  if (!created) {
    throw new Error(
      "ensureWorkspaceCopilotAgent: conversation insert returned no row",
    );
  }
  return created;
}

export const defaultDeps: EnsureCopilotAgentDeps = {
  findAgent: defaultFindAgent,
  createAgent: defaultCreateAgent,
  findConversation: defaultFindConversation,
  createConversation: defaultCreateConversation,
};

export type EnsureCopilotAgentResult = {
  agentId: string;
  conversationIdFor: (userId: string) => Promise<string>;
};

/** Get-or-create the ONE hidden SeldonChat agent row for `orgId`, plus a
 *  lazy per-user conversation getter. Idempotent: safe to call on every
 *  copilot turn. */
export async function ensureWorkspaceCopilotAgent(
  orgId: string,
  deps: EnsureCopilotAgentDeps = defaultDeps,
): Promise<EnsureCopilotAgentResult> {
  const existing = await deps.findAgent(orgId);
  const agent =
    existing ??
    (await deps.createAgent({
      orgId,
      name: COPILOT_AGENT_NAME,
      archetype: COPILOT_ARCHETYPE,
      blueprint: { capabilities: [COPILOT_CAPABILITY] },
    }));

  return {
    agentId: agent.id,
    conversationIdFor: async (userId: string) => {
      const externalKey = copilotConversationExternalKey(userId);
      const existingConversation = await deps.findConversation({
        agentId: agent.id,
        externalKey,
      });
      if (existingConversation) return existingConversation.id;
      const created = await deps.createConversation({
        agentId: agent.id,
        orgId,
        externalKey,
      });
      return created.id;
    },
  };
}
