import { listPortalMessages, listPortalResources } from "@/lib/portal/actions";

export default async function PortalOverviewPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const [messages, resources] = await Promise.all([listPortalMessages(orgSlug), listPortalResources(orgSlug)]);

  return (
    <section className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <article className="crm-card">
          <p className="text-label text-[hsl(var(--color-text-muted))]">Messages</p>
          <p className="mt-1 text-2xl font-semibold">{messages.length}</p>
        </article>
        <article className="crm-card">
          <p className="text-label text-[hsl(var(--color-text-muted))]">Resources</p>
          <p className="mt-1 text-2xl font-semibold">{resources.length}</p>
        </article>
        <article className="crm-card">
          <p className="text-label text-[hsl(var(--color-text-muted))]">Viewed Resources</p>
          <p className="mt-1 text-2xl font-semibold">{resources.filter((row) => Boolean(row.viewedAt)).length}</p>
        </article>
      </div>

      <article className="crm-card">
        <h2 className="text-card-title">Recent Messages</h2>
        {messages.length === 0 ? (
          <p className="mt-2 text-label text-[hsl(var(--color-text-secondary))]">No messages yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {messages.slice(0, 5).map((row) => (
              <li key={row.id} className="crm-table-row rounded-md px-2 py-2 text-sm">
                <p className="font-medium text-foreground">{row.subject ?? "Message"}</p>
                <p className="text-[hsl(var(--color-text-secondary))]">{row.body}</p>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
