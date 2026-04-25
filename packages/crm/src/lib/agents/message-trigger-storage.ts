// Storage contract + helpers for SLICE 7 message triggers.
// SLICE 7 PR 1 C3 per audit §4.3 + §5.3 + gates G-7-6, G-7-8.
//
// Two tables backed by this contract:
//   1. messageTriggers — materialized lookup index. Webhook receiver
//      queries listEnabledForWorkspaceChannel() at request time.
//   2. messageTriggerFires — idempotency + observability.
//      UNIQUE (triggerId, messageId) per G-7-6 enforces "at most one
//      run per (trigger, inbound message)" structurally.
//
// Pattern mirrors SLICE 5 scheduled-triggers-storage.ts: pure storage
// interface + in-memory store for tests + Drizzle adapter (separate
// module C3.b) for production.

import { randomUUID } from "node:crypto";

import type {
  MessagePattern,
  ChannelBinding,
} from "./validator";

// ---------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------

export type MessageChannel = "sms";

export type MessageTrigger = {
  id: string;
  orgId: string;
  archetypeId: string;
  channel: MessageChannel;
  channelBinding: ChannelBinding;
  pattern: MessagePattern;
  enabled: boolean;
  createdAt: Date;
};

export type MessageTriggerFireSkipReason =
  | "loop_guard"
  | "no_match"
  | "already_fired"
  | "dispatch_failed";

export type MessageTriggerFire = {
  id: string;
  triggerId: string;
  messageId: string;
  /** runId is null when the fire was skipped (no run was created). */
  runId: string | null;
  /** null when the fire actually dispatched a run. */
  skippedReason: MessageTriggerFireSkipReason | null;
  firedAt: Date;
};

// ---------------------------------------------------------------------
// Storage contract
// ---------------------------------------------------------------------

export type MessageTriggerStore = {
  insert(trigger: MessageTrigger): Promise<void>;
  findById(id: string): Promise<MessageTrigger | null>;
  listEnabledForWorkspaceChannel(
    orgId: string,
    channel: MessageChannel,
  ): Promise<MessageTrigger[]>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
  /**
   * Insert a fire record. Returns ok=true on success; ok=false on
   * UNIQUE (triggerId, messageId) conflict — caller treats this as
   * "already fired" idempotent skip.
   */
  recordFire(fire: MessageTriggerFire): Promise<{ ok: boolean }>;
};

// ---------------------------------------------------------------------
// Helper: build a new MessageTrigger with sensible defaults
// ---------------------------------------------------------------------

export function buildMessageTrigger(input: {
  orgId: string;
  archetypeId: string;
  channel: MessageChannel;
  channelBinding: ChannelBinding;
  pattern: MessagePattern;
  enabled?: boolean;
}): MessageTrigger {
  return {
    id: randomUUID(),
    orgId: input.orgId,
    archetypeId: input.archetypeId,
    channel: input.channel,
    channelBinding: input.channelBinding,
    pattern: input.pattern,
    enabled: input.enabled ?? true,
    createdAt: new Date(),
  };
}

// ---------------------------------------------------------------------
// In-memory store (for unit tests)
// ---------------------------------------------------------------------

export function makeInMemoryMessageTriggerStore(): MessageTriggerStore {
  const triggers = new Map<string, MessageTrigger>();
  const fires = new Map<string, MessageTriggerFire>();
  const fireKeys = new Set<string>();

  const fireKey = (triggerId: string, messageId: string) =>
    `${triggerId}::${messageId}`;

  return {
    async insert(trigger) {
      triggers.set(trigger.id, trigger);
    },
    async findById(id) {
      return triggers.get(id) ?? null;
    },
    async listEnabledForWorkspaceChannel(orgId, channel) {
      const out: MessageTrigger[] = [];
      for (const t of triggers.values()) {
        if (t.orgId === orgId && t.channel === channel && t.enabled) {
          out.push(t);
        }
      }
      return out;
    },
    async setEnabled(id, enabled) {
      const t = triggers.get(id);
      if (!t) return;
      triggers.set(id, { ...t, enabled });
    },
    async recordFire(fire) {
      const key = fireKey(fire.triggerId, fire.messageId);
      if (fireKeys.has(key)) return { ok: false };
      fireKeys.add(key);
      fires.set(fire.id, fire);
      return { ok: true };
    },
  };
}
