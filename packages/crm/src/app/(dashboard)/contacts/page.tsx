import Link from "next/link";
import { listContacts } from "@/lib/contacts/actions";
import { getLabels } from "@/lib/soul/labels";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateContactForm } from "@/components/contacts/create-contact-form";

export default async function ContactsPage() {
  const [labels, rows] = await Promise.all([getLabels(), listContacts()]);

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">{labels.contact.plural}</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Manage and segment your {labels.contact.plural.toLowerCase()}.</p>
      </div>

      <CreateContactForm />

      {rows.length === 0 ? (
        <EmptyState
          title={`Add your first ${labels.contact.singular}`}
          description="Start tracking relationships and touchpoints in one place."
          ctaLabel={`Create ${labels.contact.singular}`}
          ctaHref="#"
        />
      ) : (
        <div className="crm-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[hsl(var(--color-surface-raised))] text-left text-label">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="crm-table-row">
                  <td className="px-3 py-3">
                    <Link href={`/contacts/${row.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {row.firstName} {row.lastName}
                    </Link>
                  </td>
                  <td className="px-3 py-3">{row.email ?? "—"}</td>
                  <td className="px-3 py-3"><span className="crm-badge">{row.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
