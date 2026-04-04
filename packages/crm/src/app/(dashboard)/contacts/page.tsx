import { listContacts } from "@/lib/contacts/actions";
import { getLabels } from "@/lib/soul/labels";
import { getSoul } from "@/lib/soul/server";
import Link from "next/link";
import { Filter, Search, Users, UserCheck, BellRing, CircleDot } from "lucide-react";
import { ContactsPageActions } from "@/components/contacts/contacts-page-actions";

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
  searchParams: Promise<{ search?: string; status?: string; sort?: "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc"; dateRange?: "all" | "month" | "week" | "today" }>;
}) {
  const params = await searchParams;
  const search = (params.search ?? "").trim();
  const status = (params.status ?? "all").trim() || "all";
  const sort = params.sort ?? "recent";
  const dateRange = params.dateRange ?? "all";

  const now = new Date();
  let createdAfter: Date | undefined;

  if (dateRange === "month") {
    createdAfter = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (dateRange === "week") {
    const day = now.getDay();
    const daysFromMonday = day === 0 ? 6 : day - 1;
    createdAfter = new Date(now);
    createdAfter.setDate(now.getDate() - daysFromMonday);
    createdAfter.setHours(0, 0, 0, 0);
  } else if (dateRange === "today") {
    createdAfter = new Date(now);
    createdAfter.setHours(0, 0, 0, 0);
  }

  const [labels, rows, soul] = await Promise.all([
    getLabels(),
    listContacts({
      search: search || undefined,
      status,
      sort,
      createdAfter,
    }),
    getSoul(),
  ]);

  const nowMs = now.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
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
      createdAtMs,
    };
  });

  const totalContacts = rows.length;
  const newThisMonth = rowsWithBadges.filter((row) => Number.isFinite(row.createdAtMs) && nowMs - row.createdAtMs <= thirtyDaysMs).length;
  const activeCount = rows.filter((row) => row.status !== "inactive").length;
  const dormantCount = rows.filter((row) => row.status === "inactive").length;

  const rowsForTable = rowsWithBadges.map((row) => {
    const createdAtRaw = (row as { createdAt?: Date | string }).createdAt;
    const createdAt = createdAtRaw ? new Date(createdAtRaw) : null;
    const fullName = `${row.firstName} ${row.lastName ?? ""}`.trim();
    const phone = (row as { phone?: string | null }).phone ?? null;
    const isRecent = createdAt ? nowMs - createdAt.getTime() <= sevenDaysMs : false;
    return {
      ...row,
      fullName,
      phone,
      createdAtLabel: createdAt
        ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(createdAt)
        : "—",
      stageLabel: row.status,
      isRecent,
    };
  });

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-background w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <ContactsPageActions search={search} status={status} sort={sort} dateRange={dateRange} />
      </div>

      <div className="bg-card text-card-foreground rounded-xl border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-x-0 lg:divide-x sm:divide-y-0 divide-border">
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Users className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Total {labels.contact.plural}</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{totalContacts}</p>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <CircleDot className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">New This Month</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{newThisMonth}</p>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <UserCheck className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Active</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{activeCount}</p>
          </div>
          <div className="p-4 sm:p-6 space-y-4">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <BellRing className="size-4 sm:size-[18px]" />
              <span className="text-xs sm:text-sm font-medium">Inactive / Dormant</span>
            </div>
            <p className="text-2xl sm:text-[28px] font-semibold tracking-tight">{dormantCount}</p>
          </div>
        </div>
      </div>

      <form method="get" className="bg-card text-card-foreground rounded-xl border">
        <input type="hidden" name="dateRange" value={dateRange} />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between py-3 sm:py-5 px-3 sm:px-5">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input id="contact-search" name="search" defaultValue={search} className="crm-input pl-9 h-9 w-full sm:w-[180px]" placeholder="Search here..." />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <select id="contact-status" name="status" defaultValue={status} className="crm-input h-9 w-[148px] pl-9 pr-3">
                <option value="all">All Status</option>
                <option value="lead">Lead</option>
                <option value="customer">Customer</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <select id="contact-sort" name="sort" defaultValue={sort} className="crm-input h-9 w-[148px] px-3">
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button type="submit" className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground">
              <span>Apply</span>
            </button>

            <ContactsPageActions search={search} status={status} sort={sort} dateRange={dateRange} mode="table-import" />
          </div>
        </div>
      </form>

      <div className="bg-card text-card-foreground rounded-xl border">
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap min-w-[180px]">Name</th>
                <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap min-w-[200px]">Email</th>
                <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap min-w-[130px]">Phone</th>
                <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap min-w-[110px]">Stage</th>
                <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap min-w-[130px]">Created On</th>
                <th className="h-10 px-2 text-left align-middle font-medium whitespace-nowrap min-w-[90px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rowsForTable.length === 0 ? (
                <tr className="border-b">
                  <td colSpan={6} className="px-2 py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
                        <Users className="size-6 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">No contacts found.</p>
                      <Link href="/contacts/new" className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm text-background transition-colors hover:bg-foreground/90">
                        Add your first contact
                      </Link>
                    </div>
                  </td>
                </tr>
              ) : (
                rowsForTable.map((row) => (
                  <tr key={row.id} className="border-b transition-colors hover:bg-muted/50">
                    <td className="p-2 align-middle whitespace-nowrap">
                      <Link href={`/contacts/${row.id}`} className="font-medium text-sm hover:underline">
                        {row.fullName || labels.contact.singular}
                      </Link>
                    </td>
                    <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">{row.email ?? "—"}</td>
                    <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">{row.phone ?? "—"}</td>
                    <td className="p-2 align-middle whitespace-nowrap">
                      <span className="inline-flex h-6 items-center rounded-md border border-border bg-secondary px-2 text-xs font-medium text-secondary-foreground">
                        {row.stageLabel}
                      </span>
                    </td>
                    <td className="p-2 align-middle whitespace-nowrap text-muted-foreground">{row.createdAtLabel}</td>
                    <td className="p-2 align-middle whitespace-nowrap">
                      <Link href={`/contacts/${row.id}`} className="text-xs text-primary hover:underline">Open</Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
