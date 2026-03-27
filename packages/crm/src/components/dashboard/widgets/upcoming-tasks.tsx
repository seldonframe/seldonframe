export function UpcomingTasksWidget({
  tasks,
}: {
  tasks: Array<{ id: string; subject: string | null; scheduledAt: Date | null }>;
}) {
  return (
    <article className="crm-card">
      <h3 className="mb-3 text-card-title">Upcoming Tasks</h3>
      {tasks.length === 0 ? (
        <p className="text-label text-[hsl(var(--color-text-secondary))]">No tasks scheduled.</p>
      ) : (
        <ul className="space-y-2">
          {tasks.slice(0, 6).map((task) => (
            <li key={task.id} className="crm-table-row rounded-md px-2 py-2 text-label">
              {task.subject ?? "Untitled task"}
              {task.scheduledAt ? <span className="ml-2 text-tiny text-[hsl(var(--color-text-muted))]">{new Date(task.scheduledAt).toLocaleDateString()}</span> : ""}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
