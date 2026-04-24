// Storage contract + helpers for scheduled triggers.
//
// Shipped in SLICE 5 PR 1 C4 per audit §3.2.
//
// Design:
//   - Pure storage interface (ScheduledTriggerStore) expressed as
//     minimal CRUD operations needed by the cron dispatcher. Tests
//     inject an in-memory implementation (makeInMemoryScheduledTriggerStore);
//     the Drizzle-backed production implementation lands in C5 alongside
//     the dispatcher wiring.
//   - Pure helpers (buildInitialScheduledTrigger, computeNextFireAtForTrigger)
//     encode the cron-next-fire computation at trigger-creation + post-fire
//     advance times. Both delegate to lib/agents/cron for the actual
//     next-fire math.

import { computeNextFireAt } from "./cron";

// ---------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------

export type ScheduledTriggerCatchup = "skip" | "fire_all" | "fire_one";
export type ScheduledTriggerConcurrency = "skip" | "concurrent";

export type ScheduledTrigger = {
  id: string;
  orgId: string;
  archetypeId: string;
  cronExpression: string;
  timezone: string;
  catchup: ScheduledTriggerCatchup;
  concurrency: ScheduledTriggerConcurrency;
  nextFireAt: Date;
  lastFiredAt: Date | null;
  enabled: boolean;
  createdAt: Date;
};

export type ScheduledTriggerFire = {
  id: string;
  scheduledTriggerId: string;
  fireTimeUtc: Date;
  dispatchedAt: Date;
};

// ---------------------------------------------------------------------
// Storage contract
// ---------------------------------------------------------------------

export type ScheduledTriggerStore = {
  insert(trigger: ScheduledTrigger): Promise<void>;
  findById(id: string): Promise<ScheduledTrigger | null>;
  findDue(now: Date, batchLimit: number): Promise<ScheduledTrigger[]>;
  advanceTrigger(
    id: string,
    updates: { lastFiredAt: Date; nextFireAt: Date },
  ): Promise<void>;
  /** Returns { ok: true } if the fire was inserted; { ok: false } on UNIQUE conflict. */
  recordFire(fire: ScheduledTriggerFire): Promise<{ ok: boolean }>;
};

// ---------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------

export type ScheduledTriggerDraft = Omit<ScheduledTrigger, "id">;

export function buildInitialScheduledTrigger(input: {
  orgId: string;
  archetypeId: string;
  cronExpression: string;
  timezone: string;
  catchup?: ScheduledTriggerCatchup;
  concurrency?: ScheduledTriggerConcurrency;
  now: Date;
}): ScheduledTriggerDraft {
  // computeNextFireAt throws on invalid cron/tz — bubble up.
  const nextFireAt = computeNextFireAt(input.cronExpression, input.timezone, input.now);
  return {
    orgId: input.orgId,
    archetypeId: input.archetypeId,
    cronExpression: input.cronExpression,
    timezone: input.timezone,
    catchup: input.catchup ?? "skip",
    concurrency: input.concurrency ?? "skip",
    nextFireAt,
    lastFiredAt: null,
    enabled: true,
    createdAt: input.now,
  };
}

export function computeNextFireAtForTrigger(
  trigger: Pick<ScheduledTrigger, "cronExpression" | "timezone">,
  after: Date,
): Date {
  return computeNextFireAt(trigger.cronExpression, trigger.timezone, after);
}

// ---------------------------------------------------------------------
// In-memory test store
// ---------------------------------------------------------------------

export function makeInMemoryScheduledTriggerStore(): ScheduledTriggerStore {
  const triggers = new Map<string, ScheduledTrigger>();
  const fires = new Map<string, ScheduledTriggerFire>();

  function fireKey(scheduledTriggerId: string, fireTimeUtc: Date): string {
    return `${scheduledTriggerId}:${fireTimeUtc.toISOString()}`;
  }

  return {
    async insert(trigger) {
      triggers.set(trigger.id, { ...trigger });
    },
    async findById(id) {
      const t = triggers.get(id);
      return t ? { ...t } : null;
    },
    async findDue(now, batchLimit) {
      const out: ScheduledTrigger[] = [];
      for (const t of triggers.values()) {
        if (!t.enabled) continue;
        if (t.nextFireAt.getTime() > now.getTime()) continue;
        out.push({ ...t });
        if (out.length >= batchLimit) break;
      }
      return out.sort((a, b) => a.nextFireAt.getTime() - b.nextFireAt.getTime());
    },
    async advanceTrigger(id, updates) {
      const t = triggers.get(id);
      if (!t) throw new Error(`scheduled trigger ${id} not found`);
      triggers.set(id, {
        ...t,
        lastFiredAt: updates.lastFiredAt,
        nextFireAt: updates.nextFireAt,
      });
    },
    async recordFire(fire) {
      const key = fireKey(fire.scheduledTriggerId, fire.fireTimeUtc);
      if (fires.has(key)) return { ok: false };
      fires.set(key, { ...fire });
      return { ok: true };
    },
  };
}
