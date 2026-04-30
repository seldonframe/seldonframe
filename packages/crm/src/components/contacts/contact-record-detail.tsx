"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  StickyNote,
  Tag,
  TrendingUp,
} from "lucide-react";
import { updateContactFieldAction } from "@/lib/contacts/actions";

/**
 * WS2.1 — full Twenty-style contact record page (client).
 *
 * Layout:
 *   - Header: large avatar + name + stage badge + quick-action row
 *   - Tab bar: Overview · Activity · Deals · Emails · Bookings · Notes
 *     (URL-driven via ?tab= so deep links / back-button work)
 *   - Tab body
 *
 * Overview tab is the operator's daily driver — left column is the
 * inline-editable contact form, right column is summary cards (deals
 * total / next booking / last activity). Activity tab is the
 * vertical timeline. Other tabs render the data with simpler
 * surfaces this turn — composer + +link affordances ship next.
 */

export type ContactDetail = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  status: string;
  source: string | null;
  score: number;
  revenue: number;
  createdAt: string;
  updatedAt: string;
  /** Tab union — exported here so the page can pass an initial value. */
  tab?: "overview" | "activity" | "deals" | "emails" | "bookings" | "notes";
};

export type ActivityRow = {
  id: string;
  type: string;
  subject: string | null;
  body: string | null;
  metadata: Record<string, unknown> | null;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type DealRow = {
  id: string;
  title: string;
  stage: string;
  value: string;
  probability: number;
  createdAt: string;
  updatedAt: string;
};

export type BookingRow = {
  id: string;
  title: string;
  bookingSlug: string;
  status: string;
  startsAt: string;
  endsAt: string | null;
  meetingUrl: string | null;
  createdAt: string;
};

const STAGE_PALETTE: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  lead: {
    bg: "bg-sky-500/10",
    text: "text-sky-700 dark:text-sky-300",
    ring: "ring-sky-500/20",
    dot: "bg-sky-500",
  },
  prospect: {
    bg: "bg-violet-500/10",
    text: "text-violet-700 dark:text-violet-300",
    ring: "ring-violet-500/20",
    dot: "bg-violet-500",
  },
  customer: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/20",
    dot: "bg-emerald-500",
  },
  active: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-500/20",
    dot: "bg-emerald-500",
  },
  won: {
    bg: "bg-emerald-600/10",
    text: "text-emerald-700 dark:text-emerald-300",
    ring: "ring-emerald-600/20",
    dot: "bg-emerald-600",
  },
  inactive: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-600 dark:text-zinc-400",
    ring: "ring-zinc-500/20",
    dot: "bg-zinc-500",
  },
  lost: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-600 dark:text-zinc-400",
    ring: "ring-zinc-500/20",
    dot: "bg-zinc-500",
  },
};

function stageStyle(stage: string) {
  const key = stage.trim().toLowerCase();
  return (
    STAGE_PALETTE[key] ?? {
      bg: "bg-muted",
      text: "text-muted-foreground",
      ring: "ring-border",
      dot: "bg-muted-foreground",
    }
  );
}

function fullName(c: { firstName: string; lastName: string | null }) {
  return `${c.firstName} ${c.lastName ?? ""}`.trim() || "(unnamed)";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function relativeFromNow(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return formatDate(value);
  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

const TABS: Array<{
  key: NonNullable<ContactDetail["tab"]>;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "overview", label: "Overview", icon: ClipboardList },
  { key: "activity", label: "Activity", icon: TrendingUp },
  { key: "deals", label: "Deals", icon: Building2 },
  { key: "emails", label: "Emails", icon: Mail },
  { key: "bookings", label: "Bookings", icon: Calendar },
  { key: "notes", label: "Notes", icon: StickyNote },
];

/* ────────────────────────── ContactRecordDetail ────────────────────────── */

export function ContactRecordDetail({
  contact: initialContact,
  activity,
  deals,
  bookings,
  contactLabelSingular,
  contactLabelPlural: _contactLabelPlural,
  dealLabelPlural,
  initialTab,
}: {
  contact: ContactDetail;
  activity: ActivityRow[];
  deals: DealRow[];
  bookings: BookingRow[];
  contactLabelSingular: string;
  contactLabelPlural: string;
  dealLabelPlural: string;
  initialTab: NonNullable<ContactDetail["tab"]>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [contact, setContact] = useState<ContactDetail>(initialContact);
  const [tab, setTab] = useState<NonNullable<ContactDetail["tab"]>>(initialTab);

  // Sync local tab when the URL changes (back/forward navigation).
  useEffect(() => {
    const t = searchParams.get("tab") ?? "overview";
    if (TABS.some((x) => x.key === t) && t !== tab) {
      setTab(t as NonNullable<ContactDetail["tab"]>);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function setTabAndUrl(next: NonNullable<ContactDetail["tab"]>) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "overview") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    router.replace(`${url.pathname}${url.search}`);
  }

  // Sync local contact when server pushes new initialContact (after
  // router.refresh() following an inline edit).
  useEffect(() => {
    setContact(initialContact);
  }, [initialContact]);

  const stage = stageStyle(contact.status);

  const upcomingBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.status !== "cancelled" &&
          b.status !== "completed" &&
          new Date(b.startsAt).getTime() > Date.now()
      ),
    [bookings]
  );
  const pastBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.status === "completed" ||
          b.status === "cancelled" ||
          new Date(b.startsAt).getTime() <= Date.now()
      ),
    [bookings]
  );

  const dealsTotalValue = deals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const lastActivity = activity[0] ?? null;

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8 pt-5 pb-12">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <Avatar name={fullName(contact)} size={64} />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {fullName(contact)}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span
                className={
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset " +
                  `${stage.bg} ${stage.text} ${stage.ring}`
                }
              >
                <span className={`size-1.5 rounded-full ${stage.dot}`} />
                {contact.status}
              </span>
              {contact.company ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="size-3" />
                  {contact.company}
                </span>
              ) : null}
              {contact.title ? (
                <span className="text-xs text-muted-foreground">{contact.title}</span>
              ) : null}
              {contact.source ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Tag className="size-3" />
                  {contact.source}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap items-center gap-2">
          {contact.email ? (
            <a
              href={`mailto:${contact.email}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50"
            >
              <Mail className="size-3.5" />
              Email
            </a>
          ) : null}
          {contact.phone ? (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50"
            >
              <Phone className="size-3.5" />
              Call
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => setTabAndUrl("overview")}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-foreground hover:bg-muted/50"
          >
            <Pencil className="size-3.5" />
            Edit
          </button>
        </div>
      </header>

      {/* Tab bar */}
      <nav
        role="tablist"
        aria-label={`${contactLabelSingular} sections`}
        className="flex flex-wrap gap-0.5 border-b"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          const count =
            t.key === "deals"
              ? deals.length
              : t.key === "bookings"
                ? bookings.length
                : t.key === "activity"
                  ? activity.length
                  : t.key === "notes"
                    ? activity.filter((a) => a.type === "note").length
                    : t.key === "emails"
                      ? activity.filter((a) => a.type === "email").length
                      : 0;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTabAndUrl(t.key)}
              className={
                "relative inline-flex h-10 items-center gap-1.5 px-3 text-sm font-medium transition-colors " +
                (active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <Icon className="size-3.5" />
              {t.label}
              {count > 0 ? (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                  {count}
                </span>
              ) : null}
              {active ? (
                <span className="absolute inset-x-2 -bottom-px h-px bg-primary" />
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Body */}
      {tab === "overview" ? (
        <OverviewTab
          contact={contact}
          onContactChange={setContact}
          deals={deals}
          dealsTotalValue={dealsTotalValue}
          dealLabelPlural={dealLabelPlural}
          upcomingBooking={upcomingBookings[0] ?? null}
          lastActivity={lastActivity}
        />
      ) : tab === "activity" ? (
        <ActivityTab activity={activity} />
      ) : tab === "deals" ? (
        <DealsTab deals={deals} dealLabelPlural={dealLabelPlural} />
      ) : tab === "emails" ? (
        <EmailsTab activity={activity.filter((a) => a.type === "email")} />
      ) : tab === "bookings" ? (
        <BookingsTab upcoming={upcomingBookings} past={pastBookings} />
      ) : (
        <NotesTab activity={activity.filter((a) => a.type === "note")} />
      )}
    </div>
  );
}

/* ────────────────────────── overview tab ────────────────────────── */

function OverviewTab({
  contact,
  onContactChange,
  deals,
  dealsTotalValue,
  dealLabelPlural,
  upcomingBooking,
  lastActivity,
}: {
  contact: ContactDetail;
  onContactChange: (next: ContactDetail) => void;
  deals: DealRow[];
  dealsTotalValue: number;
  dealLabelPlural: string;
  upcomingBooking: BookingRow | null;
  lastActivity: ActivityRow | null;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      {/* Left: editable form */}
      <section className="rounded-xl border bg-card p-5 sm:p-6">
        <header className="flex items-center justify-between gap-2 pb-4 border-b">
          <h2 className="text-sm font-semibold tracking-tight text-foreground">
            Contact details
          </h2>
          <span className="text-[11px] text-muted-foreground">
            Click any field to edit · Enter to save · Esc to cancel
          </span>
        </header>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <EditableField
            label="First name"
            field="firstName"
            value={contact.firstName}
            contactId={contact.id}
            type="text"
            required
            onSaved={(v) => onContactChange({ ...contact, firstName: v })}
          />
          <EditableField
            label="Last name"
            field="lastName"
            value={contact.lastName ?? ""}
            contactId={contact.id}
            type="text"
            onSaved={(v) => onContactChange({ ...contact, lastName: v || null })}
          />
          <EditableField
            label="Email"
            field="email"
            value={contact.email ?? ""}
            contactId={contact.id}
            type="email"
            onSaved={(v) => onContactChange({ ...contact, email: v || null })}
          />
          <EditableField
            label="Phone"
            field="phone"
            value={contact.phone ?? ""}
            contactId={contact.id}
            type="tel"
            onSaved={(v) => onContactChange({ ...contact, phone: v || null })}
          />
          <EditableField
            label="Stage"
            field="status"
            value={contact.status}
            contactId={contact.id}
            type="select"
            options={["lead", "prospect", "customer", "active", "won", "inactive", "lost"]}
            onSaved={(v) => onContactChange({ ...contact, status: v })}
          />
          <ReadonlyField label="Created" value={formatDate(contact.createdAt)} />
        </dl>
      </section>

      {/* Right: summary cards */}
      <aside className="space-y-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-2 pb-3 border-b">
            <h3 className="text-sm font-semibold text-foreground">{dealLabelPlural}</h3>
            <span className="text-xs text-muted-foreground">
              {deals.length} · ${dealsTotalValue.toLocaleString()}
            </span>
          </div>
          {deals.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No deals linked yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {deals.slice(0, 3).map((d) => {
                const ds = stageStyle(d.stage);
                return (
                  <li key={d.id}>
                    <Link
                      href={`/deals/${d.id}`}
                      className="flex items-start justify-between gap-2 rounded-md p-2 hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {d.title}
                        </p>
                        <span
                          className={
                            "mt-0.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] " +
                            `${ds.bg} ${ds.text}`
                          }
                        >
                          <span className={`size-1 rounded-full ${ds.dot}`} />
                          {d.stage}
                        </span>
                      </div>
                      <span className="text-xs font-semibold tabular-nums text-foreground">
                        ${Number(d.value || 0).toLocaleString()}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground pb-3 border-b">
            Next booking
          </h3>
          {upcomingBooking ? (
            <div className="mt-3 space-y-1">
              <p className="text-sm font-medium text-foreground">{upcomingBooking.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(upcomingBooking.startsAt)}
              </p>
              {upcomingBooking.meetingUrl ? (
                <a
                  href={upcomingBooking.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block text-xs text-primary underline-offset-4 hover:underline"
                >
                  Join meeting →
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              No upcoming bookings.
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground pb-3 border-b">
            Last activity
          </h3>
          {lastActivity ? (
            <div className="mt-3 space-y-1">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {activityTypeLabel(lastActivity.type)}
              </p>
              <p className="text-sm text-foreground">
                {lastActivity.subject || activityTypeLabel(lastActivity.type)}
              </p>
              <p className="text-xs text-muted-foreground">
                {relativeFromNow(lastActivity.createdAt)}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">No activity yet.</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground pb-3 border-b">Lifetime</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted-foreground">Revenue</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                ${contact.revenue.toLocaleString()}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted-foreground">Score</dt>
              <dd className="font-semibold tabular-nums text-foreground">
                {contact.score}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-xs text-muted-foreground">Updated</dt>
              <dd className="text-xs text-muted-foreground">
                {relativeFromNow(contact.updatedAt)}
              </dd>
            </div>
          </dl>
        </div>
      </aside>
    </div>
  );
}

/* ────────────────────────── activity tab ────────────────────────── */

function ActivityTab({ activity }: { activity: ActivityRow[] }) {
  if (activity.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-12 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <TrendingUp className="size-6 text-muted-foreground/60" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">No activity yet</p>
            <p className="text-xs text-muted-foreground">
              Form submissions, bookings, emails, and notes will appear here as they
              happen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <ol className="relative space-y-5 border-l border-border pl-5">
        {activity.map((a) => (
          <li key={a.id} className="relative">
            <span className="absolute -left-[27px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-card" />
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {activityTypeLabel(a.type)} · {relativeFromNow(a.createdAt)}
            </div>
            <p className="mt-0.5 text-sm font-medium text-foreground">
              {a.subject || activityTypeLabel(a.type)}
            </p>
            {a.body ? (
              <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                {truncate(a.body, 240)}
              </p>
            ) : null}
            {a.scheduledAt ? (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Scheduled {formatDateTime(a.scheduledAt)}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function activityTypeLabel(type: string) {
  switch (type) {
    case "booking":
      return "Booking";
    case "intake_submission":
      return "Intake submission";
    case "email":
      return "Email";
    case "task":
      return "Task";
    case "note":
      return "Note";
    case "call":
      return "Call";
    case "agent_action":
      return "Agent action";
    default:
      return type.replace(/_/g, " ");
  }
}

function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

/* ────────────────────────── deals / emails / bookings / notes ────────────────────────── */

function DealsTab({ deals, dealLabelPlural }: { deals: DealRow[]; dealLabelPlural: string }) {
  if (deals.length === 0) {
    return (
      <EmptyTab
        icon={Building2}
        title={`No ${dealLabelPlural.toLowerCase()} linked`}
        body={`Once a ${dealLabelPlural.slice(0, -1).toLowerCase()} is created and linked to this client, it will appear here with stage, value, and probability.`}
        cta={{
          label: `Create ${dealLabelPlural.slice(0, -1).toLowerCase()}`,
          href: `/deals?clientId=__contact__`,
        }}
      />
    );
  }
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 text-left font-medium">Title</th>
            <th className="px-4 py-2.5 text-left font-medium">Stage</th>
            <th className="px-4 py-2.5 text-left font-medium">Value</th>
            <th className="px-4 py-2.5 text-left font-medium">Probability</th>
            <th className="px-4 py-2.5 text-left font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {deals.map((d) => {
            const ds = stageStyle(d.stage);
            return (
              <tr key={d.id} className="border-b last:border-b-0 hover:bg-muted/20">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/deals/${d.id}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {d.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs " +
                      `${ds.bg} ${ds.text} ring-1 ring-inset ${ds.ring}`
                    }
                  >
                    <span className={`size-1 rounded-full ${ds.dot}`} />
                    {d.stage}
                  </span>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-foreground">
                  ${Number(d.value || 0).toLocaleString()}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.probability}%</td>
                <td className="px-4 py-2.5 text-muted-foreground">
                  {formatDate(d.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function EmailsTab({ activity }: { activity: ActivityRow[] }) {
  if (activity.length === 0) {
    return (
      <EmptyTab
        icon={Mail}
        title="No emails yet"
        body="Emails sent to or from this client will appear here. Compose surface ships next turn."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {activity.map((a) => (
        <li
          key={a.id}
          className="rounded-xl border bg-card p-4 transition-colors hover:bg-muted/20"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">
                {a.subject || "(no subject)"}
              </p>
              {a.body ? (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {truncate(a.body, 200)}
                </p>
              ) : null}
            </div>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {relativeFromNow(a.createdAt)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function BookingsTab({
  upcoming,
  past,
}: {
  upcoming: BookingRow[];
  past: BookingRow[];
}) {
  if (upcoming.length === 0 && past.length === 0) {
    return (
      <EmptyTab
        icon={Calendar}
        title="No bookings yet"
        body="When this client books a session, it will appear here with date, type, and status."
      />
    );
  }
  return (
    <div className="space-y-5">
      {upcoming.length > 0 ? (
        <BookingList title="Upcoming" rows={upcoming} highlight />
      ) : null}
      {past.length > 0 ? <BookingList title="Past" rows={past} /> : null}
    </div>
  );
}

function BookingList({
  title,
  rows,
  highlight = false,
}: {
  title: string;
  rows: BookingRow[];
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b px-5 py-3">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </header>
      <ul className="divide-y">
        {rows.map((b) => (
          <li
            key={b.id}
            className={
              "flex items-center justify-between gap-3 px-5 py-3 " +
              (highlight ? "" : "opacity-90")
            }
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{b.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(b.startsAt)} ·{" "}
                <span className="capitalize">{b.status.replace(/_/g, " ")}</span>
              </p>
            </div>
            {b.meetingUrl ? (
              <a
                href={b.meetingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline-offset-4 hover:underline"
              >
                Join →
              </a>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function NotesTab({ activity }: { activity: ActivityRow[] }) {
  if (activity.length === 0) {
    return (
      <EmptyTab
        icon={StickyNote}
        title="No notes yet"
        body="Notes you add about this client appear here. Note editor ships in the next turn — for now, notes added via the API or other surfaces show up automatically."
      />
    );
  }
  return (
    <ul className="space-y-3">
      {activity.map((a) => (
        <li key={a.id} className="rounded-xl border bg-card p-4">
          <p className="text-[11px] text-muted-foreground">
            {relativeFromNow(a.createdAt)}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm text-foreground">
            {a.body || a.subject || "(empty note)"}
          </p>
        </li>
      ))}
    </ul>
  );
}

function EmptyTab({
  icon: Icon,
  title,
  body,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="rounded-xl border bg-card p-12 text-center">
      <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
        <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
          <Icon className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{body}</p>
        </div>
        {cta ? (
          <Link
            href={cta.href}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            {cta.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/* ────────────────────────── editable / readonly fields ────────────────────────── */

function EditableField({
  label,
  field,
  value,
  contactId,
  type,
  options,
  required,
  onSaved,
}: {
  label: string;
  field: "firstName" | "lastName" | "email" | "phone" | "status";
  value: string;
  contactId: string;
  type: "text" | "email" | "tel" | "select";
  options?: string[];
  required?: boolean;
  onSaved: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (editing) {
      setDraft(value);
      const el = inputRef.current ?? selectRef.current;
      el?.focus();
      if (inputRef.current) inputRef.current.select();
    }
  }, [editing, value]);

  async function commit(next: string) {
    setEditing(false);
    setError(null);
    if (next === value) return;
    if (required && !next.trim()) {
      setError("Required");
      return;
    }
    setSaving(true);
    startTransition(async () => {
      try {
        await updateContactFieldAction({ contactId, field, value: next });
        onSaved(next);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    });
  }

  if (editing) {
    return (
      <div>
        <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </dt>
        <dd className="mt-1">
          {type === "select" ? (
            <select
              ref={selectRef}
              defaultValue={draft}
              onBlur={(e) => commit(e.target.value)}
              onChange={(e) => commit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              className="crm-input h-8 w-full px-2 text-sm"
            >
              {(options ?? []).map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef}
              type={type}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => commit(draft.trim())}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit(draft.trim());
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                }
              }}
              className="crm-input h-8 w-full px-2 text-sm"
            />
          )}
        </dd>
      </div>
    );
  }

  const display = value || "—";
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd
        onClick={() => setEditing(true)}
        className="mt-1 -mx-1 inline-flex min-h-[28px] cursor-text items-center gap-1.5 rounded px-1 py-0.5 text-sm text-foreground transition-colors hover:bg-muted/40 max-w-full"
      >
        {field === "status" ? (
          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs " +
              `${stageStyle(value).bg} ${stageStyle(value).text}`
            }
          >
            <span className={`size-1 rounded-full ${stageStyle(value).dot}`} />
            {display}
          </span>
        ) : (
          <span className="truncate">{display}</span>
        )}
        {saving ? (
          <span className="text-[10px] text-muted-foreground">saving…</span>
        ) : error ? (
          <span className="text-[10px] text-destructive" title={error}>
            error
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{value}</dd>
    </div>
  );
}

/* ────────────────────────── avatar ────────────────────────── */

function Avatar({ name, size }: { name: string; size: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s.charAt(0).toUpperCase())
    .join("");
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const palettes = [
    "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300",
  ];
  const accent = palettes[Math.abs(hash) % palettes.length];
  return (
    <div
      className={
        "shrink-0 inline-flex items-center justify-center rounded-2xl font-semibold " +
        accent
      }
      style={{ width: size, height: size, fontSize: size * 0.32 }}
      aria-hidden
    >
      {initials || "·"}
    </div>
  );
}

// Re-export for clarity
export { MessageSquare };
