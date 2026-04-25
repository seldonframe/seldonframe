// Drizzle-backed MessageTriggerStore implementation.
// SLICE 7 PR 1 C3 per audit §4.3 + §5.3.
//
// Pairs with the in-memory store in message-trigger-storage.ts via the
// shared MessageTriggerStore contract. Unit tests run against the
// in-memory store; this module typechecks against the production
// Drizzle surface and is exercised end-to-end via the integration
// harness in PR 2.

import { and, eq } from "drizzle-orm";

import type { DbClient } from "@/db";
import {
  messageTriggers,
  messageTriggerFires,
  type MessageTriggerRow,
} from "@/db/schema/message-triggers";
import type {
  MessageChannel,
  MessageTrigger,
  MessageTriggerFire,
  MessageTriggerFireSkipReason,
  MessageTriggerStore,
} from "./message-trigger-storage";
import type { ChannelBinding, MessagePattern } from "./validator";

export class DrizzleMessageTriggerStore implements MessageTriggerStore {
  constructor(private readonly db: DbClient) {}

  async insert(trigger: MessageTrigger): Promise<void> {
    await this.db.insert(messageTriggers).values({
      id: trigger.id,
      orgId: trigger.orgId,
      archetypeId: trigger.archetypeId,
      channel: trigger.channel,
      channelBinding: trigger.channelBinding,
      pattern: trigger.pattern,
      enabled: trigger.enabled,
      createdAt: trigger.createdAt,
    });
  }

  async findById(id: string): Promise<MessageTrigger | null> {
    const rows = await this.db
      .select()
      .from(messageTriggers)
      .where(eq(messageTriggers.id, id))
      .limit(1);
    if (rows.length === 0) return null;
    return toDomain(rows[0]);
  }

  async listEnabledForWorkspaceChannel(
    orgId: string,
    channel: MessageChannel,
  ): Promise<MessageTrigger[]> {
    const rows = await this.db
      .select()
      .from(messageTriggers)
      .where(
        and(
          eq(messageTriggers.orgId, orgId),
          eq(messageTriggers.channel, channel),
          eq(messageTriggers.enabled, true),
        ),
      );
    return rows.map(toDomain);
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await this.db
      .update(messageTriggers)
      .set({ enabled })
      .where(eq(messageTriggers.id, id));
  }

  async recordFire(fire: MessageTriggerFire): Promise<{ ok: boolean }> {
    try {
      await this.db.insert(messageTriggerFires).values({
        id: fire.id,
        triggerId: fire.triggerId,
        messageId: fire.messageId,
        runId: fire.runId,
        skippedReason: fire.skippedReason,
        firedAt: fire.firedAt,
      });
      return { ok: true };
    } catch (e) {
      // UNIQUE (trigger_id, message_id) conflict → already fired.
      if (isUniqueViolation(e)) return { ok: false };
      throw e;
    }
  }
}

function toDomain(row: MessageTriggerRow): MessageTrigger {
  return {
    id: row.id,
    orgId: row.orgId,
    archetypeId: row.archetypeId,
    channel: row.channel as MessageChannel,
    channelBinding: row.channelBinding as ChannelBinding,
    pattern: row.pattern as MessagePattern,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const code = (e as { code?: string }).code;
  return code === "23505";
}
