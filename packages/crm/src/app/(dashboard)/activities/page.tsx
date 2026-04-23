// Activities admin page — MIGRATED to SLICE 4a composition patterns.
//
// Proof artifact per audit §3 G-4-3. Exercises <PageShell> +
// <EntityTable> + deriveColumns on real CRM data. Validates the
// patterns work end-to-end before they roll out to other admin
// surfaces.
//
// Pre-SLICE-4a: 101 LOC of hand-rolled header + stats grid + table
// chrome. Post-migration: <PageShell> owns title + description
// (replaces the hand-rolled h1/p pair); <EntityTable> replaces the
// hand-rolled <table>. Stats grid + ActivityForm remain inline
// (stats become <CompositionCard> in PR 2; form stays local).
//
// Used <PageShell> directly instead of <BlockListPage> because this
// page has three children (stats + table + form) rather than just
// a table — <BlockListPage> is the preset for list-only pages.

import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/helpers";
import { listActivities } from "@/lib/activities/actions";
import { getLabels } from "@/lib/soul/labels";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { ActivityForm } from "@/components/activities/activity-form";
import { PageShell } from "@/components/ui-composition/page-shell";
import { EntityTable } from "@/components/ui-composition/entity-table";
import { CircleDot, Users, UserCheck, BellRing } from "lucide-react";

// Narrow Zod shape for column derivation. The rows from
// listActivities() are Drizzle-typed; this schema captures the
// 3 columns surfaced in the table and lets deriveColumns +
// EntityTable render them consistently.
const ActivityRowSchema = z.object({
  type: z.string(),
  subject: z.string().nullable(),
  createdAt: z.string(),
});
type ActivityRowShape = z.infer<typeof ActivityRowSchema>;

export default async function ActivitiesPage() {
  const [user, labels, rows] = await Promise.all([
    getCurrentUser(),
    getLabels(),
    listActivities(),
  ]);
  const taskCount = rows.filter((item) => item.type === "task").length;
  const noteCount = rows.filter((item) => item.type === "note").length;
  const callCount = rows.filter((item) => item.type === "call").length;

  // Project rows into the schema shape + pre-format createdAt for display.
  const projected: ActivityRowShape[] = rows.map((row) => ({
    type: row.type,
    subject: row.subject ?? null,
    createdAt: formatRelativeDate(row.createdAt),
  }));

  return (
    <PageShell
      title={labels.activity.plural}
      description="Track tasks and touchpoints in one timeline."
    >
      <div className="bg-card text-card-foreground rounded-xl border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-x-0 lg:divide-x sm:divide-y-0 divide-border">
          <StatCard icon={<Users className="size-[18px]" />} label={`Total ${labels.activity.plural}`} value={rows.length} />
          <StatCard icon={<CircleDot className="size-[18px]" />} label="Tasks" value={taskCount} />
          <StatCard icon={<UserCheck className="size-[18px]" />} label="Notes" value={noteCount} />
          <StatCard icon={<BellRing className="size-[18px]" />} label="Calls" value={callCount} />
        </div>
      </div>

      {user ? <ActivityForm userId={user.id} /> : null}

      <EntityTable
        schema={ActivityRowSchema}
        rows={projected}
        ariaLabel={`Recent ${labels.activity.plural}`}
        columns={{
          include: ["type", "subject", "createdAt"],
          overrides: {
            subject: {
              renderer: (v) => (v ? <span>{String(v)}</span> : <span className="text-muted-foreground">No subject</span>),
            },
            createdAt: {
              title: "When",
            },
            type: {
              renderer: (v) => (
                <span className="inline-flex items-center justify-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-tiny font-medium text-secondary-foreground">
                  {String(v)}
                </span>
              ),
            },
          },
        }}
        emptyState={<span>No activity logged yet.</span>}
      />
    </PageShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-label font-medium">{label}</span>
      </div>
      <p className="text-section-title tracking-tight">{value}</p>
    </div>
  );
}
