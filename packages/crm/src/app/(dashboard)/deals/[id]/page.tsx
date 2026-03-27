import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { activities, contacts, deals } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { getLabels } from "@/lib/soul/labels";

export default async function DealDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getOrgId();

  if (!orgId) {
    notFound();
  }

  const [labels, deal] = await Promise.all([
    getLabels(),
    db
      .select()
      .from(deals)
      .where(and(eq(deals.orgId, orgId), eq(deals.id, id)))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  if (!deal) {
    notFound();
  }

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.orgId, orgId), eq(contacts.id, deal.contactId)))
    .limit(1);

  const timeline = await db
    .select()
    .from(activities)
    .where(and(eq(activities.orgId, orgId), eq(activities.dealId, deal.id)));

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">{labels.deal.singular}: {deal.title}</h1>

      <div className="crm-card p-4">
        <p className="text-sm">Stage: {deal.stage}</p>
        <p className="text-sm">Value: ${Number(deal.value).toLocaleString()}</p>
        <p className="text-sm">Probability: {deal.probability}%</p>
      </div>

      <div className="crm-card p-4">
        <h2 className="mb-2 text-lg font-semibold">Linked {labels.contact.singular}</h2>
        {contact ? (
          <p className="text-sm">{contact.firstName} {contact.lastName}</p>
        ) : (
          <p className="text-sm text-[hsl(var(--color-text-secondary))]">No linked contact found.</p>
        )}
      </div>

      <div className="crm-card p-4">
        <h2 className="mb-2 text-lg font-semibold">Activity Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-[hsl(var(--color-text-secondary))]">No activity yet.</p>
        ) : (
          <ul className="space-y-2">
            {timeline.map((item) => (
              <li key={item.id} className="text-sm">
                <span className="font-medium">{item.type}</span> — {item.subject ?? "No subject"}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
