"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Check, Copy, Link as LinkIcon, Pencil, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { WeekCalendar, bookingBorderPalette } from "@/components/bookings/week-calendar";
import { AvailabilityRulesPanel } from "@/components/bookings/availability-rules-panel";
import type { WorkspaceBookingRules } from "@/lib/bookings/workspace-rules";

/*
  Square UI class reference (source of truth):
  - templates-baseui/calendar/components/calendar/calendar-controls.tsx
    - controls shell: "px-3 md:px-6 py-4 border-b border-border"
    - control row: "flex items-center gap-2 md:gap-3 flex-wrap"
  - templates-baseui/calendar/components/calendar/calendar-header.tsx
    - compact title: "text-sm md:text-base lg:text-lg font-semibold text-foreground truncate"
    - muted helper: "text-xs text-muted-foreground"
  - templates-baseui/calendar/components/calendar/event-card.tsx
    - event row shell: "bg-card border border-border rounded-lg ... hover:bg-muted transition-colors"
*/

type SuggestedService = {
  name: string;
  duration?: string;
  price?: number;
  description?: string;
};

type AppointmentTypeMeta = {
  durationMinutes?: number;
  description?: string;
  price?: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  maxBookingsPerDay?: number;
};

const availabilityDefaults = [
  { key: "monday", label: "Mon", enabled: true },
  { key: "tuesday", label: "Tue", enabled: true },
  { key: "wednesday", label: "Wed", enabled: true },
  { key: "thursday", label: "Thu", enabled: true },
  { key: "friday", label: "Fri", enabled: true },
  { key: "saturday", label: "Sat", enabled: false },
  { key: "sunday", label: "Sun", enabled: false },
] as const;

type AppointmentTypeRow = {
  id: string;
  title: string;
  bookingSlug: string;
  metadata: unknown;
};

type BookingRow = {
  id: string;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  status: string;
  contactId: string | null;
  notes: string | null;
};

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
};

type BookingsPageContentProps = {
  labels: {
    contact: { singular: string; plural: string };
    activity: { singular: string; plural: string };
  };
  bookingTypes: AppointmentTypeRow[];
  bookings: BookingRow[];
  contacts: ContactRow[];
  suggestedServices: SuggestedService[];
  orgSlug: string;
  /** 2026-05-17 — base origin for the public booking URL
   *  (https://app.seldonframe.com). Threaded from the server so
   *  operators see + copy the FULL public URL straight from the
   *  appointment-type card. Previously rendered as `/book/<slug>/...`
   *  (relative path), which copy-pasted into a chat with a client as
   *  "/book/..." — unusable. */
  publicBaseUrl: string;
  /** v1.40.9 — workspace IANA timezone (e.g. "America/Los_Angeles").
   *  All booking time renders use this so the operator sees their
   *  local time, not the viewer's browser timezone. Falls back to
   *  "UTC" upstream when not configured. */
  workspaceTimezone: string;
  /** Workspace-level booking availability + rules (Mon-Fri 09:00-17:00
   *  defaults when unset). Initial values for the Availability & booking
   *  rules panel rendered below the calendar. */
  workspaceBookingRules: WorkspaceBookingRules;
  calendarConnected: boolean;
  googleCalendarConnectUrl: string;
  createAppointmentTypeAction: (formData: FormData) => Promise<void>;
  /** 2026-05-18 — wraps updateBookingTypeAction for the inline Edit
   *  sheet on /bookings. Operator reported the Edit button on each
   *  appointment-type card did nothing; this prop is what makes the
   *  sheet's form submit do something real. */
  editAppointmentTypeAction: (formData: FormData) => Promise<void>;
  /** 2026-05-17 — personality-aware placeholders + duration options + quick-
   *  start templates for the Create Type drawer. Falls back to coaching-
   *  flavoured defaults if the workspace has no crmPersonality set. See
   *  lib/crm/template-suggestions.ts. */
  bookingDefaults: import("@/lib/crm/template-suggestions").BookingDefaults;
  /** Task 7 — server actions threaded to WeekCalendar for click-to-create. */
  createBookingAction: (formData: FormData) => Promise<unknown>;
  createBlockedTimeAction: (input: {
    label: string;
    startsAtISO: string;
    durationMinutes: number;
  }) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Task 8 — drag-to-reschedule from the week calendar. */
  rescheduleBookingAction: (input: {
    bookingId: string;
    newStartsAtISO: string;
    notify: boolean;
  }) => Promise<{ ok: true } | { ok: false; error: "not_found" | "conflict" }>;
};

function statusClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "scheduled" || normalized === "completed") {
    return "bg-primary/10 text-primary";
  }

  if (normalized.includes("pending") || normalized.includes("no_show")) {
    return "bg-caution/10 text-caution";
  }

  return "bg-muted/50 text-muted-foreground";
}

// v1.40.9 — every formatter takes an explicit IANA timezone so
// renders are stable regardless of viewer's browser locale.
function formatDateGroupLabel(value: Date, tz: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: tz }).format(value);
}

export function BookingsPageContent({ labels, bookingTypes, bookings, contacts, suggestedServices, orgSlug, publicBaseUrl, workspaceTimezone, workspaceBookingRules, calendarConnected, googleCalendarConnectUrl, createAppointmentTypeAction, editAppointmentTypeAction, bookingDefaults, createBookingAction, createBlockedTimeAction, rescheduleBookingAction }: BookingsPageContentProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  // 2026-05-18 — Edit sheet state. When set, the slide-out renders
  // with this appointment-type's current title / slug / duration /
  // description / price so the operator can update them in place.
  // Pattern mirrors /forms/[id]/edit but kept inline since booking
  // templates have a small editable surface (no field schema editor).
  const [editingType, setEditingType] = useState<AppointmentTypeRow | null>(null);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [draftName, setDraftName] = useState("");
  const [draftDuration, setDraftDuration] = useState("30");
  const [draftPrice, setDraftPrice] = useState("0");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftSlug, setDraftSlug] = useState("");

  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);

  // Used by the Upcoming section to colour-code each booking row with
  // the same left-border palette as the calendar grid cards.
  const bookingTypeBorderByTitle = useMemo(() => {
    const map = new Map<string, string>();
    bookingTypes.forEach((type, index) => {
      map.set(type.title.trim().toLowerCase(), bookingBorderPalette[index % bookingBorderPalette.length]);
    });
    return map;
  }, [bookingTypes]);

  const upcomingGrouped = useMemo(() => {
    const now = new Date();
    const upcoming = bookings
      .filter((row) => new Date(row.startsAt) >= now)
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

    const grouped = new Map<string, BookingRow[]>();

    for (const row of upcoming) {
      const date = new Date(row.startsAt);
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(row);
      grouped.set(key, bucket);
    }

    return [...grouped.entries()].map(([key, rows]) => ({
      key,
      label: formatDateGroupLabel(new Date(rows[0].startsAt), workspaceTimezone),
      rows,
    }));
  }, [bookings]);

  function toDurationOption(value: string | undefined) {
    if (!value) {
      return "30";
    }

    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    if (!Number.isFinite(parsed)) {
      return "30";
    }

    return parsed >= 60 ? "60" : "30";
  }

  function toSlug(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
  }

  function applySuggestedService(service: SuggestedService) {
    setDraftName(service.name);
    setDraftDescription(service.description ?? "");
    setDraftDuration(toDurationOption(service.duration));
    setDraftPrice(String(Number.isFinite(service.price) ? Number(service.price) : 0));
    setDraftSlug(toSlug(service.name));
  }

  return (
    <div className="flex flex-col">
      {/* May 1, 2026 — Connect Google Calendar banner removed. The
          Cal.diy booking page IS the operator's calendar; external sync
          was redundant and the OAuth prefetch caused CORS errors.
          2026-06-15 — order-* swapped so the CALENDAR renders at the TOP
          (order-1) and Appointment Types moves BELOW (order-2). WeekCalendar
          owns its own order-1 class; the Appointment Types section below
          is updated to order-2. */}

      <WeekCalendar
        bookings={bookings}
        contacts={contacts}
        workspaceTimezone={workspaceTimezone}
        workspaceBookingRules={workspaceBookingRules}
        labels={labels}
        bookingTypes={bookingTypes}
        createBookingAction={createBookingAction}
        createBlockedTimeAction={createBlockedTimeAction}
        rescheduleBookingAction={rescheduleBookingAction}
      />

      {/* Workspace availability + booking rules. Sits between the calendar
          (order-1) and Appointment Types (order-2). The panel's own section
          carries order-1 too; equal order ties resolve to DOM order, so it
          renders directly below the calendar. */}
      <AvailabilityRulesPanel
        initialRules={workspaceBookingRules}
        initialTimezone={workspaceTimezone}
      />

      <section className="space-y-3 order-2">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-3 py-3 md:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">Appointment Types</p>
            <p className="text-xs text-muted-foreground">
              Share the link and let {labels.contact.plural.toLowerCase()} book with you.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
              {bookingTypes.length} {bookingTypes.length === 1 ? "type" : "types"}
            </span>
            <button type="button" className="crm-button-primary h-8 px-4 text-xs" onClick={() => setIsPanelOpen(true)}>
              Create Type
            </button>
          </div>
        </div>

        {bookingTypes.length === 0 ? (
          <div className="px-3 pb-3 md:px-6">
            <article className="mx-auto max-w-md rounded-xl border border-dashed border-border/80 bg-background/35 px-5 py-8 text-center">
              <p className="text-sm font-medium text-foreground">Create your first appointment type</p>
              <p className="mt-2 text-xs text-muted-foreground">
                Share the link and let {labels.contact.plural.toLowerCase()} book time with you.
              </p>
              <button type="button" className="crm-button-primary mt-4 h-9 px-5 text-xs" onClick={() => setIsPanelOpen(true)}>
                Create Type
              </button>
            </article>
          </div>
        ) : (
          <div className="grid gap-3 px-3 pb-3 md:grid-cols-2 md:px-6 xl:grid-cols-3">
            {bookingTypes.map((row) => {
              const metadata = (row.metadata as AppointmentTypeMeta | null) ?? null;
              // 2026-05-17 — render the FULL public URL (https://…)
              // not a relative `/book/<slug>/…` path. Operators paste
              // this directly into a client's chat / email / SMS, so
              // the relative form was unusable. publicBaseUrl threaded
              // from the server (process.env.WORKSPACE_BASE_DOMAIN).
              const publicUrl = orgSlug && publicBaseUrl
                ? `${publicBaseUrl}/book/${orgSlug}/${row.bookingSlug}`
                : "";
              const duration = metadata?.durationMinutes ?? 30;
              const price = Number(metadata?.price ?? 0);
              const bufferBefore = metadata?.bufferBeforeMinutes ?? 0;
              const bufferAfter = metadata?.bufferAfterMinutes ?? 0;
              const maxPerDay = metadata?.maxBookingsPerDay;

              return (
                <article
                  key={row.id}
                  className="group/card rounded-xl border border-border/80 bg-card/70 p-4 transition-all hover:border-border hover:bg-card hover:shadow-(--shadow-sm)"
                >
                  {/* Header: title + duration/price meta-line. No floating
                      duration chip — it's part of the metadata row. */}
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">{row.title}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0 text-xs text-muted-foreground">
                      <span className="tabular-nums">{duration} min</span>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">{price > 0 ? `$${price.toFixed(price % 1 === 0 ? 0 : 2)}` : "Free"}</span>
                      {(bufferBefore > 0 || bufferAfter > 0) ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">
                            buffer {bufferBefore}/{bufferAfter}m
                          </span>
                        </>
                      ) : null}
                      {maxPerDay ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="tabular-nums">max {maxPerDay}/day</span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  {metadata?.description ? (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{metadata.description}</p>
                  ) : null}

                  {/* Public URL row — single-line field with an inline Copy
                      affordance. No inset card-in-card. */}
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-2.5 py-1.5">
                    <LinkIcon className="size-3 shrink-0 text-muted-foreground" />
                    <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">
                      {publicUrl || <span className="italic text-muted-foreground">Set org slug to enable</span>}
                    </p>
                    <button
                      type="button"
                      className="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground disabled:opacity-40"
                      disabled={!publicUrl}
                      aria-label="Copy public URL"
                      onClick={() => {
                        if (!publicUrl) return;
                        startTransition(async () => {
                          await navigator.clipboard.writeText(publicUrl);
                          setCopiedSlug(row.bookingSlug);
                          setTimeout(() => setCopiedSlug(null), 1200);
                        });
                      }}
                    >
                      {copiedSlug === row.bookingSlug ? (
                        <Check className="size-3.5 text-positive" />
                      ) : (
                        <Copy className="size-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Edit / Delete as icon buttons — fade in on hover. Keeps
                      the card dense at rest. */}
                  {/* 2026-05-18 — Edit now opens the inline edit sheet
                      below. Delete is still a placeholder pending the
                      deleteAppointmentTypeAction wire-up (next slice). */}
                  <div className="mt-3 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover/card:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 text-[11px] text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                      onClick={() => setEditingType(row)}
                    >
                      <Pencil className="size-3" />
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-7 items-center gap-1 rounded-md border border-border/60 bg-background/60 px-2 text-[11px] text-muted-foreground transition-colors hover:border-negative/40 hover:bg-negative/10 hover:text-negative"
                      title="Delete is wired in the next slice"
                    >
                      <Trash2 className="size-3" />
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3 order-3">
        <div className="flex items-center gap-3 border-b border-border/70 px-3 py-3 md:px-6">
          <p className="truncate text-sm font-semibold text-foreground">
            Upcoming {labels.activity.plural}
          </p>
          <span className="text-xs tabular-nums text-muted-foreground">
            {upcomingGrouped.reduce((sum, group) => sum + group.rows.length, 0)}
          </span>
        </div>

        {upcomingGrouped.length === 0 ? (
          <div className="px-3 pb-3 md:px-6">
            <article className="mx-auto max-w-md rounded-xl border border-dashed border-border/80 bg-background/35 px-5 py-6 text-center text-sm text-muted-foreground">
              No upcoming {labels.activity.plural.toLowerCase()} yet.
            </article>
          </div>
        ) : (
          <article className="mx-3 rounded-xl border border-border/80 bg-card/60 shadow-(--shadow-xs) md:mx-6">
            <div className="divide-y divide-border/60">
              {upcomingGrouped.map((group) => (
                <div key={group.key} className="p-3">
                  <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  <ul className="space-y-1">
                    {group.rows.map((row) => {
                      const startsAt = new Date(row.startsAt);
                      const linkedContact = row.contactId ? contactsById.get(row.contactId) : null;
                      const person = linkedContact
                        ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim()
                        : labels.contact.singular;
                      const borderClass =
                        bookingTypeBorderByTitle.get(row.title.trim().toLowerCase()) ?? "border-l-primary";

                      // 2026-05-18 — same click-through-to-contact pattern
                      // as the calendar event cards above. Operator
                      // expects every booking row across the page to
                      // open the contact (with their booking history,
                      // intake answers, projects, etc.) on click.
                      const rowClass = `flex items-center gap-3 rounded-lg border border-border/60 border-l-[3px] ${borderClass} bg-background/40 px-3 py-2 transition-colors hover:bg-accent/30`;
                      const rowInner = (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
                            <p className="truncate text-xs text-muted-foreground">{person}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <p className="text-xs tabular-nums text-foreground/85">
                              {startsAt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: workspaceTimezone })}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ${statusClass(row.status)}`}
                            >
                              {row.status}
                            </span>
                          </div>
                        </>
                      );

                      return row.contactId ? (
                        <li key={row.id} className="list-none">
                          <Link href={`/contacts/${row.contactId}`} className={rowClass}>
                            {rowInner}
                          </Link>
                        </li>
                      ) : (
                        <li key={row.id} className={rowClass}>
                          {rowInner}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        )}
      </section>

      {/* Sheet replaces the previous hand-rolled `fixed inset-0` drawer. Wins
          from the swap: Radix-style focus trap, ESC-to-close, overlay click,
          portal render (no z-index clashes with filter notice), and built-in
          slide-in animation. Keeping max-w-md on the content (wider than the
          Sheet default sm:max-w-sm) so the booking form doesn't feel cramped. */}
      <Sheet open={isPanelOpen} onOpenChange={setIsPanelOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6">
          <div className="mb-5 flex items-center justify-between">
            <SheetTitle className="text-xl font-medium">Create appointment type</SheetTitle>
            {/* Sheet ships its own X close button at top-right; the explicit
                "Close" link is kept as a secondary affordance for keyboard
                users who don't know about the X. */}
          </div>

            <form
              action={async (formData) => {
                await createAppointmentTypeAction(formData);
                setIsPanelOpen(false);
              }}
              className="space-y-4"
            >
              {/* 2026-05-17 — personality-aware quick-start templates. Surfaces
                  BEFORE the soul-services chips so the operator sees plumbing-
                  or HVAC-shaped names ("Service Call", "Tune-up", "Emergency")
                  instead of having to extrapolate from their service list.
                  Soul-services chips stay below as a second row. */}
              {bookingDefaults.quickStartTemplates.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">Quick start</p>
                  <div className="flex flex-wrap gap-2">
                    {bookingDefaults.quickStartTemplates.map((template) => (
                      <button
                        key={template.name}
                        type="button"
                        className="crm-button-secondary h-8 px-3 text-xs transition-transform duration-150 ease-out hover:scale-[1.02] active:scale-[0.98]"
                        onClick={() => {
                          setDraftName(template.name);
                          setDraftDescription(template.description);
                          setDraftDuration(String(template.durationMinutes));
                          setDraftPrice("0");
                          setDraftSlug(toSlug(template.name));
                        }}
                        title={`${template.durationMinutes} min · ${template.description}`}
                      >
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {suggestedServices.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm text-muted-foreground">From your soul services</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedServices.slice(0, 4).map((service) => (
                      <button
                        key={service.name}
                        type="button"
                        className="crm-button-secondary h-8 px-3 text-xs transition-transform duration-150 ease-out hover:scale-[1.02] active:scale-[0.98]"
                        onClick={() => applySuggestedService(service)}
                      >
                        {service.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <label htmlFor="appointment-name" className="mb-1 block text-sm text-muted-foreground">Appointment name</label>
                <input
                  id="appointment-name"
                  className="crm-input h-9 w-full px-3"
                  name="name"
                  placeholder={bookingDefaults.namePlaceholder}
                  required
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                />
              </div>

              <div>
                <label htmlFor="appointment-duration" className="mb-1 block text-sm text-muted-foreground">Duration</label>
                <select
                  id="appointment-duration"
                  className="crm-input h-9 w-full px-3"
                  name="durationMinutes"
                  value={draftDuration}
                  onChange={(event) => setDraftDuration(event.target.value)}
                >
                  {bookingDefaults.durationOptions.map((minutes) => (
                    <option key={minutes} value={String(minutes)}>
                      {minutes < 60 ? `${minutes} min` : minutes % 60 === 0 ? `${minutes / 60}h` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="appointment-price" className="mb-1 block text-sm text-muted-foreground">Price</label>
                <input
                  id="appointment-price"
                  className="crm-input h-9 w-full px-3"
                  name="price"
                  type="number"
                  min={0}
                  step="0.01"
                  value={draftPrice}
                  onChange={(event) => setDraftPrice(event.target.value)}
                />
              </div>

              <div>
                <label htmlFor="appointment-description" className="mb-1 block text-sm text-muted-foreground">Description</label>
                <input
                  id="appointment-description"
                  className="crm-input h-9 w-full px-3"
                  name="description"
                  placeholder={bookingDefaults.descriptionPlaceholder}
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="appointment-buffer-before" className="mb-1 block text-sm text-muted-foreground">Buffer before (min)</label>
                  <input
                    id="appointment-buffer-before"
                    className="crm-input h-9 w-full px-3"
                    name="bufferBeforeMinutes"
                    type="number"
                    min={0}
                    max={120}
                    defaultValue="0"
                  />
                </div>
                <div>
                  <label htmlFor="appointment-buffer-after" className="mb-1 block text-sm text-muted-foreground">Buffer after (min)</label>
                  <input
                    id="appointment-buffer-after"
                    className="crm-input h-10 w-full px-3"
                    name="bufferAfterMinutes"
                    type="number"
                    min={0}
                    max={120}
                    defaultValue="0"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="appointment-max-per-day" className="mb-1 block text-sm text-muted-foreground">Max bookings per day (0 = unlimited)</label>
                <input
                  id="appointment-max-per-day"
                  className="crm-input h-10 w-full px-3"
                  name="maxBookingsPerDay"
                  type="number"
                  min={0}
                  max={50}
                  defaultValue="0"
                />
              </div>

              <div className="rounded-xl border border-border bg-muted/25 p-3">
                <p className="mb-3 text-sm font-medium text-foreground">Working hours</p>
                <div className="space-y-2">
                  {availabilityDefaults.map((day) => (
                    <div key={day.key} className="grid grid-cols-[56px_1fr_1fr_1fr] items-center gap-2">
                      <span className="text-xs text-muted-foreground">{day.label}</span>
                      <select
                        className="crm-input h-9 w-full px-2 text-xs"
                        name={`availability.${day.key}.enabled`}
                        defaultValue={day.enabled ? "true" : "false"}
                      >
                        <option value="true">On</option>
                        <option value="false">Off</option>
                      </select>
                      <input className="crm-input h-9 w-full px-2 text-xs" type="time" name={`availability.${day.key}.start`} defaultValue="09:00" />
                      <input className="crm-input h-9 w-full px-2 text-xs" type="time" name={`availability.${day.key}.end`} defaultValue="17:00" />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="appointment-slug" className="mb-1 block text-sm text-muted-foreground">Public slug</label>
                <input
                  id="appointment-slug"
                  className="crm-input h-9 w-full px-3"
                  name="slug"
                  placeholder={bookingDefaults.slugPlaceholder}
                  required
                  value={draftSlug}
                  onChange={(event) => setDraftSlug(event.target.value)}
                />
              </div>

              <div className="pt-2">
                <button type="submit" className="crm-button-primary h-10 px-6" disabled={pending}>
                  {pending ? "Creating..." : "Create Type"}
                </button>
              </div>
            </form>
        </SheetContent>
      </Sheet>

      {/* 2026-05-18 — Edit appointment-type sheet. Operator reported
          the Edit button did nothing; this sheet provides the inline
          editor with name / public URL slug / duration / description /
          price. Save calls editAppointmentTypeAction (server action
          wrapper around the existing typed updateBookingTypeAction).
          revalidatePath in the server action refreshes the listing. */}
      <Sheet open={editingType !== null} onOpenChange={(open) => !open && setEditingType(null)}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6">
          <SheetTitle className="text-xl font-medium">Edit appointment type</SheetTitle>
          {editingType ? (
            (() => {
              const meta = (editingType.metadata as AppointmentTypeMeta | null) ?? {};
              return (
                <form
                  className="mt-5 space-y-4"
                  action={(formData) => {
                    formData.set("bookingId", editingType.id);
                    startTransition(async () => {
                      await editAppointmentTypeAction(formData);
                      setEditingType(null);
                    });
                  }}
                >
                  <div className="space-y-1">
                    <label htmlFor="edit-type-name" className="text-label">Name</label>
                    <input
                      id="edit-type-name"
                      name="name"
                      defaultValue={editingType.title}
                      required
                      className="crm-input h-10 w-full px-3"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="edit-type-slug" className="text-label">Public URL slug</label>
                    <input
                      id="edit-type-slug"
                      name="slug"
                      defaultValue={editingType.bookingSlug}
                      className="crm-input h-10 w-full px-3"
                    />
                    <p className="text-xs text-muted-foreground">
                      Used in /book/{orgSlug}/&lt;slug&gt;. Lowercase, hyphens only.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="edit-type-duration" className="text-label">Duration (minutes)</label>
                    <input
                      id="edit-type-duration"
                      name="durationMinutes"
                      type="number"
                      min={5}
                      max={480}
                      defaultValue={meta.durationMinutes ?? 30}
                      className="crm-input h-10 w-full px-3"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="edit-type-price" className="text-label">Price ($)</label>
                    <input
                      id="edit-type-price"
                      name="price"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={meta.price ?? 0}
                      className="crm-input h-10 w-full px-3"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="edit-type-description" className="text-label">Description</label>
                    <textarea
                      id="edit-type-description"
                      name="description"
                      defaultValue={meta.description ?? ""}
                      rows={4}
                      className="crm-input w-full p-3"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending}>
                      {pending ? "Saving..." : "Save changes"}
                    </button>
                    <button
                      type="button"
                      className="crm-button-ghost h-10 px-4"
                      onClick={() => setEditingType(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              );
            })()
          ) : null}
        </SheetContent>
      </Sheet>

    </div>
  );
}
