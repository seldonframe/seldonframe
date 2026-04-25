// Production loop-guard wrapper.
// SLICE 7 PR 2 C1 per audit + gate G-7-7.
//
// Wraps evaluateLoopGuard with:
//   1. DB queries for recent fires (per-trigger-conversation + per-org)
//   2. workflow.message_trigger.loop_guard_engaged emission on halt
//   3. Workspace warn log on warn-tier
//
// Follows the SLICE 6 PR 2 branch-observability pattern: emit is
// fire-and-forget via queueMicrotask; observability errors are logged
// + swallowed (must never fail the dispatch).

import { and, eq, gte, sql } from "drizzle-orm";

import type { DbClient } from "@/db";
import { messageTriggerFires } from "@/db/schema/message-triggers";
import { logEvent } from "@/lib/observability/log";
import type { RuntimeStorage, EventLogInput } from "@/lib/workflow/types";

import {
  defaultLoopGuardConfig,
  evaluateLoopGuard,
  type LoopGuardConfig,
} from "./loop-guard";
import type { InboundMessage } from "./message-trigger-dispatcher";
import type { MessageTrigger } from "./message-trigger-storage";

export type LoopGuardWiringDeps = {
  db: DbClient;
  storage: RuntimeStorage;
  orgId: string;
  config?: LoopGuardConfig;
  now?: () => Date;
};

/**
 * Returns a loopGuardCheck callback compatible with the dispatcher's
 * DispatchContext.loopGuardCheck slot.
 */
export function makeProductionLoopGuardCheck(deps: LoopGuardWiringDeps) {
  const config = deps.config ?? defaultLoopGuardConfig;
  const nowOf = () => (deps.now ? deps.now() : new Date());

  return async (input: { trigger: MessageTrigger; inbound: InboundMessage }) => {
    const now = nowOf();
    const windowStart = new Date(
      now.getTime() - config.perTriggerPerConversationWindowMs,
    );
    const orgWindowStart = new Date(now.getTime() - 60_000);

    // Per-trigger per-conversation: only count fires that resulted in a
    // run (runId IS NOT NULL) — skipped fires (no_match, etc.) don't
    // count toward the loop-detection signal.
    const recentFiresForTriggerConversation = input.inbound.conversationId
      ? await deps.db
          .select({ firedAt: messageTriggerFires.firedAt })
          .from(messageTriggerFires)
          .where(
            and(
              eq(messageTriggerFires.triggerId, input.trigger.id),
              gte(messageTriggerFires.firedAt, windowStart),
              sql`${messageTriggerFires.runId} IS NOT NULL`,
            ),
          )
      : [];

    // Per-org count: warn-only signal. v1 approximates by counting
    // fires for THIS trigger in the org window — the existing
    // (trigger_id, fired_at) index makes this a single index seek.
    // True workspace-wide aggregation requires a join through
    // message_triggers on org_id; deferred to v1.1 once observability
    // shows it materially under-counts (warn-only, so under-counting
    // is preferable to a hot-path full table scan).
    const orgRows = await deps.db
      .select({ count: sql<number>`count(*)::int` })
      .from(messageTriggerFires)
      .where(
        and(
          eq(messageTriggerFires.triggerId, input.trigger.id),
          gte(messageTriggerFires.firedAt, orgWindowStart),
        ),
      );
    const recentFiresForOrg = orgRows[0]?.count ?? 0;

    const result = evaluateLoopGuard({
      triggerId: input.trigger.id,
      conversationId: input.inbound.conversationId,
      orgId: input.trigger.orgId,
      recentFiresForTriggerConversation: recentFiresForTriggerConversation.map(
        (r) => r.firedAt,
      ),
      recentFiresForOrg,
      now,
      config,
    });

    if (result.workspaceWarn) {
      logEvent("message_trigger_workspace_warn", {
        org_id: input.trigger.orgId,
        trigger_id: input.trigger.id,
        recent_fires_per_min: recentFiresForOrg,
        threshold: config.workspaceWarnThresholdPerMin,
      });
    }

    if (result.blocked) {
      const payload: EventLogInput = {
        orgId: input.trigger.orgId,
        eventType: "workflow.message_trigger.loop_guard_engaged",
        payload: {
          triggerId: input.trigger.id,
          conversationId: input.inbound.conversationId,
          archetypeId: input.trigger.archetypeId,
          engagedTier: result.engagedTier,
          recentFiresForTriggerConversation:
            recentFiresForTriggerConversation.length,
          windowMs: config.perTriggerPerConversationWindowMs,
          limit: config.perTriggerPerConversationLimit,
        },
      };
      queueMicrotask(() => {
        deps.storage.appendEventLog(payload).catch((err) => {
          // eslint-disable-next-line no-console
          console.error(
            "[loop-guard] appendEventLog failed",
            { orgId: input.trigger.orgId, error: err instanceof Error ? err.message : String(err) },
          );
        });
      });
    }

    return { blocked: result.blocked };
  };
}
