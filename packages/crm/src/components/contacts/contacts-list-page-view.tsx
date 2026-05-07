// v1.24.0 — shared contacts-list page view (admin + operator portal)
//
// One source of truth for the /contacts list surface. Used by:
//   - /contacts/page.tsx                      (admin dashboard)
//   - /portal/<slug>/contacts/page.tsx        (operator portal mirror)
//
// Caller passes `orgId` (resolved from their respective auth source)
// + `hrefBase` (e.g. "/contacts" or "/portal/<slug>/contacts") +
// `dealsHrefBase` so internal links resolve to the right surface.
//
// Read-mode in v1.24.0 — the existing inline-edit / bulk-select /
// status-change actions are still wired but use NextAuth-only server
// actions; the operator portal sets `readonly` to hide write
// affordances until v1.24.1 ships dual-auth server actions.

import { and, desc, eq, inArray } from "drizzle-orm";
import { Filter, Search, Users, UserCheck, BellRing, CircleDot } from "lucide-react";
import { db } from "@/db";
import { activities, deals } from "@/db/schema";
import { listContacts } from "@/lib/contacts/actions";
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

export type ContactsListPageSearchParams = {
  search?: string;
  status?: string;
  sort?: "recent" | "name_asc" | "name_desc" | "score_desc" | "score_asc";
  dateRange?: "all" | "month" | "week" | "today";
  import?: string;
};

export type ContactsListPageViewProps = {
  /** orgId resolved by the caller (admin: from NextAuth session;
   *  operator portal: from sf_operator_session cookie). */
  orgId: string;
  /** Search params from the URL — same shape both surfaces use. */
  searchParams: ContactsListPageSearchParams;
  /** Base href for the contacts list itself (filter form action). */
  baseHref: string;
  /** Base href for contact-detail links. "/contacts" admin /
   *  "/portal/<slug>/contacts" operator. */
  contactDetailHrefBase: string;
  /** Base href for deal-detail links. */
  dealDetailHrefBase: string;
  /** Read-only render mode — operator portal sets this true until
   *  v1.24.1 ships dual-auth write actions. */
  readonly?: boolean;
};

export async function ContactsListPageView({
  orgId,
  searchParams,
  baseHref,
  contactDetailHrefBase,
  dealDetailHrefBase,
  readonly = false,
}: ContactsListPageViewProps) {
  const search = (searchParams.search ?? "").trim();
  const status = (searchParams.status ?? "all").trim() || "all";
  const sort = searchParams.sort ?? "recent";
  const dateRange = searchParams.dateRange ?? "all";
  const showCsvImport = searchParams.import === "csv";

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
    getLabels(orgId),
    listContacts({
      orgId,
      search: search || undefined,
      status,
      sort,
      createdAfter,
    }),
    getSoul(orgId),
  ]);

  const contactIds = rows.map((r) => r.id);
  const nowMs = now.getTime();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;

  const hasFollowUpSignals =
    soul?.journey?.stages?.some((stage) =>
      stage.autoActions?.some((action) =>
        /follow.?up|check.?in|re-?engage|attention/i.test(action),
      ),
    ) ?? false;

  const activityRows =
    contactIds.length > 0
      ? await db
          .select({
            id: activities.id,
            contactId: activities.contactId,
            type: activities.type,
            subject: activities.subject,
            createdAt: activities.createdAt,
          })
          .from(activities)
          .where(
            and(
              eq(activities.orgId, orgId),
              inArray(activities.contactId, contactIds),
            ),
          )
          .orderBy(desc(activities.createdAt))
          .limit(contactIds.length * ACTIVITY_PER_CONTACT_CAP)
      : [];

  const dealRows =
    contactIds.length > 0
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

  const activityByContact: Record<string, ActivityItem[]> = {};
  const notesByContact: Record<string, NoteItem[]> = {};
  for (const a of activityRows) {
    if (!a.contactId) continue;
    const item: ActivityItem = {
      id: a.id,
      type: a.type,
      contactId: a.contactId,
      subject: a.subject,
      occurredAt:
        a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
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
    (r) => nowMs - new Date(r.createdAt).getTime() <= thirtyDaysMs,
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
        {readonly ? null : (
          <ContactsPageActions
            search={search}
            status={status}
            sort={sort}
            dateRange={dateRange}
          />
        )}
      </div>

      {showCsvImport && !readonly ? (
        <CsvImport stageOptions={stageOptions.length > 0 ? stageOptions : ["lead"]} />
      ) : null}

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

      <form
        method="get"
        action={baseHref}
        className="bg-card text-card-foreground rounded-xl border"
      >
        <input type="hidden" name="dateRange" value={dateRange} />
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between py-3 sm:py-5 px-3 sm:px-5">
          <div className="relative flex-1 sm:flex-none">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              id="contact-search"
              name="search"
              type="search"
              defaultValue={search}
              placeholder={`Search ${labels.contact.plural.toLowerCase()}…`}
              className="h-10 w-full sm:w-[280px] pl-9 pr-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Filter className="size-4 text-muted-foreground" />
            <select
              name="status"
              defaultValue={status}
              className="h-9 px-2 bg-background border border-border rounded-md text-sm"
            >
              <option value="all">All statuses</option>
              <option value="lead">Lead</option>
              <option value="qualified">Qualified</option>
              <option value="customer">Customer</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              name="sort"
              defaultValue={sort}
              className="h-9 px-2 bg-background border border-border rounded-md text-sm"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="h-9 px-3 text-sm font-medium bg-primary text-primary-foreground rounded-md"
            >
              Apply
            </button>
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
        csvImportHref={`${baseHref}?import=csv`}
        newContactHref={`${contactDetailHrefBase}/new`}
        contactDetailHrefBase={contactDetailHrefBase}
        dealDetailHrefBase={dealDetailHrefBase}
        readonly={readonly}
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
    <div className="px-4 py-3 sm:px-5 sm:py-4 flex items-center gap-3">
      <div className="flex-shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground">
        {icon}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-semibold tracking-tight">{value}</p>
      </div>
    </div>
  );
}
