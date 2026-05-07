// v1.22.0 — customer reschedule slot-picker client
//
// Twenty-CRM-style date-tabs + slot-button-grid. Date tab click
// fetches new slots via the existing public listPublicBookingSlotsAction
// (re-runs the page with ?date=...). Slot click calls
// rescheduleBookingAction, redirects to /appointments on success.

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { rescheduleBookingAction } from "@/lib/customer-portal/appointment-actions";

export type CustomerRescheduleClientProps = {
  orgSlug: string;
  bookingId: string;
  dateOptions: Array<{ key: string; label: string }>;
  initialDate: string;
  initialSlots: string[];
  copyPackBookAnother: string;
};

export function CustomerRescheduleClient({
  orgSlug,
  bookingId,
  dateOptions,
  initialDate,
  initialSlots,
  copyPackBookAnother,
}: CustomerRescheduleClientProps) {
  void copyPackBookAnother;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [feedback, setFeedback] = useState<
    null | { kind: "ok"; message: string } | { kind: "error"; message: string }
  >(null);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);

  function pickDate(dateKey: string) {
    setSelectedDate(dateKey);
    setFeedback(null);
    // Re-run the server component with the new date param so
    // initialSlots updates from the server.
    router.push(`/customer/${orgSlug}/reschedule/${bookingId}?date=${dateKey}`);
  }

  function pickSlot(slotIso: string) {
    setActiveSlot(slotIso);
    setFeedback(null);
    startTransition(async () => {
      const res = await rescheduleBookingAction({
        orgSlug,
        bookingId,
        newStartsAtIso: slotIso,
      });
      if (res.ok) {
        setFeedback({
          kind: "ok",
          message: "Updated. Redirecting to your appointments…",
        });
        setTimeout(() => {
          window.location.href = `/customer/${orgSlug}/appointments`;
        }, 800);
      } else {
        setFeedback({ kind: "error", message: humanizeReason(res.reason) });
        setActiveSlot(null);
      }
    });
  }

  return (
    <div className="space-y-4">
      <section
        className="px-5 py-4 sm:px-6 sm:py-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <h2
          className="text-[12px] uppercase tracking-wide pb-3 mb-3"
          style={{ color: "#888", borderBottom: "1px solid #F0F0EC" }}
        >
          Pick a date
        </h2>
        <div className="flex gap-1.5 overflow-x-auto">
          {dateOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => pickDate(opt.key)}
              disabled={pending}
              className="px-3 py-2 text-[12px] font-medium whitespace-nowrap"
              style={{
                backgroundColor:
                  opt.key === selectedDate ? "#111" : "#FFFFFF",
                color: opt.key === selectedDate ? "#FFFFFF" : "#444",
                border: "1px solid",
                borderColor: opt.key === selectedDate ? "#111" : "#E5E5E1",
                borderRadius: "8px",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section
        className="px-5 py-4 sm:px-6 sm:py-5"
        style={{
          backgroundColor: "#FFFFFF",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <h2
          className="text-[12px] uppercase tracking-wide pb-3 mb-3"
          style={{ color: "#888", borderBottom: "1px solid #F0F0EC" }}
        >
          Pick a time
        </h2>
        {initialSlots.length === 0 ? (
          <p className="text-[13px]" style={{ color: "#888" }}>
            No times available on this day. Try another date.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {initialSlots.map((slot) => {
              const slotDate = new Date(slot);
              const label = slotDate.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              const isActive = activeSlot === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => pickSlot(slot)}
                  disabled={pending}
                  className="px-3 py-2.5 text-[13px] font-medium"
                  style={{
                    backgroundColor: isActive ? "#111" : "#FFFFFF",
                    color: isActive ? "#FFFFFF" : "#111",
                    border: "1px solid",
                    borderColor: isActive ? "#111" : "#E5E5E1",
                    borderRadius: "8px",
                  }}
                >
                  {pending && isActive ? "Saving…" : label}
                </button>
              );
            })}
          </div>
        )}
        {feedback ? (
          <p
            className="mt-3 text-[12px]"
            style={{
              color: feedback.kind === "ok" ? "#15803D" : "#B91C1C",
            }}
          >
            {feedback.message}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function humanizeReason(reason: string): string {
  switch (reason) {
    case "missing_required_field":
      return "Missing information.";
    case "booking_not_found":
      return "Booking not found.";
    case "booking_not_reschedulable":
      return "This booking can't be rescheduled (already cancelled or completed).";
    case "invalid_datetime":
      return "Invalid time selected.";
    case "slot_in_the_past":
      return "That time has already passed.";
    case "slot_unavailable":
      return "That time was just taken. Pick another slot.";
    case "update_failed":
      return "Update failed. Please try again.";
    default:
      return reason;
  }
}
