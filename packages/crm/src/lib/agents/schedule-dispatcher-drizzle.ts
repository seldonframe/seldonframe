// Drizzle-backed ScheduledTriggerStore implementation.
// SLICE 5 PR 1 C5 per audit §4.1 + §4.4.
//
// Pairs with the in-memory store in scheduled-triggers-storage.ts via
// the shared ScheduledTriggerStore contract. Unit tests run against the
// in-memory store (schedule-dispatcher.spec.ts); this module typechecks
// against the production Drizzle surface + ships when the route handler
// wires it in. Live behavior is exercised via preview deploys + the
// 9-probe regression in C6.

import { and, asc, eq, lte } from "drizzle-orm";

import type { DbClient } from "@/db";
import { scheduledTriggers, scheduledTriggerFires } from "@/db/schema/scheduled-triggers";
import type {
  ScheduledTrigger,
  ScheduledTriggerStore,
  ScheduledTriggerFire,
  ScheduledTriggerCatchup,
  ScheduledTriggerConcurrency,
} from "./scheduled-triggers-storage";

export class DrizzleScheduledTriggerStore implements ScheduledTriggerStore {
  constructor(private readonly db: DbClient) {}

  async insert(trigger: ScheduledTrigger): Promise<void> {
    await this.db.insert(scheduledTriggers).values({
      id: trigger.id,
      orgId: trigger.orgId,
      archetypeId: trigger.archetypeId,
      cronExpression: trigger.cronExpression,
      timezone: trigger.timezone,
      catchup: trigger.catchup,
      concurrency: trigger.concurrency,
      nextFireAt: trigger.nextFireAt,
      lastFiredAt: trigger.lastFiredAt ?? null,
      enabled: trigger.enabled,
      createdAt: trigger.createdAt,
    });
  }

  async findById(id: string): Promise<ScheduledTrigger | null> {
    const rows = await this.db
      .select()
      .from(scheduledTriggers)
      .where(eq(scheduledTriggers.id, id))
      .limit(1);
    if (rows.length === 0) return null;
    return toDomain(rows[0]);
  }

  async findDue(now: Date, batchLimit: number): Promise<ScheduledTrigger[]> {
    const rows = await this.db
      .select()
      .from(scheduledTriggers)
      .where(
        and(
          eq(scheduledTriggers.enabled, true),
          lte(scheduledTriggers.nextFireAt, now),
        ),
      )
      .orderBy(asc(scheduledTriggers.nextFireAt))
      .limit(batchLimit);
    return rows.map(toDomain);
  }

  async advanceTrigger(
    id: string,
    updates: { lastFiredAt: Date; nextFireAt: Date },
  ): Promise<void> {
    await this.db
      .update(scheduledTriggers)
      .set({
        lastFiredAt: updates.lastFiredAt,
        nextFireAt: updates.nextFireAt,
      })
      .where(eq(scheduledTriggers.id, id));
  }

  async recordFire(fire: ScheduledTriggerFire): Promise<{ ok: boolean }> {
    try {
      await this.db.insert(scheduledTriggerFires).values({
        id: fire.id,
        scheduledTriggerId: fire.scheduledTriggerId,
        fireTimeUtc: fire.fireTimeUtc,
        dispatchedAt: fire.dispatchedAt,
      });
      return { ok: true };
    } catch (err) {
      // Postgres UNIQUE violation → idempotent skip. Catch-all on any
      // DB error bumps ok=false; tick-level logging surfaces the cause.
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("scheduled_trigger_fires_unique_idx") || /unique/i.test(msg)) {
        return { ok: false };
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------
// Row → domain mapping
// ---------------------------------------------------------------------

type ScheduledTriggerRow = typeof scheduledTriggers.$inferSelect;

function toDomain(row: ScheduledTriggerRow): ScheduledTrigger {
  return {
    id: row.id,
    orgId: row.orgId,
    archetypeId: row.archetypeId,
    cronExpression: row.cronExpression,
    timezone: row.timezone,
    catchup: row.catchup as ScheduledTriggerCatchup,
    concurrency: row.concurrency as ScheduledTriggerConcurrency,
    nextFireAt: row.nextFireAt,
    lastFiredAt: row.lastFiredAt,
    enabled: row.enabled,
    createdAt: row.createdAt,
  };
}
