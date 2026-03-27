import { and, eq } from "drizzle-orm";
import { Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getLabels } from "@/lib/soul/labels";

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getOrgId();

  if (!orgId) {
    notFound();
  }

  const [labels, row, timeline] = await Promise.all([
    getLabels(),
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)))
      .limit(1)
      .then((result) => result[0]),
    db.select().from(activities).where(and(eq(activities.orgId, orgId), eq(activities.contactId, id))),
  ]);

  if (!row) {
    notFound();
  }

  return (
    <section className="animate-page-enter space-y-4">
      <h1 className="text-page-title">
        {labels.contact.singular}: {row.firstName} {row.lastName}
      </h1>

      <div className="crm-card">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Contact profile</p>
        <p className="mt-2 text-label">Email: {row.email ?? "—"}</p>
        <p className="mt-2 text-label">Status: <span className="crm-badge">{row.status}</span></p>
      </div>

      <div className="crm-card">
        <h2 className="mb-2 text-card-title">Activity Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-label text-[hsl(var(--color-text-secondary))]">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {timeline.map((item) => (
              <li key={item.id} className="crm-table-row flex items-center gap-3 rounded-md px-2 py-2 text-label">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.14)] text-xs font-semibold text-primary">
                  {(row.firstName || "C").charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-foreground">{item.subject ?? "No subject"}</p>
                  <p className="text-xs text-[hsl(var(--color-text-secondary))]">{item.type}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-xs text-[hsl(var(--color-text-muted))]">
                  <Clock3 className="h-3.5 w-3.5" />
                  {new Date(item.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
