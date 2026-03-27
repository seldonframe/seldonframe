import { formatRelativeDate } from "@/lib/utils/formatters";

export function RecentActivityWidget({
  items,
}: {
  items: Array<{ id: string; type: string; subject: string | null; createdAt: Date }>;
}) {
  return (
    <article className="crm-card">
      <h3 className="mb-3 text-card-title">Recent Activity</h3>
      {items.length === 0 ? (
        <p className="text-label text-[hsl(var(--color-text-secondary))]">No recent activity.</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, 6).map((item) => (
            <li key={item.id} className="crm-table-row rounded-md px-2 py-2 text-label">
              <span className="crm-badge mr-2">{item.type}</span>
              {item.subject ?? "No subject"}
              <span className="ml-2 text-[hsl(var(--color-text-muted))]">· {formatRelativeDate(item.createdAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
