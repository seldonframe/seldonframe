import { getCurrentUser } from "@/lib/auth/helpers";
import { listActivities } from "@/lib/activities/actions";
import { getLabels } from "@/lib/soul/labels";
import { formatRelativeDate } from "@/lib/utils/formatters";
import { ActivityForm } from "@/components/activities/activity-form";

export default async function ActivitiesPage() {
  const [user, labels, rows] = await Promise.all([getCurrentUser(), getLabels(), listActivities()]);

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{labels.activity.plural}</h1>
        <p className="text-sm text-[hsl(var(--color-text-secondary))]">Track tasks and touchpoints in one timeline.</p>
      </div>

      {user ? <ActivityForm userId={user.id} /> : null}

      <div className="crm-card p-4">
        <h2 className="mb-3 text-lg font-semibold">Recent {labels.activity.plural}</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-[hsl(var(--color-text-secondary))]">No activity logged yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((item) => (
              <li key={item.id} className="border-b pb-2 last:border-0">
                <p className="text-sm font-medium">{item.type} · {item.subject ?? "No subject"}</p>
                <p className="text-xs text-[hsl(var(--color-text-muted))]">{formatRelativeDate(item.createdAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
