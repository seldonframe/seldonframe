import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Mail, Phone } from "lucide-react";
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
      <h1 className="text-3xl font-light tracking-tight">{labels.deal.singular}: {deal.title}</h1>

      <div className="crm-card p-4">
        <p className="text-sm">Stage: {deal.stage}</p>
        <p className="text-sm">Value: ${Number(deal.value).toLocaleString()}</p>
        <p className="text-sm">Probability: {deal.probability}%</p>
      </div>

      <div className="crm-card p-4">
        <h2 className="mb-2 text-lg font-semibold">Linked {labels.contact.singular}</h2>
        {contact ? (
          // 2026-05-18 — clickable card that links to the contact's
          // detail page so operators can flip between the deal context
          // and the customer record without going back through /contacts.
          // Surfaces email + phone too so a one-glance lookup doesn't
          // require an extra navigation.
          <Link
            href={`/contacts/${contact.id}`}
            className="crm-pressable group flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/40 p-3 transition-[background-color,border-color,transform] duration-150 ease-out hover:border-border hover:bg-background/70"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium text-foreground">
                {contact.firstName} {contact.lastName ?? ""}
              </p>
              {contact.email || contact.phone ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {contact.email ? (
                    <span className="inline-flex items-center gap-1">
                      <Mail className="size-3" aria-hidden="true" />
                      {contact.email}
                    </span>
                  ) : null}
                  {contact.phone ? (
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" aria-hidden="true" />
                      {contact.phone}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                Status: {contact.status}
              </p>
            </div>
            <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
          </Link>
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
