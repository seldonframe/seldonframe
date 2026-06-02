// Voice Phase 2 — best-effort transcript persistence helpers.
//
// Each function wraps its DB work in try/catch and NEVER throws. On failure
// it calls logEvent("voice_call_transcript_persist_error", { error }) and
// returns null/void so a DB hiccup never kills an in-progress call.
//
// All DB access is behind injectable `deps` so unit tests run without a real
// Postgres (repo convention — see realtime-tools.spec.ts).

import { logEvent } from "@/lib/observability/log";

// ─── dep types ──────────────────────────────────────────────────────────────

export type StartConversationDeps = {
  /** Insert an agentConversations row and return the new id. */
  insertConversation: (values: Record<string, unknown>) => Promise<string>;
};

export type AppendTurnDeps = {
  /** Insert an agentTurns row. */
  insertTurn: (values: Record<string, unknown>) => Promise<void>;
};

export type EndConversationDeps = {
  /** Update an agentConversations row by id. */
  updateConversation: (
    conversationId: string,
    patch: Record<string, unknown>,
  ) => Promise<void>;
};

// ─── default DB-backed deps (lazy — never imported in unit tests) ────────────

function buildDefaultStartDeps(): StartConversationDeps {
  return {
    insertConversation: async (values) => {
      const { db } = await import("@/db");
      const { agentConversations } = await import("@/db/schema/agents");
      const [row] = await db
        .insert(agentConversations)
        .values(values as unknown as typeof agentConversations.$inferInsert)
        .returning({ id: agentConversations.id });
      if (!row) throw new Error("agentConversations insert returned no row");
      return row.id;
    },
  };
}

function buildDefaultAppendDeps(): AppendTurnDeps {
  return {
    insertTurn: async (values) => {
      const { db } = await import("@/db");
      const { agentTurns } = await import("@/db/schema/agents");
      await db
        .insert(agentTurns)
        .values(values as unknown as typeof agentTurns.$inferInsert);
    },
  };
}

function buildDefaultEndDeps(): EndConversationDeps {
  return {
    updateConversation: async (conversationId, patch) => {
      const { db } = await import("@/db");
      const { agentConversations } = await import("@/db/schema/agents");
      const { eq } = await import("drizzle-orm");
      await db
        .update(agentConversations)
        .set(patch as unknown as Partial<typeof agentConversations.$inferInsert>)
        .where(eq(agentConversations.id, conversationId));
    },
  };
}

// ─── public API ─────────────────────────────────────────────────────────────

/**
 * Insert an `agentConversations` row for an inbound voice call.
 * Returns the new conversation id, or null on failure (best-effort).
 */
export async function startVoiceConversation(args: {
  agentId: string;
  agentVersion?: number;
  orgId: string;
  callId: string;
  fromNumber?: string;
  toNumber?: string;
  deps?: Partial<StartConversationDeps>;
}): Promise<string | null> {
  const insertConversation =
    args.deps?.insertConversation ?? buildDefaultStartDeps().insertConversation;

  try {
    const id = await insertConversation({
      agentId: args.agentId,
      agentVersion: args.agentVersion ?? 1,
      orgId: args.orgId,
      status: "active",
      channelMeta: {
        channel: "voice",
        call_id: args.callId,
        from_number: args.fromNumber ?? null,
        to_number: args.toNumber ?? null,
      },
    });
    return id;
  } catch (error) {
    logEvent("voice_call_transcript_persist_error", { error, step: "start" });
    return null;
  }
}

/**
 * Insert an `agentTurns` row for a voice call turn.
 * Best-effort — never throws.
 */
export async function appendVoiceTurn(args: {
  conversationId: string;
  turnIndex: number;
  role: "user" | "assistant";
  content: string;
  deps?: Partial<AppendTurnDeps>;
}): Promise<void> {
  const insertTurn =
    args.deps?.insertTurn ?? buildDefaultAppendDeps().insertTurn;

  try {
    await insertTurn({
      conversationId: args.conversationId,
      turnIndex: args.turnIndex,
      role: args.role,
      content: args.content,
    });
  } catch (error) {
    logEvent("voice_call_transcript_persist_error", { error, step: "append" });
  }
}

/**
 * Mark an `agentConversations` row as ended.
 * Best-effort — never throws.
 */
export async function endVoiceConversation(args: {
  conversationId: string;
  turnCount: number;
  status?: string;
  deps?: Partial<EndConversationDeps>;
}): Promise<void> {
  const updateConversation =
    args.deps?.updateConversation ?? buildDefaultEndDeps().updateConversation;

  try {
    await updateConversation(args.conversationId, {
      status: args.status ?? "completed",
      endedAt: new Date(),
      turnCount: args.turnCount,
    });
  } catch (error) {
    logEvent("voice_call_transcript_persist_error", { error, step: "end" });
  }
}
