"use client";

import { useMemo, useState, useTransition } from "react";

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
  status: string;
  contactId: string | null;
};

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
};

type BookingsPageContentProps = {
  labels: {
    contact: { singular: string; plural: string };
    activity: { singular: string; plural: string };
  };
  bookingTypes: AppointmentTypeRow[];
  bookings: BookingRow[];
  contacts: ContactRow[];
  orgSlug: string;
  createAppointmentTypeAction: (formData: FormData) => Promise<void>;
};

function statusClass(status: string) {
  const normalized = status.toLowerCase();

  if (normalized === "scheduled" || normalized === "completed") {
    return "bg-primary/10 text-primary";
  }

  if (normalized.includes("pending") || normalized.includes("no_show")) {
    return "bg-amber-500/10 text-amber-300";
  }

  return "bg-white/10 text-white/60";
}

function formatDateGroupLabel(value: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" }).format(value);
}

export function BookingsPageContent({ labels, bookingTypes, bookings, contacts, orgSlug, createAppointmentTypeAction }: BookingsPageContentProps) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const contactsById = useMemo(() => new Map(contacts.map((contact) => [contact.id, contact])), [contacts]);

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
      label: formatDateGroupLabel(new Date(rows[0].startsAt)),
      rows,
    }));
  }, [bookings]);

  return (
    <>
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-white/50">Appointment Types</p>
            <p className="mt-1 text-sm text-white/70">Share the link and let {labels.contact.plural.toLowerCase()} book with you.</p>
          </div>
          <button type="button" className="crm-button-primary h-10 px-6" onClick={() => setIsPanelOpen(true)}>
            Create Type
          </button>
        </div>

        {bookingTypes.length === 0 ? (
          <article className="glass-card flex min-h-52 flex-col items-center justify-center rounded-2xl p-8 text-center">
            <p className="text-3xl">📅</p>
            <p className="mt-3 text-lg font-medium text-white">Create your first appointment type</p>
            <p className="mt-1 text-sm text-white/60">Share the link and let {labels.contact.plural.toLowerCase()} book with you.</p>
            <button type="button" className="crm-button-primary mt-5 h-10 px-6" onClick={() => setIsPanelOpen(true)}>
              Create Type
            </button>
          </article>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {bookingTypes.map((row) => {
              const metadata = (row.metadata as AppointmentTypeMeta | null) ?? null;
              const publicUrl = orgSlug ? `/book/${orgSlug}/${row.bookingSlug}` : "";

              return (
                <article key={row.id} className="glass-card rounded-2xl p-5">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h3 className="text-base font-medium text-white">{row.title}</h3>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-white/70">{metadata?.durationMinutes ?? 30} min</span>
                  </div>

                  <p className="text-sm text-white/70">{metadata?.description || "No description added."}</p>
                  <p className="mt-2 text-sm font-semibold text-white">${Number(metadata?.price ?? 0).toFixed(2)}</p>
                  <p className="mt-1 text-xs text-white/45">
                    Buffer {metadata?.bufferBeforeMinutes ?? 0}m before / {metadata?.bufferAfterMinutes ?? 0}m after
                    {metadata?.maxBookingsPerDay ? ` • Max ${metadata.maxBookingsPerDay}/day` : ""}
                  </p>

                  <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3">
                    <p className="text-xs uppercase tracking-wider text-white/45">Public URL</p>
                    <p className="mt-1 truncate text-sm text-white/80">{publicUrl || "Set org slug to enable"}</p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        className="crm-button-secondary h-9 px-4 text-xs"
                        onClick={() => {
                          if (!publicUrl) {
                            return;
                          }

                          startTransition(async () => {
                            await navigator.clipboard.writeText(publicUrl);
                            setCopiedSlug(row.bookingSlug);
                            setTimeout(() => setCopiedSlug(null), 1200);
                          });
                        }}
                      >
                        {copiedSlug === row.bookingSlug ? "Copied" : "Copy URL"}
                      </button>
                      <button type="button" className="crm-button-ghost h-9 px-4 text-xs">
                        Edit
                      </button>
                      <button type="button" className="crm-button-ghost h-9 px-4 text-xs text-amber-200 hover:text-amber-100">
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-white/50">Upcoming {labels.activity.plural}</p>
        </div>

        {upcomingGrouped.length === 0 ? (
          <article className="glass-card rounded-2xl p-6 text-sm text-white/60">No upcoming {labels.activity.plural.toLowerCase()} yet.</article>
        ) : (
          <article className="glass-card rounded-2xl p-4">
            <div className="space-y-4">
              {upcomingGrouped.map((group) => (
                <div key={group.key}>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wider text-white/45">{group.label}</p>
                  <ul className="space-y-2">
                    {group.rows.map((row) => {
                      const startsAt = new Date(row.startsAt);
                      const linkedContact = row.contactId ? contactsById.get(row.contactId) : null;
                      const person = linkedContact ? `${linkedContact.firstName} ${linkedContact.lastName ?? ""}`.trim() : labels.contact.singular;

                      return (
                        <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-3 hover:bg-white/5">
                          <div className="min-w-0">
                            <p className="text-sm text-white/85">{row.title}</p>
                            <p className="text-xs text-white/45">{person}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <p className="text-sm text-primary">{startsAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
                            <span className={`rounded-full px-2 py-1 text-xs ${statusClass(row.status)}`}>{row.status}</span>
                          </div>
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

      {isPanelOpen ? (
        <div className="fixed inset-0 z-50 flex">
          <button type="button" aria-label="Close panel" className="h-full flex-1 bg-black/50" onClick={() => setIsPanelOpen(false)} />
          <aside className="h-full w-full max-w-md border-l border-white/10 bg-[hsl(var(--background))] p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-medium text-white">Create appointment type</h2>
              <button type="button" className="crm-button-ghost h-9 px-4" onClick={() => setIsPanelOpen(false)}>
                Close
              </button>
            </div>

            <form
              action={async (formData) => {
                await createAppointmentTypeAction(formData);
                setIsPanelOpen(false);
              }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="appointment-name" className="mb-1 block text-sm text-white/75">Appointment name</label>
                <input id="appointment-name" className="crm-input h-10 w-full px-3" name="name" placeholder="Strategy Call" required />
              </div>

              <div>
                <label htmlFor="appointment-duration" className="mb-1 block text-sm text-white/75">Duration</label>
                <select id="appointment-duration" className="crm-input h-10 w-full px-3" name="durationMinutes" defaultValue="30">
                  <option value="30">30 min</option>
                  <option value="60">60 min</option>
                </select>
              </div>

              <div>
                <label htmlFor="appointment-price" className="mb-1 block text-sm text-white/75">Price</label>
                <input id="appointment-price" className="crm-input h-10 w-full px-3" name="price" type="number" min={0} step="0.01" defaultValue="0" />
              </div>

              <div>
                <label htmlFor="appointment-description" className="mb-1 block text-sm text-white/75">Description</label>
                <input id="appointment-description" className="crm-input h-10 w-full px-3" name="description" placeholder="Initial planning session" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label htmlFor="appointment-buffer-before" className="mb-1 block text-sm text-white/75">Buffer before (min)</label>
                  <input
                    id="appointment-buffer-before"
                    className="crm-input h-10 w-full px-3"
                    name="bufferBeforeMinutes"
                    type="number"
                    min={0}
                    max={120}
                    defaultValue="0"
                  />
                </div>
                <div>
                  <label htmlFor="appointment-buffer-after" className="mb-1 block text-sm text-white/75">Buffer after (min)</label>
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
                <label htmlFor="appointment-max-per-day" className="mb-1 block text-sm text-white/75">Max bookings per day (0 = unlimited)</label>
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

              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="mb-3 text-sm font-medium text-white/85">Working hours</p>
                <div className="space-y-2">
                  {availabilityDefaults.map((day) => (
                    <div key={day.key} className="grid grid-cols-[56px_1fr_1fr_1fr] items-center gap-2">
                      <span className="text-xs text-white/60">{day.label}</span>
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
                <label htmlFor="appointment-slug" className="mb-1 block text-sm text-white/75">Public slug</label>
                <input id="appointment-slug" className="crm-input h-10 w-full px-3" name="slug" placeholder="strategy-call" required />
              </div>

              <div className="pt-2">
                <button type="submit" className="crm-button-primary h-10 px-6" disabled={pending}>
                  {pending ? "Creating..." : "Create Type"}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
