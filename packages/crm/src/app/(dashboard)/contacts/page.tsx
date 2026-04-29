import { and, eq, inArray, desc } from "drizzle-orm";
import { Filter, Search, Users, UserCheck, BellRing, CircleDot } from "lucide-react";
import { db } from "@/db";
import { activities, deals } from "@/db/schema";
import { listContacts } from "@/lib/contacts/actions";
import { getOrgId } from "@/lib/auth/helpers";
import { getLabels } from "@/lib/soul/labels";
import { getSoul } from "@/lib/soul/server";
import { ContactsPageActions } from "@/components/contacts/contacts-page-actions";
import { CsvImport } from "@/components/contacts/csv-import";
import {
  ContactsTableView,
  type ActivityItem,
  type ContactRow,
  type DealLink,
  type NoteItem,
} from "@/components/contacts/contacts-table-view";

/**
 * /contacts (Clients) — WS2.1 Twenty-style overhaul.
 *
 * Server-loads contacts + their recent activity + linked deals + notes,
 * then hands off to the `<ContactsTableView>` client component which
 * owns the sortable table, inline cell editing, side-panel detail view,
 * and bulk-select chrome.
 *
 * Why we fetch related data eagerly here:
 *   - The side panel opens instantly when a row is clicked. If we
 *     deferred the fetch to a client-side useEffect, the panel would
 *     show a spinner on every click — bad UX for a CRM where the
 *     panel is the primary interaction surface.
 *   - We cap each per-contact list (activities ≤ 20, deals ≤ 10,
 *     notes ≤ 10) so the SSR payload stays bounded for orgs with
 *     thousands of clients.
 */

const sortOptions = [
  { value: "recent", label: "Newest" },
  { value: "name_asc", label: "Name A→Z" },
  { value: "name_desc", label: "Name Z→A" },
  { value: "score_desc", label: "Score High→Low" },
  { value: "score_asc", label: "Score Low→High" },
] as const;

const ACTIVITY_PER_CONTACT_CAP = 20;
const DEALS_PER_CONTACT_CAP = 10;
const NOTES_PER_CONTACT_CAP = 10;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{
    search?: string;
    status?: string;
    sort?: "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc";
    dateRange?: "all" | "month" | "week" | "today";
    import?: string;
  }>;
}) {
  const params = await searchParams;
  const search = (params.search ?? "").trim();
  const status = (params.status ?? "all").trim() || "all";
  const sort = params.sort ?? "recent";
  const dateRange = params.dateRange ?? "all";
  const showCsvImport = params.import === "csv";

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

  const [labels, rows, soul, orgId] = await Promise.all([
    getLabels(),
    listContacts({
      search: search || undefined,
      status,
      sort,
      createdAfter,
    }),
    getSoul(),
    getOrgId(),
  ]);

  const contactIds = rows.map((r) => r.id);
  const nowMs = now.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const hasFollowUpSignals =
    soul?.journey?.stages?.some((stage) =>
      stage.autoActions?.some((action) =>
        /follow.?up|check.?in|re-?engage|attention/i.test(action)
      )
    ) ?? false;

  /* ─── Side-panel data ─── */

  // Recent activity for every contact in one shot, then bucket client-side.
  // Cap conservatively to keep the SSR payload small.
  const activityRows =
    orgId && contactIds.length > 0
      ? await db
          .select({
            id: activities.id,
            contactId: activities.contactId,
            type: activities.type,
            subject: activities.subject,
            createdAt: activities.createdAt,
          })
          .from(activities)
          .where(and(eq(activities.orgId, orgId), inArray(activities.contactId, contactIds)))
          .orderBy(desc(activities.createdAt))
          .limit(contactIds.length * ACTIVITY_PER_CONTACT_CAP)
      : [];

  const dealRows =
    orgId && contactIds.length > 0
      ? await db
          .select({
            id: deals.id,
            contactId: deals.contactId,
            title: deals.title,
            stage: deals.stage,
            value: deals.value,
            createdAt: deals.createdAt,
          })
          .from(deals)
          .where(and(eq(deals.orgId, orgId), inArray(deals.contactId, contactIds)))
          .orderBy(desc(deals.createdAt))
          .limit(contactIds.length * DEALS_PER_CONTACT_CAP)
      : [];

  // Notes are activities with `type = 'note'` — same table, filtered tab.
  // For the v1 tab we surface those alongside the dedicated note rows.
  const activityByContact: Record<string, ActivityItem[]> = {};
  const notesByContact: Record<string, NoteItem[]> = {};
  for (const a of activityRows) {
    if (!a.contactId) continue;
    const item: ActivityItem = {
      id: a.id,
      type: a.type,
      contactId: a.contactId,
      subject: a.subject,
      occurredAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
    };
    const bucket = (activityByContact[a.contactId] ??= []);
    if (bucket.length < ACTIVITY_PER_CONTACT_CAP) bucket.push(item);

    if (a.type === "note") {
      const noteBucket = (notesByContact[a.contactId] ??= []);
      if (noteBucket.length < NOTES_PER_CONTACT_CAP) {
        noteBucket.push({
          id: a.id,
          contactId: a.contactId,
          body: a.subject ?? "",
          createdAt: item.occurredAt,
        });
      }
    }
  }

  const dealsByContact: Record<string, DealLink[]> = {};
  for (const d of dealRows) {
    const bucket = (dealsByContact[d.contactId] ??= []);
    if (bucket.length < DEALS_PER_CONTACT_CAP) {
      bucket.push({
        id: d.id,
        contactId: d.contactId,
        title: d.title,
        stage: d.stage,
        value: String(d.value),
      });
    }
  }

  /* ─── Stats + table rows ─── */

  const tableRows: ContactRow[] = rows.map((row) => {
    const createdAtRaw = (row as { createdAt?: Date | string }).createdAt;
    const updatedAtRaw = (row as { updatedAt?: Date | string }).updatedAt;
    const createdAtIso =
      createdAtRaw instanceof Date
        ? createdAtRaw.toISOString()
        : typeof createdAtRaw === "string"
          ? createdAtRaw
          : new Date().toISOString();
    const updatedAtIso =
      updatedAtRaw instanceof Date
        ? updatedAtRaw.toISOString()
        : typeof updatedAtRaw === "string"
          ? updatedAtRaw
          : createdAtIso;

    const createdAtMs = new Date(createdAtIso).getTime();
    const updatedAtMs = new Date(updatedAtIso).getTime();
    const badges: string[] = [];
    if (Number.isFinite(createdAtMs) && nowMs - createdAtMs <= thirtyDaysMs) {
      badges.push("New");
    }
    if (
      hasFollowUpSignals &&
      Number.isFinite(updatedAtMs) &&
      nowMs - updatedAtMs >= fourteenDaysMs
    ) {
      badges.push("Needs attention");
    }

    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName ?? null,
      email: row.email ?? null,
      phone: (row as { phone?: string | null }).phone ?? null,
      status: row.status,
      source: (row as { source?: string | null }).source ?? null,
      createdAt: createdAtIso,
      updatedAt: updatedAtIso,
      badges,
    };
  });

  const stageOptions = Array.isArray(soul?.pipeline?.stages)
    ? soul.pipeline.stages
        .map((stage) => stage.name)
        .filter((stage): stage is string => Boolean(stage?.trim()))
    : [];

  const totalContacts = rows.length;
  const newThisMonth = tableRows.filter(
    (r) => nowMs - new Date(r.createdAt).getTime() <= thirtyDaysMs
  ).length;
  const activeCount = rows.filter((row) => row.status !== "inactive").length;
  const dormantCount = rows.filter((row) => row.status === "inactive").length;

  return (
    <main className="animate-page-enter flex-1 overflow-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 bg-background w-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-lg sm:text-[22px] font-semibold tracking-tight leading-relaxed text-foreground">
            {labels.contact.plural}
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage every {labels.contact.singular.toLowerCase()} who&apos;s booked, submitted
            an intake, or been added by hand.
          </p>
        </div>
        <ContactsPageActions search={search} status={status} sort={sort} dateRange={dateRange} />
      </div>

      {showCsvImport ? (
        <CsvImport stageOptions={stageOptions.length > 0 ? stageOptions : ["lead"]} />
      ) : null}

      {/* Stat cards */}
      <div className="bg-card text-card-foreground rounded-xl border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-x-0 lg:divide-x sm:divide-y-0 divide-border">
          <StatCell
            icon={<Users className="size-4 sm:size-[18px]" />}
            label={`Total ${labels.contact.plural}`}
            value={totalContacts}
          />
          <StatCell
            icon={<CircleDot className="size-4 sm:size-[18px]" />}
            label="New This Month"
            value={newThisMonth}
          />
          <StatCell
            icon={<UserCheck className="size-4 sm:size-[18px]" />}
            label="Active"
            value={activeCount}
          />
          <StatCell
            icon={<BellRing className="size-4 sm:size-[18px]" />}
            label="Inactive / Dormant"
            value={dormantCount}
          />
        </div>
      </div>

      {/* URL-driven filter chrome — kept as a server-component form */}
      <form method="get" className="bg-card text-card-foreground rounded-xl border">
        <input type="hidden" name="dateRange" value={dateRange} />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between py-3 sm:py-5 px-3 sm:px-5">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              id="contact-search"
              name="search"
              defaultValue={search}
              className="crm-input pl-9 h-9 w-full sm:w-[220px]"
              placeholder="Search clients..."
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <select
                id="contact-status"
                name="status"
                defaultValue={status}
                className="crm-input h-9 w-[148px] pl-9 pr-3"
              >
                <option value="all">All Status</option>
                <option value="lead">Lead</option>
                <option value="customer">Customer</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <select
              id="contact-sort"
              name="sort"
              defaultValue={sort}
              className="crm-input h-9 w-[148px] px-3"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <span>Apply</span>
            </button>

            <ContactsPageActions
              search={search}
              status={status}
              sort={sort}
              dateRange={dateRange}
              mode="table-import"
            />
          </div>
        </div>
      </form>

      <ContactsTableView
        rows={tableRows}
        contactLabelSingular={labels.contact.singular}
        contactLabelPlural={labels.contact.plural}
        stageOptions={stageOptions}
        activityByContact={activityByContact}
        dealsByContact={dealsByContact}
        notesByContact={notesByContact}
        csvImportHref="/contacts?import=csv"
        newContactHref="/contacts/new"
      />
    </main>
  );
}

function StatCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="p-4 sm:p-6 space-y-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span aria-hidden>{icon}</span>
        <span className="text-xs sm:text-sm font-medium">{label}</span>
      </div>
      <p className="text-2xl sm:text-[28px] font-semibold tracking-tight tabular-nums">{value}</p>
    </div>
  );
}
