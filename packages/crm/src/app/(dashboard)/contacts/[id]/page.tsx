import { and, eq } from "drizzle-orm";
import { Clock3 } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { activities, contacts } from "@/db/schema";
import { getOrgId } from "@/lib/auth/helpers";
import { listEmailTemplates, sendEmailTemplateToContactFormAction } from "@/lib/emails/actions";
import { getContactRevenue } from "@/lib/payments/actions";
import { getLabels } from "@/lib/soul/labels";
import { getSoul } from "@/lib/soul/server";

function formatCustomFieldValue(type: string, value: unknown) {
  if (value == null || value === "") {
    return "—";
  }

  const normalizedType = type.toLowerCase();

  if (normalizedType === "number") {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString() : "—";
  }

  if (normalizedType === "currency") {
    const number = Number(value);
    return Number.isFinite(number)
      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(number)
      : "—";
  }

  if (normalizedType === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
  }

  if (normalizedType === "multi-select" || normalizedType === "multi_select") {
    if (Array.isArray(value)) {
      return value.map((item) => String(item)).filter(Boolean).join(", ") || "—";
    }

    return String(value);
  }

  return String(value);
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getOrgId();

  if (!orgId) {
    notFound();
  }

  const [labels, soul, row, timeline] = await Promise.all([
    getLabels(),
    getSoul(),
    db
      .select()
      .from(contacts)
      .where(and(eq(contacts.orgId, orgId), eq(contacts.id, id)))
      .limit(1)
      .then((result) => result[0]),
    db.select().from(activities).where(and(eq(activities.orgId, orgId), eq(activities.contactId, id))),
  ]);

  const templates = await listEmailTemplates();
  const revenue = await getContactRevenue(id);

  if (!row) {
    notFound();
  }

  const suggestedFields = soul?.suggestedFields.contact ?? [];
  const customFields = (row.customFields ?? {}) as Record<string, unknown>;

  return (
    <section className="animate-page-enter space-y-4">
      <h1 className="text-page-title">
        {labels.contact.singular}: {row.firstName} {row.lastName}
      </h1>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <p className="text-[11px] uppercase tracking-[0.08em] text-[hsl(var(--color-text-muted))]">Contact profile</p>
            <div className="mt-3 grid gap-2 text-sm text-foreground">
              <p>Email: {row.email ?? "—"}</p>
              <p>
                Status: <span className="crm-badge">{row.status}</span>
              </p>
              <p>
                Revenue: <span className="font-medium text-foreground">${Number(revenue).toFixed(2)}</span>
              </p>
            </div>
          </div>

          {suggestedFields.length > 0 ? (
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-card-title">Custom Fields</h2>
              <div className="mt-3 grid gap-2">
                {suggestedFields.map((field) => {
                  const rawValue = customFields[field.key];
                  const formatted = formatCustomFieldValue(field.type, rawValue);

                  if (field.type === "url" && formatted !== "—") {
                    return (
                      <div key={field.key} className="grid grid-cols-[160px_1fr] gap-3 text-sm">
                        <p className="text-muted-foreground">{field.label}</p>
                        <a href={String(rawValue)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {String(rawValue)}
                        </a>
                      </div>
                    );
                  }

                  if (field.type === "email" && formatted !== "—") {
                    return (
                      <div key={field.key} className="grid grid-cols-[160px_1fr] gap-3 text-sm">
                        <p className="text-muted-foreground">{field.label}</p>
                        <a href={`mailto:${String(rawValue)}`} className="text-primary hover:underline">
                          {String(rawValue)}
                        </a>
                      </div>
                    );
                  }

                  if (field.type === "phone" && formatted !== "—") {
                    return (
                      <div key={field.key} className="grid grid-cols-[160px_1fr] gap-3 text-sm">
                        <p className="text-muted-foreground">{field.label}</p>
                        <a href={`tel:${String(rawValue)}`} className="text-primary hover:underline">
                          {String(rawValue)}
                        </a>
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="grid grid-cols-[160px_1fr] gap-3 text-sm">
                      <p className="text-muted-foreground">{field.label}</p>
                      <p className="text-foreground">{formatted}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <form action={sendEmailTemplateToContactFormAction} className="grid gap-3 rounded-xl border bg-card p-5 md:grid-cols-[1fr_auto] md:items-end">
            <input type="hidden" name="contactId" value={row.id} />
            <div>
              <label htmlFor="templateId" className="text-label text-[hsl(var(--color-text-secondary))]">Send Email Template</label>
              <select id="templateId" name="templateId" className="crm-input mt-1 h-10 w-full px-3" defaultValue="" required>
                <option value="" disabled>
                  Select template
                </option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} {template.tag ? `(${template.tag})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="crm-button-primary h-10 px-4" disabled={!row.email || templates.length === 0}>
              Send Email
            </button>
          </form>
        </div>

        {timeline.length > 0 ? (
          <div className="h-fit rounded-xl border bg-card p-5">
            <h2 className="mb-3 text-card-title">Activity Timeline</h2>
            <ul className="space-y-2">
              {timeline.map((item) => (
                <li key={item.id} className="crm-table-row flex items-center gap-3 rounded-md px-2 py-2 text-label">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/[0.14] text-xs font-semibold text-primary">
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
          </div>
        ) : null}
      </div>
    </section>
  );
}
