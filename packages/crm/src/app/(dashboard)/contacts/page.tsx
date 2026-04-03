import { listContacts } from "@/lib/contacts/actions";
import { getLabels } from "@/lib/soul/labels";
import { getSoul } from "@/lib/soul/server";
import { EmptyState } from "@/components/shared/empty-state";
import { CreateContactForm } from "@/components/contacts/create-contact-form";
import { ContactsInlineTable } from "@/components/contacts/contacts-inline-table";
import { CircleDot, Search, Users, UserCheck, BellRing } from "lucide-react";

/*
Square UI Leads class references (from template source):
- Stats wrapper: "bg-card text-card-foreground rounded-xl border"
- Stats grid: "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-x-0 lg:divide-x sm:divide-y-0 divide-border"
- Stats item: "p-4 sm:p-6 space-y-4"
- Stats label row: "flex items-center gap-1.5 text-muted-foreground"
- Filter/header row: "flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between py-3 sm:py-5 px-3 sm:px-5"
- Search icon input shell: "relative flex-1 sm:flex-none" + "absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" + "pl-9 h-9 w-full sm:w-[220px]"
*/

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

  const leadCount = rows.filter((row) => row.status === "lead").length;
  const customerCount = rows.filter((row) => row.status === "customer").length;
  const attentionCount = rowsWithBadges.filter((row) => (row.badges ?? []).includes("Needs attention")).length;

  return (
    <section className="animate-page-enter space-y-4 sm:space-y-6">
      <div className="space-y-2 sm:space-y-3">
        <h1 className="text-lg sm:text-[22px] font-semibold leading-relaxed text-foreground">{labels.contact.plural}</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Manage and segment your {labels.contact.plural.toLowerCase()}.</p>
      </div>

      <div className="bg-card text-card-foreground rounded-xl border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-x-0 lg:divide-x sm:divide-y-0 divide-border">
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Total {labels.contact.plural}</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{rows.length}</p>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CircleDot className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Lead Status</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{leadCount}</p>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <UserCheck className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Customers</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{customerCount}</p>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BellRing className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Needs Attention</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{attentionCount}</p>
          </div>
        </div>
      </div>

      <CreateContactForm />

      <form method="get" className="bg-card text-card-foreground rounded-xl border">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between py-3 sm:py-5 px-3 sm:px-5">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input id="contact-search" name="search" defaultValue={search} className="crm-input pl-9 h-9 w-full sm:w-[220px]" placeholder={`Search ${labels.contact.plural.toLowerCase()}...`} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select id="contact-status" name="status" defaultValue={status} className="crm-input h-9 w-[140px] px-3">
              <option value="all">All Status</option>
              <option value="lead">Lead</option>
              <option value="customer">Customer</option>
              <option value="inactive">Inactive</option>
            </select>

            <select id="contact-sort" name="sort" defaultValue={sort} className="crm-input h-9 w-[140px] px-3">
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button type="submit" className="crm-button-secondary h-9 px-4">
              Apply
            </button>
          </div>
        </div>
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
