"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Building2,
  Calendar,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  DollarSign,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  MessageSquare,
  Pencil,
  Phone,
  Plus,
  StickyNote,
  Tag,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { updateContactFieldAction } from "@/lib/contacts/actions";
import { createActivityAction, completeTaskAction, updateActivityNotesAction } from "@/lib/activities/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import { PortalAccessCard } from "./portal-access-card";
import { ContactDocumentsTab, type DocumentRow } from "./contact-documents-tab";
import type { PersonalityField } from "@/lib/crm/personality";

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
  /** May 1, 2026 — Client Portal V1 fields. */
  portalAccessEnabled?: boolean;
  portalLastLoginAt?: string | null;
  /** CRMPersonality industry-specific values (HVAC system_age, LEGAL
   *  practice_area, etc.). Sourced from contacts.custom_fields. */
  customFields?: Record<string, unknown> | null;
  /** Tab union — exported here so the page can pass an initial value. */
  tab?: "overview" | "activity" | "deals" | "emails" | "bookings" | "notes" | "documents";
};

/**
 * May 1, 2026 — Client Portal V1: Plan-gate result threaded down from
 * the page-level server component into the Overview aside so the
 * Portal Access card can render the right state (toggle vs upgrade
 * CTA) without an extra client-side fetch.
 */
export type PortalGateInfo = {
  allowed: boolean;
  reason?: string | null;
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

/**
 * Display label overrides for contact status values.
 * The stored value (e.g. "customer") never changes — only the
 * label shown in the badge and editable field is remapped.
 * "customer", "won", and "active" all display as "Customer".
 */
const STAGE_DISPLAY_LABEL: Record<string, string> = {
  customer: "Customer",
  won: "Customer",
  active: "Customer",
};

function stageDisplayLabel(status: string): string {
  const key = status.trim().toLowerCase();
  return STAGE_DISPLAY_LABEL[key] ?? status;
}

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

function formatIndustryFieldValue(
  raw: unknown,
  field: PersonalityField
): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  if (field.type === "date") {
    return formatDate(typeof raw === "string" ? raw : String(raw));
  }
  if (field.type === "checkbox") {
    return raw ? "Yes" : "No";
  }
  if (field.type === "number") {
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) ? n.toLocaleString() : String(raw);
  }
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  return JSON.stringify(raw);
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
  { key: "documents", label: "Documents", icon: FileText },
  { key: "notes", label: "Notes", icon: StickyNote },
];

/* ────────────────────────── ContactRecordDetail ────────────────────────── */

export function ContactRecordDetail({
  contact: initialContact,
  activity,
  deals,
  bookings,
  documents,
  contactLabelSingular,
  contactLabelPlural: _contactLabelPlural,
  dealLabelPlural,
  industryFields = [],
  initialTab,
  orgId,
  orgSlug,
  clientWorkspaceSlug,
  portalGate,
  appOrigin,
  userId,
}: {
  contact: ContactDetail;
  activity: ActivityRow[];
  deals: DealRow[];
  bookings: BookingRow[];
  /** May 1, 2026 — Client Portal V1: file uploads on the Documents tab. */
  documents?: DocumentRow[];
  contactLabelSingular: string;
  contactLabelPlural: string;
  dealLabelPlural: string;
  /** CRMPersonality industry-specific field schema for the aside. */
  industryFields?: PersonalityField[];
  initialTab: NonNullable<ContactDetail["tab"]>;
  /** May 1, 2026 — needed by the Portal Access card in the aside. */
  orgId?: string;
  orgSlug?: string | null;
  /**
   * The slug of the client's own SeldonFrame workspace, resolved from
   * customFields.workspaceId by the page server component. Null when
   * the contact has no linked workspace.
   */
  clientWorkspaceSlug?: string | null;
  portalGate?: PortalGateInfo;
  appOrigin?: string | null;
  /** Current operator's user id — needed to log new activities. */
  userId?: string | null;
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
                {stageDisplayLabel(contact.status)}
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
                      : t.key === "documents"
                        ? documents?.length ?? 0
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
          industryFields={industryFields}
          orgId={orgId}
          orgSlug={orgSlug ?? null}
          clientWorkspaceSlug={clientWorkspaceSlug ?? null}
          portalGate={portalGate}
          appOrigin={appOrigin ?? null}
        />
      ) : tab === "activity" ? (
        <ActivityTab activity={activity} contactId={contact.id} userId={userId ?? null} />
      ) : tab === "deals" ? (
        <DealsTab deals={deals} dealLabelPlural={dealLabelPlural} />
      ) : tab === "emails" ? (
        <EmailsTab activity={activity.filter((a) => a.type === "email")} />
      ) : tab === "bookings" ? (
        <BookingsTab upcoming={upcomingBookings} past={pastBookings} />
      ) : tab === "documents" ? (
        orgId ? (
          <ContactDocumentsTab
            orgId={orgId}
            contactId={contact.id}
            documents={documents ?? []}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Workspace context unavailable — refresh the page.
          </p>
        )
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
  lastActivity: _lastActivity,
  industryFields,
  orgId,
  orgSlug,
  clientWorkspaceSlug,
  portalGate,
  appOrigin,
}: {
  contact: ContactDetail;
  onContactChange: (next: ContactDetail) => void;
  deals: DealRow[];
  dealsTotalValue: number;
  dealLabelPlural: string;
  upcomingBooking: BookingRow | null;
  lastActivity: ActivityRow | null;
  industryFields: PersonalityField[];
  orgId?: string;
  orgSlug: string | null;
  clientWorkspaceSlug: string | null;
  portalGate?: PortalGateInfo;
  appOrigin: string | null;
}) {
  const cf = (contact.customFields ?? {}) as Record<string, unknown>;

  // ── Metric strip values ──────────────────────────────────────────
  const plan = cf.plan as
    | { monthlyPriceCents?: number; setupFeeCents?: number; pricingTier?: string; services?: string[] }
    | null
    | undefined;

  const mrr: number = plan?.monthlyPriceCents
    ? plan.monthlyPriceCents / 100
    : // Fallback: sum monthly value of all non-lost deals.
      deals
        .filter((d) => d.stage !== "lost")
        .reduce((sum, d) => sum + Number(d.value || 0), 0);

  const openDealsCount = deals.filter((d) => d.stage !== "lost").length;

  // ── Billing / workspace customFields ────────────────────────────
  const billing = cf.billing as
    | {
        card?: { brand?: string; last4?: string; expMonth?: number; expYear?: number } | null;
        address?: {
          line1?: string;
          line2?: string;
          city?: string;
          state?: string;
          postalCode?: string;
          country?: string;
        } | null;
      }
    | null
    | undefined;

  const googleBusinessUrl =
    typeof cf.googleBusinessUrl === "string" ? cf.googleBusinessUrl : null;

  // ── Inline intake keys (shown in Client & Business section) ──────
  const INTAKE_ORDER = [
    "address",
    "service",
    "description",
    "damage_type",
    "property_type",
    "issue_type",
    "scope",
    "urgency",
    "timeline",
    "budget_range",
    "frequency",
    "concern",
    "primary_goal",
    "company",
    "role",
    "team_size",
  ];

  // Keys that are handled by named sections; excluded from "Booking page answers"
  const NAMED_KEYS = new Set([
    ...INTAKE_ORDER,
    "phone",
    "plan",
    "workspaceId",
    "billing",
    "googleBusinessUrl",
  ]);
  const industryKeySet = new Set(industryFields.map((f) => f.key));

  const residualIntakeKeys = Object.keys(contact.customFields ?? {}).filter(
    (k) => !industryKeySet.has(k) && !NAMED_KEYS.has(k) && (cf[k] ?? "") !== "",
  );

  // ── Workspace URL ────────────────────────────────────────────────
  const appOriginClean = appOrigin?.replace(/\/$/, "") ?? "";
  const workspaceUrl = clientWorkspaceSlug
    ? `${appOriginClean || "https://app.seldonframe.com"}/${clientWorkspaceSlug}`
    : null;

  return (
    <div className="space-y-5">
      {/* ── Metric strip ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Lifetime revenue"
          value={`$${contact.revenue.toLocaleString()}`}
          icon={DollarSign}
        />
        <MetricCard
          label="Monthly / MRR"
          value={mrr > 0 ? `$${mrr.toLocaleString()}/mo` : "—"}
          icon={TrendingUp}
        />
        <MetricCard
          label="Open deals"
          value={openDealsCount > 0 ? String(openDealsCount) : "—"}
          icon={Zap}
        />
        <MetricCard
          label="Next booking"
          value={upcomingBooking ? formatDateTime(upcomingBooking.startsAt) : "—"}
          icon={Calendar}
        />
      </div>

      {/* ── Main two-column grid: center (wide) + right rail (slim) ── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,1.4fr)]">

        {/* ── CENTER column ─────────────────────────────────────── */}
        <div className="space-y-4">

          {/* 1. Client & business — inline-editable contact form */}
          <section className="rounded-xl border bg-card p-5 sm:p-6">
            <header className="flex items-center justify-between gap-2 pb-4 border-b">
              <h2 className="text-sm font-semibold tracking-tight text-foreground">
                Client &amp; business
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
              {INTAKE_ORDER.filter((key) => {
                const v = cf[key];
                return typeof v === "string" && v.trim().length > 0;
              }).map((key) => {
                const label = key
                  .replace(/_/g, " ")
                  .replace(/\b\w/g, (c) => c.toUpperCase());
                return (
                  <ReadonlyField key={key} label={label} value={String(cf[key])} />
                );
              })}
            </dl>
          </section>

          {/* 2. Plan & services */}
          {plan ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold tracking-tight text-foreground pb-4 border-b">
                Plan &amp; services
              </h2>
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {plan.monthlyPriceCents != null ? (
                    <span className="font-semibold text-foreground tabular-nums">
                      ${(plan.monthlyPriceCents / 100).toLocaleString()}/mo
                    </span>
                  ) : null}
                  {plan.setupFeeCents != null && plan.setupFeeCents > 0 ? (
                    <span className="text-muted-foreground text-xs">
                      · ${(plan.setupFeeCents / 100).toLocaleString()} setup
                    </span>
                  ) : null}
                  {plan.pricingTier ? (
                    <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                      {plan.pricingTier}
                    </span>
                  ) : null}
                </div>
                {plan.services && plan.services.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {plan.services.map((svc) => (
                      <span
                        key={svc}
                        className="rounded-md bg-muted px-2.5 py-1 text-xs text-foreground"
                      >
                        {svc}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* 3. Workspace */}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground pb-4 border-b">
              Workspace
            </h2>
            {workspaceUrl ? (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-muted-foreground break-all">{workspaceUrl}</p>
                <a
                  href={workspaceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Open workspace
                  <ExternalLink className="size-3" />
                </a>
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">—</p>
            )}
          </section>

          {/* 4. Billing */}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground pb-4 border-b flex items-center gap-2">
              <CreditCard className="size-3.5 text-muted-foreground" />
              Billing
            </h2>
            {billing?.card || billing?.address ? (
              <div className="mt-4 space-y-3">
                {billing.card ? (
                  <p className="text-sm text-foreground">
                    <span className="font-mono">····</span>{" "}
                    {billing.card.last4} · {billing.card.brand ?? "card"} · exp{" "}
                    {billing.card.expMonth?.toString().padStart(2, "0")}/
                    {billing.card.expYear?.toString().slice(-2) ?? "??"}
                  </p>
                ) : null}
                {billing.address ? (
                  <address className="not-italic text-xs text-muted-foreground space-y-0.5">
                    {billing.address.line1 ? <div>{billing.address.line1}</div> : null}
                    {billing.address.line2 ? <div>{billing.address.line2}</div> : null}
                    {billing.address.city || billing.address.state || billing.address.postalCode ? (
                      <div>
                        {[
                          billing.address.city,
                          billing.address.state,
                          billing.address.postalCode,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    ) : null}
                    {billing.address.country ? <div>{billing.address.country}</div> : null}
                  </address>
                ) : null}
              </div>
            ) : (
              <p className="mt-4 text-xs text-muted-foreground">—</p>
            )}
          </section>

          {/* 5. Business profile */}
          {(googleBusinessUrl || industryFields.length > 0 || residualIntakeKeys.length > 0) ? (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold tracking-tight text-foreground pb-4 border-b flex items-center gap-2">
                <Globe className="size-3.5 text-muted-foreground" />
                Business profile
              </h2>
              <div className="mt-4 space-y-4">
                {googleBusinessUrl ? (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                      Google Business
                    </p>
                    <a
                      href={googleBusinessUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-primary underline-offset-4 hover:underline break-all"
                    >
                      {googleBusinessUrl}
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  </div>
                ) : null}
                {industryFields.length > 0 ? (
                  <dl className="space-y-2 text-sm">
                    {industryFields.map((field) => {
                      const raw = contact.customFields?.[field.key];
                      const value = formatIndustryFieldValue(raw, field);
                      return (
                        <div key={field.key} className="flex items-start justify-between gap-3">
                          <dt className="text-xs text-muted-foreground">{field.label}</dt>
                          <dd
                            className={`text-right text-xs ${
                              value === "—" ? "text-muted-foreground" : "text-foreground"
                            }`}
                          >
                            {value}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}
                {residualIntakeKeys.length > 0 ? (
                  <dl className="space-y-2 text-sm">
                    {residualIntakeKeys.map((key) => {
                      const raw = cf[key];
                      const label = key
                        .replace(/[_-]+/g, " ")
                        .replace(/\b\w/g, (c) => c.toUpperCase());
                      const value =
                        typeof raw === "string"
                          ? raw
                          : typeof raw === "number" || typeof raw === "boolean"
                            ? String(raw)
                            : raw === null || raw === undefined
                              ? "—"
                              : JSON.stringify(raw);
                      return (
                        <div key={key} className="flex items-start justify-between gap-3">
                          <dt className="text-xs text-muted-foreground">{label}</dt>
                          <dd className="text-right text-xs text-foreground max-w-[60%] break-words">
                            {value}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                ) : null}
              </div>
            </section>
          ) : null}

          {/* May 1, 2026 — Client Portal V1: operator-side access toggle. */}
          {orgId && portalGate ? (
            <PortalAccessCard
              contactId={contact.id}
              contactEmail={contact.email}
              orgId={orgId}
              orgSlug={orgSlug}
              initialEnabled={contact.portalAccessEnabled ?? false}
              lastLoginAt={contact.portalLastLoginAt ?? null}
              planAllowed={portalGate.allowed}
              planReason={portalGate.reason ?? null}
              appOrigin={appOrigin}
            />
          ) : null}
        </div>

        {/* ── RIGHT rail (slim) — relational context ──────────────── */}
        <aside className="space-y-4">
          {/* Deals */}
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
                {deals.slice(0, 5).map((d) => {
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

          {/* Next booking */}
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
        </aside>
      </div>
    </div>
  );
}

/* ────────────────────────── metric card ────────────────────────── */

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        <Icon className="size-3.5" />
        <span className="text-[11px] uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-lg font-semibold tabular-nums text-foreground leading-tight">
        {value}
      </p>
    </div>
  );
}

/* ────────────────────────── activity tab ────────────────────────── */

const COMPOSER_TYPES = [
  { value: "call", label: "Call" },
  { value: "email", label: "Email" },
  { value: "task", label: "Task" },
  { value: "meeting", label: "Event" },
  { value: "note", label: "Note" },
] as const;

type ComposerType = (typeof COMPOSER_TYPES)[number]["value"];

const SCHEDULED_AT_TYPES: ComposerType[] = ["task", "meeting"];

/**
 * Log-activity composer embedded in the Activity tab.
 * Maps the 5 user-facing types (Call, Email, Task, Event, Note)
 * to activity.type values: call, email, task, meeting, note.
 */
function ActivityComposer({
  contactId,
  userId,
}: {
  contactId: string;
  userId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ComposerType>("note");
  const [pending, startTransition] = useTransition();
  const { showDemoToast } = useDemoToast();

  const showScheduledAt = SCHEDULED_AT_TYPES.includes(type);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          "mb-4 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground " +
          "transition-colors duration-fast " +
          "hover:bg-primary/90 active:bg-primary/80 " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        }
      >
        <Plus className="size-3.5" />
        Log activity
      </button>
    );
  }

  return (
    <form
      className="mb-4 rounded-xl border bg-card p-4 space-y-3"
      action={(formData) => {
        formData.set("contactId", contactId);
        formData.set("userId", userId ?? "");
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }
            await createActivityAction(formData);
            setOpen(false);
            setType("note");
            router.refresh();
          } catch (error) {
            if (isDemoBlockedError(error)) {
              showDemoToast();
              return;
            }
            throw error;
          }
        });
      }}
    >
      {/* Type selector */}
      <div className="flex flex-wrap gap-1.5">
        {COMPOSER_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={
              "h-7 rounded-[11px] px-3 text-xs font-medium " +
              "transition-[background-color,color,box-shadow] duration-fast " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
              (type === t.value
                ? "bg-primary text-primary-foreground shadow-xs"
                : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground active:bg-muted")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <input type="hidden" name="type" value={type} />

      <input
        className="crm-input h-9 w-full px-3 text-sm"
        name="subject"
        placeholder="Subject (e.g. 'Discovery call')"
        required
      />

      <textarea
        className="crm-input min-h-[72px] w-full p-3 text-sm"
        name="body"
        placeholder="Details (optional)"
      />

      {showScheduledAt ? (
        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {type === "task" ? "Due date / time" : "Event date / time"}
          </label>
          <input
            className="crm-input h-9 w-full px-3 text-sm"
            name="scheduledAt"
            type="datetime-local"
          />
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className={
            "h-8 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground " +
            "transition-colors duration-fast " +
            "hover:bg-primary/90 active:bg-primary/80 " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
            "disabled:opacity-60 disabled:pointer-events-none"
          }
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={
            "h-8 rounded-md px-3 text-xs text-muted-foreground " +
            "transition-colors duration-fast " +
            "hover:bg-muted hover:text-foreground " +
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          }
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/**
 * Modal drawer showing full activity detail + editable notes + task
 * completion. Opens when the operator clicks any timeline row.
 */
function ActivityDetailModal({
  activity: a,
  onClose,
  onActivityUpdated,
}: {
  activity: ActivityRow;
  onClose: () => void;
  onActivityUpdated: (updated: Partial<ActivityRow>) => void;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<string>(
    typeof a.metadata?.notes === "string" ? a.metadata.notes : ""
  );
  const [notesPending, startNotesTx] = useTransition();
  const [taskPending, startTaskTx] = useTransition();
  const [savedNote, setSavedNote] = useState(false);
  const { showDemoToast } = useDemoToast();

  const isTask = a.type === "task";
  const isDone = Boolean(a.completedAt);

  function saveNotes() {
    startNotesTx(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }
        await updateActivityNotesAction({ activityId: a.id, notes });
        setSavedNote(true);
        setTimeout(() => setSavedNote(false), 2000);
        onActivityUpdated({ metadata: { ...(a.metadata ?? {}), notes } });
        router.refresh();
      } catch (err) {
        if (isDemoBlockedError(err)) {
          showDemoToast();
          return;
        }
        throw err;
      }
    });
  }

  function markDone() {
    startTaskTx(async () => {
      try {
        if (isDemoReadonlyClient) {
          showDemoToast();
          return;
        }
        await completeTaskAction(a.id);
        onActivityUpdated({ completedAt: new Date().toISOString() });
        router.refresh();
      } catch (err) {
        if (isDemoBlockedError(err)) {
          showDemoToast();
          return;
        }
        throw err;
      }
    });
  }

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    /* Backdrop — fades in on mount */
    <div
      className={
        "fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 " +
        "animate-in fade-in duration-200 motion-reduce:animate-none"
      }
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Dimmed backdrop layer */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-hidden
      />

      {/* Panel —
           mobile:  slides up from bottom (full-width, rounded top corners only)
           desktop: fades + scales up from ~0.97 (centered dialog style)
           Both use 220ms with the app's premium ease.
           prefers-reduced-motion: no transform/scale, plain fade only. */}
      <div
        className={
          "relative w-full sm:max-w-lg " +
          /* mobile sheet shape */
          "rounded-t-2xl sm:rounded-2xl " +
          "border bg-card shadow-modal " +
          /* desktop: scale-up entrance */
          "sm:animate-in sm:fade-in-0 sm:zoom-in-[0.97] " +
          /* mobile: slide-up entrance */
          "animate-in slide-in-from-bottom-4 " +
          "duration-[220ms] ease-premium " +
          "motion-reduce:animate-none motion-reduce:transform-none"
        }
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {activityTypeLabel(a.type)}
              </span>
              {isTask && isDone ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="size-2.5" />
                  Done
                </span>
              ) : null}
            </div>
            <h2 className="mt-1.5 text-base font-semibold text-foreground leading-snug">
              {a.subject || activityTypeLabel(a.type)}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {formatDateTime(a.createdAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={
              "shrink-0 rounded-md p-1 text-muted-foreground " +
              "transition-colors duration-fast " +
              "hover:bg-muted hover:text-foreground " +
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            }
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Details */}
          {a.body ? (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                Details
              </p>
              <p className="whitespace-pre-line text-sm text-foreground">{a.body}</p>
            </div>
          ) : null}

          {a.scheduledAt ? (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                {isTask ? "Due" : "Scheduled"}
              </p>
              <p className="text-sm text-foreground">{formatDateTime(a.scheduledAt)}</p>
            </div>
          ) : null}

          {/* Editable notes */}
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Notes
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Record what was said, decisions made, next steps…"
              className="crm-input w-full p-3 text-sm min-h-[80px] resize-y"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={saveNotes}
                disabled={notesPending}
                className={
                  "h-7 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground " +
                  "transition-colors duration-fast " +
                  "hover:bg-primary/90 active:bg-primary/80 " +
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  "disabled:opacity-60 disabled:pointer-events-none"
                }
              >
                {notesPending ? "Saving…" : savedNote ? "Saved!" : "Save notes"}
              </button>
            </div>
          </div>

          {/* Task completion */}
          {isTask && !isDone ? (
            <div className="border-t pt-4">
              <button
                type="button"
                onClick={markDone}
                disabled={taskPending}
                className={
                  "inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-xs font-medium " +
                  "border border-emerald-500/40 bg-emerald-500/10 " +
                  "text-emerald-700 dark:text-emerald-300 " +
                  "transition-colors duration-fast " +
                  "hover:bg-emerald-500/20 hover:border-emerald-500/60 " +
                  "active:bg-emerald-500/30 " +
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  "disabled:opacity-60 disabled:pointer-events-none"
                }
              >
                <CheckCircle2 className="size-3.5" />
                {taskPending ? "Marking done…" : "Mark as done"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ActivityTab({
  activity,
  contactId,
  userId,
}: {
  activity: ActivityRow[];
  contactId: string;
  userId: string | null;
}) {
  // Local mirror of activity so task completions reflect immediately
  // without waiting for the full router.refresh() round-trip.
  const [localActivity, setLocalActivity] = useState<ActivityRow[]>(activity);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Sync when the server pushes fresh data (after router.refresh).
  useEffect(() => {
    setLocalActivity(activity);
  }, [activity]);

  const selected = localActivity.find((a) => a.id === selectedId) ?? null;

  function patchActivity(id: string, patch: Partial<ActivityRow>) {
    setLocalActivity((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...patch } : a))
    );
  }

  return (
    <div className="space-y-0">
      {/* Composer */}
      <ActivityComposer contactId={contactId} userId={userId} />

      {/* Timeline */}
      {localActivity.length === 0 ? (
        <div className="rounded-xl border bg-card p-12 text-center">
          <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
            <TrendingUp className="size-6 text-muted-foreground/60" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground">
                Use the button above to log a call, email, task, event, or note.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-5 sm:p-6">
          <ol className="relative space-y-5 border-l border-border pl-5">
            {localActivity.map((a) => {
              const isDone = Boolean(a.completedAt);
              return (
                <li key={a.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className={
                      "group w-full text-left rounded-lg border border-transparent px-3 py-2.5 -mx-3 " +
                      "transition-[background-color,border-color] duration-fast ease-premium " +
                      "hover:bg-accent/60 hover:border-border/60 " +
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-card " +
                      "cursor-pointer"
                    }
                  >
                    <span
                      className={
                        "absolute -left-[27px] top-[18px] size-2.5 rounded-full ring-4 ring-card " +
                        (isDone ? "bg-emerald-500" : "bg-primary")
                      }
                    />
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                      {activityTypeLabel(a.type)} · {relativeFromNow(a.createdAt)}
                      {isDone ? (
                        <CheckCircle2 className="size-3 text-emerald-500" />
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-foreground transition-colors duration-fast group-hover:text-primary">
                      {a.subject || activityTypeLabel(a.type)}
                    </p>
                    {a.body ? (
                      <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">
                        {truncate(a.body, 180)}
                      </p>
                    ) : null}
                    {a.scheduledAt ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {a.type === "task" ? "Due" : "Scheduled"} {formatDateTime(a.scheduledAt)}
                      </p>
                    ) : null}
                    {typeof a.metadata?.notes === "string" && a.metadata.notes.trim() ? (
                      <p className="mt-1 text-[11px] italic text-muted-foreground">
                        Note: {truncate(a.metadata.notes, 100)}
                      </p>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {/* Detail modal */}
      {selected ? (
        <ActivityDetailModal
          activity={selected}
          onClose={() => setSelectedId(null)}
          onActivityUpdated={(patch) => patchActivity(selected.id, patch)}
        />
      ) : null}
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
            {stageDisplayLabel(value) || display}
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
