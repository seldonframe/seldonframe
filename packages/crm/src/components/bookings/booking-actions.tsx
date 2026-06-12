"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Mail, MapPin, Phone, X } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BookingActionsProps = {
  bookingId: string;
  title: string;
  /** Resolved display name of the linked contact, or null when none. */
  contactName: string | null;
  /** Linked contact id — enables the "Open contact" link when present. */
  contactId: string | null;
  /** Linked contact's phone / email, when a contact is linked. */
  contactPhone: string | null;
  contactEmail: string | null;
  /** Booking notes / job details. May lead with an "Address: …" line for
   *  manually-created bookings whose new contact had no address column. */
  notes: string | null;
  /** Booking start as a UTC Date. */
  startsAt: Date;
  /** IANA timezone of the workspace — used for display only. */
  workspaceTimezone: string;
  /** Server action: cancels the booking by id, then revalidates /bookings. */
  cancelBookingAction: (bookingId: string) => Promise<unknown>;
  /** Server action: saves edited notes by id, then revalidates /bookings. */
  updateBookingNotesAction: (
    bookingId: string,
    notes: string,
  ) => Promise<unknown>;
  /** Called after a successful cancel so the parent can refresh the calendar. */
  onCancelled: () => void;
  onClose: () => void;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatLocalTime(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/** Pull a leading "Address: …" line out of the notes so it can render as a
 *  dedicated field. Returns the extracted address (or null) and the
 *  remaining notes with that line removed. */
function splitAddressFromNotes(notes: string | null): {
  address: string | null;
  rest: string;
} {
  if (!notes) return { address: null, rest: "" };
  const lines = notes.split("\n");
  const idx = lines.findIndex((l) => /^address:\s*/i.test(l.trim()));
  if (idx === -1) return { address: null, rest: notes };
  const address = lines[idx].trim().replace(/^address:\s*/i, "").trim();
  const rest = lines.filter((_, i) => i !== idx).join("\n").trim();
  return { address: address || null, rest };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingActions({
  bookingId,
  title,
  contactName,
  contactId,
  contactPhone,
  contactEmail,
  notes,
  startsAt,
  workspaceTimezone,
  cancelBookingAction,
  updateBookingNotesAction,
  onCancelled,
  onClose,
}: BookingActionsProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

  // The address (if any) is stored as a leading line inside the notes; pull it
  // out for its own field and edit only the remaining free-text notes. On save
  // we re-prepend the address so it's preserved.
  const { address, rest } = splitAddressFromNotes(notes);
  const [notesDraft, setNotesDraft] = useState(rest);
  const [notesSaved, setNotesSaved] = useState(false);
  const [savingNotes, startNotesTransition] = useTransition();

  // Close on outside-click or Escape — same pattern as create-popover.tsx.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onMouseDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [onClose]);

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      try {
        await cancelBookingAction(bookingId);
        onCancelled();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not cancel booking.");
      }
    });
  }

  function handleSaveNotes() {
    setError(null);
    setNotesSaved(false);
    // Preserve the address line (it lives in the same notes column) by
    // re-prepending it to whatever free-text the operator edited.
    const next = [address ? `Address: ${address}` : "", notesDraft.trim()]
      .filter(Boolean)
      .join("\n")
      .trim();
    startNotesTransition(async () => {
      try {
        await updateBookingNotesAction(bookingId, next);
        setNotesSaved(true);
        window.setTimeout(() => setNotesSaved(false), 1500);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save notes.");
      }
    });
  }

  const notesDirty = notesDraft.trim() !== rest.trim();

  return (
    <div
      ref={popoverRef}
      className="fixed left-1/2 top-1/2 z-50 w-full max-w-[360px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card shadow-lg"
      // Centered modal-style (mirrors create-popover.tsx). Stop propagation so
      // the calendar column's click handler doesn't re-fire and immediately
      // close the just-opened popover.
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-foreground">Booking</span>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Details — the job at a glance: service/title, person, contact
          channels (when linked), the address, and the time. */}
      <div className="px-4 pt-3">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {contactName ?? "No contact"}
        </p>

        <div className="mt-2 space-y-1">
          {contactPhone ? (
            <a
              href={`tel:${contactPhone}`}
              className="flex items-center gap-2 text-xs text-foreground/85 hover:text-foreground"
            >
              <Phone className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{contactPhone}</span>
            </a>
          ) : null}
          {contactEmail ? (
            <a
              href={`mailto:${contactEmail}`}
              className="flex items-center gap-2 text-xs text-foreground/85 hover:text-foreground"
            >
              <Mail className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{contactEmail}</span>
            </a>
          ) : null}
          {address ? (
            <p className="flex items-start gap-2 text-xs text-foreground/85">
              <MapPin className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 break-words">{address}</span>
            </p>
          ) : null}
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          {formatLocalTime(startsAt, workspaceTimezone)}
        </p>
      </div>

      {/* Body */}
      <div className="space-y-3 px-4 pb-4 pt-3">
        {/* Inline-editable notes / job details. Save calls
            updateBookingNotesAction (revalidates /bookings). */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs text-muted-foreground">Notes</label>
            <button
              type="button"
              className="text-[11px] font-medium text-primary hover:underline disabled:opacity-40"
              onClick={handleSaveNotes}
              disabled={savingNotes || !notesDirty}
            >
              {savingNotes ? "Saving…" : notesSaved ? "Saved" : "Save"}
            </button>
          </div>
          <textarea
            className="crm-input w-full px-3 py-2 text-sm"
            rows={3}
            placeholder="Add job details…"
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
          />
        </div>

        {error ? <p className="text-xs text-negative">{error}</p> : null}

        <div className="flex gap-2">
          <button
            type="button"
            className="crm-button-secondary h-8 flex-1 text-xs"
            onClick={handleCancel}
            disabled={pending}
          >
            {pending ? "Cancelling…" : "Cancel booking"}
          </button>
          {contactId ? (
            <Link
              href={`/contacts/${contactId}`}
              className="crm-button-primary inline-flex h-8 flex-1 items-center justify-center text-xs"
            >
              Open contact
            </Link>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Tip: drag the card to reschedule.
        </p>
      </div>
    </div>
  );
}
