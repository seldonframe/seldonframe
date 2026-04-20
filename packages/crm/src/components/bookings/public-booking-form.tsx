"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
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

  // Default to today; user can pick any date in the allowed range.
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
      // Don't auto-select a slot — let the user tap one. Prevents "I didn't
      // mean to pick that time" on the checkout step.
      if (!result.slots.includes(selectedSlot)) {
        setSelectedSlot("");
      }
      setSlotsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // selectedSlot excluded on purpose — we only refetch on date change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingSlug, orgSlug, selectedDateISO]);

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

  return (
    <div className="crm-card overflow-hidden p-0">
      {/* ───── Step 1 — pick a date + time ───── */}
      {step === "pick-time" ? (
        <div className="grid gap-0 lg:grid-cols-[auto_1fr]">
          {/* Calendar on the left */}
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
              classNames={{
                // Minimal overrides — rely on the shipped default stylesheet
                // for layout + accessibility, only re-theme colors via tokens.
                today: "rdp-today",
                selected: "rdp-selected",
              }}
              styles={{
                caption_label: { fontWeight: 600, fontSize: "14px" },
                day: { fontSize: "13px" },
              }}
            />
          </div>

          {/* Time slots on the right */}
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

      {/* ───── Step 2 — enter details ───── */}
      {step === "enter-details" && selectedSlot ? (
        <form
          className="flex flex-col gap-4 p-4"
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
          <div className="flex items-center justify-between gap-3 rounded-lg border p-3" style={{ borderColor: "var(--sf-border)", backgroundColor: "color-mix(in srgb, var(--sf-primary, #21a38b) 6%, transparent)" }}>
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

          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="fullName" className="text-xs font-medium" style={{ color: "var(--sf-muted)" }}>
                Your name
              </label>
              <input id="fullName" name="fullName" className="crm-input h-10 px-3" required autoFocus />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-xs font-medium" style={{ color: "var(--sf-muted)" }}>
                Email
              </label>
              <input id="email" name="email" type="email" className="crm-input h-10 px-3" placeholder="you@example.com" required />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-xs font-medium" style={{ color: "var(--sf-muted)" }}>
              Anything we should know? <span className="font-normal">(optional)</span>
            </label>
            <textarea id="notes" name="notes" className="crm-input min-h-20 w-full p-3" placeholder="Context, questions, links…" />
          </div>

          <input type="hidden" name="timezone" value={timezone} />

          <button type="submit" className="crm-button-primary h-11 px-4 text-sm font-semibold" disabled={pending}>
            {pending ? "Booking…" : price > 0 ? `Pay & book · $${price.toFixed(price % 1 === 0 ? 0 : 2)}` : "Book"}
          </button>
        </form>
      ) : null}
    </div>
  );
}
