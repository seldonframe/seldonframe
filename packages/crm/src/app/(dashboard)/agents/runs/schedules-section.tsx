// SLICE 5 PR 2 C4 — scheduled-trigger observability section for
// /agents/runs per G-5-6.
//
// Server component. Renders per-scheduled-trigger: archetype,
// humanized cron, timezone, next fire (relative + absolute UTC),
// last fire, catchup + concurrency policy pills, enabled badge.
//
// Deferred (follow-up):
//   - Per-trigger detail drawer with full fire history
//   - Edit / disable buttons (AgentSpec edit UI is post-launch)
//   - Trigger-type filter on the runs table (requires RunsClient
//     state; audit-time deferred to avoid ballooning PR 2 scope)
//
// Uses DrizzleScheduledTriggerStore.findDue-style query path for
// symmetry with the dispatcher — but listing is enabled=true
// regardless of nextFireAt (the dispatcher cares about due; the
// admin UI cares about ALL active schedules). Separate query to
// keep semantics clear.

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { scheduledTriggers } from "@/db/schema/scheduled-triggers";
import {
  formatNextFireRelative,
  summarizeCron,
} from "@/lib/agents/schedule-summary";

export async function SchedulesSection({ orgId }: { orgId: string }) {
  const rows = await db
    .select()
    .from(scheduledTriggers)
    .where(eq(scheduledTriggers.orgId, orgId))
    .orderBy(desc(scheduledTriggers.nextFireAt))
    .limit(50);

  if (rows.length === 0) return null;

  const now = new Date();

  return (
    <section className="space-y-3" data-schedules-section="">
      <header>
        <h2 className="text-base font-semibold">Scheduled triggers</h2>
        <p className="text-sm text-muted-foreground">
          Agents that run on a cron schedule. Next-fire times respect the
          trigger's timezone; {"\u201C"}overdue{"\u201D"} means the dispatcher hasn't caught up yet
          (next workflow-tick picks it up).
        </p>
      </header>
      <div className="rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Archetype</th>
              <th className="px-3 py-2 font-medium">Schedule</th>
              <th className="px-3 py-2 font-medium">Timezone</th>
              <th className="px-3 py-2 font-medium">Next fire</th>
              <th className="px-3 py-2 font-medium">Last fire</th>
              <th className="px-3 py-2 font-medium">Policy</th>
              <th className="px-3 py-2 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} data-schedule-row="" className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{row.archetypeId}</td>
                <td className="px-3 py-2">
                  <span title={row.cronExpression}>
                    {summarizeCron(row.cronExpression)}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.timezone}</td>
                <td className="px-3 py-2">
                  <span title={row.nextFireAt.toISOString()}>
                    {formatNextFireRelative(row.nextFireAt, now)}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.lastFiredAt
                    ? formatNextFireRelative(row.lastFiredAt, now).replace("in ", "").replace("overdue", "just now")
                    : "never"}
                </td>
                <td className="px-3 py-2">
                  <PolicyPill label={`catchup=${row.catchup}`} />{" "}
                  <PolicyPill label={`concurrency=${row.concurrency}`} />
                </td>
                <td className="px-3 py-2">
                  {row.enabled ? (
                    <span
                      data-schedule-enabled=""
                      className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600"
                    >
                      enabled
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      disabled
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PolicyPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}
