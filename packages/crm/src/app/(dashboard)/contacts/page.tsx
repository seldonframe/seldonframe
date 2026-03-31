import { listContacts } from "@/lib/contacts/actions";
import { getLabels } from "@/lib/soul/labels";
import { getSoul } from "@/lib/soul/server";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateContactForm } from "@/components/contacts/create-contact-form";
import { ContactsInlineTable } from "@/components/contacts/contacts-inline-table";

const sortOptions = [
  { value: "recent", label: "Newest" },
  { value: "name_asc", label: "Name A→Z" },
  { value: "name_desc", label: "Name Z→A" },
  { value: "score_desc", label: "Score High→Low" },
  { value: "score_asc", label: "Score Low→High" },
] as const;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; sort?: "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc" }>;
}) {
  const params = await searchParams;
  const search = (params.search ?? "").trim();
  const status = (params.status ?? "all").trim() || "all";
  const sort = params.sort ?? "recent";

  const [labels, rows, soul] = await Promise.all([
    getLabels(),
    listContacts({
      search: search || undefined,
      status,
      sort,
    }),
    getSoul(),
  ]);

  const now = new Date();
  const nowMs = now.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const hasFollowUpSignals =
    soul?.journey?.stages?.some((stage) =>
      stage.autoActions?.some((action) => /follow.?up|check.?in|re-?engage|attention/i.test(action))
    ) ?? false;

  const rowsWithBadges = rows.map((row) => {
    const createdAtRaw = (row as { createdAt?: Date | string }).createdAt;
    const updatedAtRaw = (row as { updatedAt?: Date | string }).updatedAt;
    const createdAtMs = createdAtRaw ? new Date(createdAtRaw).getTime() : Number.NaN;
    const updatedAtMs = updatedAtRaw ? new Date(updatedAtRaw).getTime() : Number.NaN;

    const badges: string[] = [];

    if (Number.isFinite(createdAtMs) && nowMs - createdAtMs <= thirtyDaysMs) {
      badges.push("New");
    }

    if (hasFollowUpSignals && Number.isFinite(updatedAtMs) && nowMs - updatedAtMs >= fourteenDaysMs) {
      badges.push("Needs attention");
    }

    return {
      ...row,
      badges,
    };
  });

  return (
    <section className="animate-page-enter space-y-4">
      <div>
        <h1 className="text-page-title">{labels.contact.plural}</h1>
        <p className="text-label text-[hsl(var(--color-text-secondary))]">Manage and segment your {labels.contact.plural.toLowerCase()}.</p>
      </div>

      <CreateContactForm />

      <form method="get" className="crm-card grid gap-3 p-4 md:grid-cols-[1fr_220px_220px_auto] md:items-end">
        <div>
          <label htmlFor="contact-search" className="text-label text-[hsl(var(--color-text-secondary))]">
            Search {labels.contact.plural}
          </label>
          <input id="contact-search" name="search" defaultValue={search} className="crm-input mt-1 h-10 w-full px-3" placeholder="Name, email, company" />
        </div>

        <div>
          <label htmlFor="contact-status" className="text-label text-[hsl(var(--color-text-secondary))]">
            Status
          </label>
          <select id="contact-status" name="status" defaultValue={status} className="crm-input mt-1 h-10 w-full px-3">
            <option value="all">All</option>
            <option value="lead">Lead</option>
            <option value="customer">Customer</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div>
          <label htmlFor="contact-sort" className="text-label text-[hsl(var(--color-text-secondary))]">
            Sort
          </label>
          <select id="contact-sort" name="sort" defaultValue={sort} className="crm-input mt-1 h-10 w-full px-3">
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="crm-button-primary h-10 px-4">
          Apply
        </button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          title={`Add your first ${labels.contact.singular}`}
          description="Start tracking relationships and touchpoints in one place."
          ctaLabel={`Create ${labels.contact.singular}`}
          ctaHref="#"
        />
      ) : (
        <ContactsInlineTable rows={rowsWithBadges} />
      )}
    </section>
  );
}
