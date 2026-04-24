"use client";

// PublicBookingForm — migrated to SLICE 4b patterns.
//
// Step 1 (pick-time) retains its specialized DayPicker + clickable
// slot-grid implementation — no SLICE 4b pattern covers interactive
// slot selection (CustomerDataView is read-only). Only token-level
// styling is shared (--sf-* tokens unchanged).
//
// Step 2 (enter-details) replaced: the hand-rolled <form> + inputs +
// submit button now delegates to <CustomerActionForm mode="single">.
// The form reads its fields via Zod-driven inference from
// BookingDetailsSchema below.
//
// Invariants preserved:
//   - 2-step flow (pick-time → enter-details → success)
//   - calls listPublicBookingSlotsAction + submitPublicBookingAction
//     unchanged
//   - demo-readonly + demo-blocked-error handling via showDemoToast
//   - Stripe checkout redirect via response.checkoutUrl
//   - hidden timezone passed through on submit
//   - "Change" button to go back to step 1 and clear selectedSlot
//   - price-aware submit label ($X or "Book")
//   - success confirmation screen with checkmark + message
//
// Migrated in SLICE 4b PR 1 C5 per audit §5.6 + G-4b-2 invariant.

import { useEffect, useMemo, useState, useTransition } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { z } from "zod";

import { listPublicBookingSlotsAction, submitPublicBookingAction } from "@/lib/bookings/actions";
import { isDemoBlockedError, isDemoReadonlyClient } from "@/lib/demo/client";
import { useDemoToast } from "@/components/shared/demo-toast-provider";
import { CustomerActionForm } from "@/components/ui-customer/customer-action-form";

// Schema drives step-2 field generation via <CustomerActionForm>.
const BookingDetailsSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
  notes: z.string().optional(),
});

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

function formatSelectedDateHeading(date: Date) {
  return date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });
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
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [step, setStep] = useState<"pick-time" | "enter-details">("pick-time");
  const { showDemoToast } = useDemoToast();

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);
  const horizon = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 60);
    return d;
  }, [today]);

  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const selectedDateISO = useMemo(() => toDateOnly(selectedDate), [selectedDate]);

  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  useEffect(() => {
    if (!selectedDateISO) return;

    let cancelled = false;
    setSlotsLoading(true);

    void (async () => {
      const result = await listPublicBookingSlotsAction({
        orgSlug,
        bookingSlug,
        date: selectedDateISO,
      });

      if (cancelled) return;

      setSlots(result.slots);
      if (!result.slots.includes(selectedSlot)) {
        setSelectedSlot("");
      }
      setSlotsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingSlug, orgSlug, selectedDateISO]);

  function handleDetailsSubmit(formData: FormData) {
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
  }

  if (success) {
    return (
      <div className="crm-card p-6 text-center">
        <div className="mx-auto mb-4 inline-flex size-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--sf-primary,#21a38b)_15%,transparent)]">
          <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: "var(--sf-primary, #21a38b)" }}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-lg font-semibold" style={{ color: "var(--sf-text)" }}>You&apos;re booked.</p>
        <p className="mt-2 text-sm" style={{ color: "var(--sf-muted)" }}>{confirmationMessage}</p>
      </div>
    );
  }

  const submitLabel = pending
    ? "Booking…"
    : price > 0
    ? `Pay & book · $${price.toFixed(price % 1 === 0 ? 0 : 2)}`
    : "Book";

  return (
    <div className="crm-card overflow-hidden p-0">
      {/* ───── Step 1 — pick a date + time ───── */}
      {step === "pick-time" ? (
        <div className="grid gap-0 lg:grid-cols-[auto_1fr]">
          <div className="border-b p-4 lg:border-b-0 lg:border-r" style={{ borderColor: "var(--sf-border)" }}>
            <DayPicker
              mode="single"
              required
              selected={selectedDate}
              onSelect={(day) => {
                if (day) {
                  const next = new Date(day);
                  next.setHours(0, 0, 0, 0);
                  setSelectedDate(next);
                }
              }}
              disabled={{ before: today, after: horizon }}
              showOutsideDays
              classNames={{ today: "rdp-today", selected: "rdp-selected" }}
              styles={{
                caption_label: { fontWeight: 600, fontSize: "14px" },
                day: { fontSize: "13px" },
              }}
            />
          </div>

          <div className="flex min-w-0 flex-col">
            <div className="border-b p-4" style={{ borderColor: "var(--sf-border)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--sf-text)" }}>
                {formatSelectedDateHeading(selectedDate)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--sf-muted)" }}>
                {durationMinutes}-min slot · {timezone}
              </p>
            </div>

            <div className="flex-1 p-4">
              {slotsLoading ? (
                <p className="text-sm" style={{ color: "var(--sf-muted)" }}>Loading available times…</p>
              ) : slots.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed py-8 text-center" style={{ borderColor: "var(--sf-border)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--sf-text)" }}>No times available.</p>
                  <p className="mt-1 text-xs" style={{ color: "var(--sf-muted)" }}>Try another day.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {slots.map((slot) => {
                    const isSelected = slot === selectedSlot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        className="h-10 rounded-lg border text-sm font-medium transition-all"
                        style={{
                          borderColor: isSelected ? "var(--sf-primary, #21a38b)" : "var(--sf-border)",
                          backgroundColor: isSelected
                            ? "color-mix(in srgb, var(--sf-primary, #21a38b) 12%, transparent)"
                            : "transparent",
                          color: isSelected ? "var(--sf-primary, #21a38b)" : "var(--sf-text)",
                        }}
                        onClick={() => {
                          setSelectedSlot(slot);
                          setStep("enter-details");
                        }}
                      >
                        {toTimeLabel(slot)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ───── Step 2 — enter details (MIGRATED to <CustomerActionForm>) ───── */}
      {step === "enter-details" && selectedSlot ? (
        <div className="flex flex-col gap-4 p-4">
          {/* Date+time summary + Change button — stays outside CustomerActionForm */}
          <div
            className="flex items-center justify-between gap-3 rounded-lg border p-3"
            style={{
              borderColor: "var(--sf-border)",
              backgroundColor: "color-mix(in srgb, var(--sf-primary, #21a38b) 6%, transparent)",
            }}
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: "var(--sf-text)" }}>
                {formatSelectedDateHeading(selectedDate)} · {toTimeLabel(selectedSlot)}
              </p>
              <p className="mt-0.5 text-xs" style={{ color: "var(--sf-muted)" }}>
                {durationMinutes} min · {timezone}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-xs font-medium underline underline-offset-2"
              style={{ color: "var(--sf-muted)" }}
              onClick={() => {
                setStep("pick-time");
                setSelectedSlot("");
              }}
            >
              Change
            </button>
          </div>

          <CustomerActionForm
            mode="single"
            schema={BookingDetailsSchema}
            action={handleDetailsSubmit}
            submitLabel={submitLabel}
          />
        </div>
      ) : null}
    </div>
  );
}
