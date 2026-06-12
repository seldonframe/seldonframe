"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { X } from "lucide-react";

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
  /** Booking start as a UTC Date. */
  startsAt: Date;
  /** IANA timezone of the workspace — used for display only. */
  workspaceTimezone: string;
  /** Server action: cancels the booking by id, then revalidates /bookings. */
  cancelBookingAction: (bookingId: string) => Promise<unknown>;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingActions({
  bookingId,
  title,
  contactName,
  contactId,
  startsAt,
  workspaceTimezone,
  cancelBookingAction,
  onCancelled,
  onClose,
}: BookingActionsProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const popoverRef = useRef<HTMLDivElement>(null);

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

      {/* Details */}
      <div className="px-4 pt-3">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {contactName ?? "No contact"}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatLocalTime(startsAt, workspaceTimezone)}
        </p>
      </div>

      {/* Body */}
      <div className="space-y-3 px-4 pb-4 pt-3">
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
