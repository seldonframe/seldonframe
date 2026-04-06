"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { listPublicBookingSlotsAction, submitPublicBookingAction } from "@/lib/bookings/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";

function toDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toTimeLabel(value: string) {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function PublicBookingForm({
  orgSlug,
  bookingSlug,
  durationMinutes,
  confirmationFallback,
  price,
}: {
  orgSlug: string;
  bookingSlug: string;
  durationMinutes: number;
  confirmationFallback: string;
  price: number;
}) {
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState(confirmationFallback);
  const [slots, setSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const { showDemoToast } = useDemoToast();

  const dateOptions = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() + index);
      return {
        value: toDateOnly(date),
        label: date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }),
      };
    });
  }, []);

  const [selectedDate, setSelectedDate] = useState<string>(dateOptions[0]?.value ?? "");

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  useEffect(() => {
    if (!selectedDate) {
      return;
    }

    let cancelled = false;

    void (async () => {
      const result = await listPublicBookingSlotsAction({
        orgSlug,
        bookingSlug,
        date: selectedDate,
      });

      if (cancelled) {
        return;
      }

      setSlots(result.slots);
      setSelectedSlot((current) => (result.slots.includes(current) ? current : result.slots[0] ?? ""));
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingSlug, orgSlug, selectedDate]);

  return (
    <form
      className="crm-card space-y-3 p-4"
      action={(formData) => {
        startTransition(async () => {
          try {
            if (isDemoReadonlyClient) {
              showDemoToast();
              return;
            }

            const response = await submitPublicBookingAction({
              orgSlug,
              bookingSlug,
              fullName: String(formData.get("fullName") ?? ""),
              email: String(formData.get("email") ?? ""),
              startsAt: selectedSlot,
              notes: String(formData.get("notes") ?? "") || undefined,
            });

            if (response.checkoutUrl) {
              window.location.assign(response.checkoutUrl);
              return;
            }

            setConfirmationMessage(response.confirmationMessage || confirmationFallback);
            setSuccess(true);
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
      <div className="grid gap-3 md:grid-cols-2">
        <input className="crm-input h-10 px-3" name="fullName" placeholder="Your name" required />
        <input className="crm-input h-10 px-3" name="email" type="email" placeholder="you@example.com" required />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="booking-date" className="text-label" style={{ color: "var(--sf-muted)" }}>Date</label>
          <select
            id="booking-date"
            className="crm-input mt-1 h-10 w-full px-3"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          >
            {dateOptions.map((date) => (
              <option key={date.value} value={date.value}>
                {date.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="booking-slot" className="text-label" style={{ color: "var(--sf-muted)" }}>Time slot</label>
          <p className="mt-1 text-xs" style={{ color: "var(--sf-muted)" }}>Times shown in {timezone}</p>
          <select
            id="booking-slot"
            className="crm-input mt-1 h-10 w-full px-3"
            value={selectedSlot}
            onChange={(event) => setSelectedSlot(event.target.value)}
            required
          >
            {slots.length === 0 ? <option value="">No slots available</option> : null}
            {slots.map((slot) => (
              <option key={slot} value={slot}>
                {toTimeLabel(slot)} ({durationMinutes} min)
              </option>
            ))}
          </select>
        </div>
      </div>

      <input type="hidden" name="timezone" value={timezone} />

      <textarea className="crm-input min-h-20 w-full p-3" name="notes" placeholder="Anything we should know before the call?" />

      <button type="submit" className="crm-button-primary h-10 px-4" disabled={pending || !selectedSlot}>
        {pending ? "Booking..." : price > 0 ? `Pay & Book ($${price.toFixed(2)})` : "Book"}
      </button>

      {success ? <p className="text-sm" style={{ color: "var(--sf-accent)" }}>{confirmationMessage}</p> : null}
    </form>
  );
}
