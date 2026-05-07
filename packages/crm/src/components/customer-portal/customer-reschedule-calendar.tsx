// v1.23.0 — month-grid reschedule calendar
//
// Mirrors the visual structure of /book/<slug> (server-rendered
// calcom-month-v1 HTML): 3-step indicator, month header with
// prev/next, MON-SUN weekday columns, day-cell grid with available
// dates highlighted, click-day → time-slot grid, click-slot →
// confirm + atomic reschedule.
//
// React-side because the customer reschedule flow is small and we
// don't want to maintain a parallel vanilla-JS client. The
// availability source is the SAME listPublicBookingSlotsAction
// the /book renderer uses — so visual parity carries over.

"use client";

import { useState, useTransition } from "react";

import { rescheduleBookingAction } from "@/lib/customer-portal/appointment-actions";

export type CustomerRescheduleCalendarProps = {
  orgSlug: string;
  bookingId: string;
  bookingTitle: string;
  bookingSlug: string;
  /** ISO of the original startsAt — shown in the "currently scheduled" row. */
  originalStartsAtIso: string;
  /** Initial month (YYYY-MM). Defaults to the current month. */
  initialMonth?: string;
};

type StepKey = "date" | "time" | "confirm";

export function CustomerRescheduleCalendar({
  orgSlug,
  bookingId,
  bookingTitle,
  bookingSlug,
  originalStartsAtIso,
  initialMonth,
}: CustomerRescheduleCalendarProps) {
  const today = new Date();
  const initial = parseMonthKey(initialMonth) ?? {
    year: today.getFullYear(),
    month: today.getMonth(),
  };

  const [viewYear, setViewYear] = useState(initial.year);
  const [viewMonth, setViewMonth] = useState(initial.month);
  const [step, setStep] = useState<StepKey>("date");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slotsForDate, setSlotsForDate] = useState<string[] | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    null | { kind: "ok"; message: string } | { kind: "error"; message: string }
  >(null);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(
    "en-US",
    { month: "long", year: "numeric" },
  );
  const monthDays = buildMonthGrid(viewYear, viewMonth);
  const todayKey = toDateKey(today);

  function navMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setViewYear(y);
    setViewMonth(m);
  }

  async function pickDate(dateKey: string) {
    setSelectedDate(dateKey);
    setSelectedSlot(null);
    setSlotsForDate(null);
    setFeedback(null);
    setStep("time");
    setLoadingSlots(true);
    try {
      const res = await fetch(
        `/api/v1/public/booking-slots?orgSlug=${encodeURIComponent(orgSlug)}&bookingSlug=${encodeURIComponent(bookingSlug)}&date=${encodeURIComponent(dateKey)}`,
      );
      if (!res.ok) {
        setSlotsForDate([]);
      } else {
        const data = (await res.json()) as { slots?: string[] };
        setSlotsForDate(Array.isArray(data.slots) ? data.slots : []);
      }
    } catch {
      setSlotsForDate([]);
    } finally {
      setLoadingSlots(false);
    }
  }

  function pickSlot(slotIso: string) {
    setSelectedSlot(slotIso);
    setStep("confirm");
    setFeedback(null);
  }

  function confirm() {
    if (!selectedSlot) return;
    startTransition(async () => {
      const res = await rescheduleBookingAction({
        orgSlug,
        bookingId,
        newStartsAtIso: selectedSlot,
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
      }
    });
  }

  return (
    <article
      className="px-6 py-6 sm:px-8 sm:py-8"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #E5E5E1",
        borderRadius: "16px",
      }}
    >
      <StepIndicator step={step} />

      <div className="mt-6 space-y-2">
        <h2
          className="text-[20px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          {bookingTitle}
        </h2>
        <p className="text-[13px]" style={{ color: "#666" }}>
          Currently{" "}
          {new Date(originalStartsAtIso).toLocaleString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>

      {step === "date" ? (
        <MonthGrid
          monthLabel={monthLabel}
          monthDays={monthDays}
          onPrev={() => navMonth(-1)}
          onNext={() => navMonth(1)}
          onPickDate={pickDate}
          todayKey={todayKey}
          selectedDate={selectedDate}
        />
      ) : null}

      {step === "time" ? (
        <SlotsPanel
          selectedDate={selectedDate}
          slots={slotsForDate}
          loading={loadingSlots}
          onBack={() => {
            setStep("date");
            setSelectedDate(null);
            setSlotsForDate(null);
          }}
          onPickSlot={pickSlot}
        />
      ) : null}

      {step === "confirm" && selectedSlot ? (
        <ConfirmPanel
          slot={selectedSlot}
          onBack={() => {
            setStep("time");
            setSelectedSlot(null);
            setFeedback(null);
          }}
          onConfirm={confirm}
          pending={pending}
          feedback={feedback}
        />
      ) : null}
    </article>
  );
}

// ─── sub-components ────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: StepKey }) {
  const items: Array<{ key: StepKey; label: string }> = [
    { key: "date", label: "Pick a date" },
    { key: "time", label: "Choose a time" },
    { key: "confirm", label: "Confirm reschedule" },
  ];
  const activeIdx = items.findIndex((i) => i.key === step);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      {items.map((item, idx) => {
        const isActive = idx === activeIdx;
        const isDone = idx < activeIdx;
        return (
          <div
            key={item.key}
            className="inline-flex items-center gap-2 px-3 py-1.5"
            style={{
              backgroundColor: isActive
                ? "#DCFCE7"
                : isDone
                  ? "#F0F0EC"
                  : "transparent",
              color: isActive ? "#166534" : isDone ? "#444" : "#999",
              borderRadius: "9999px",
              border: "1px solid",
              borderColor: isActive
                ? "#86EFAC"
                : isDone
                  ? "#E5E5E1"
                  : "transparent",
            }}
          >
            <span
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{
                backgroundColor: isActive
                  ? "#16A34A"
                  : isDone
                    ? "#666"
                    : "#D1D5DB",
                color: "#FFFFFF",
              }}
            >
              {idx + 1}
            </span>
            <span className="font-medium">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function MonthGrid({
  monthLabel,
  monthDays,
  onPrev,
  onNext,
  onPickDate,
  todayKey,
  selectedDate,
}: {
  monthLabel: string;
  monthDays: Array<{
    key: string | null;
    dayOfMonth: number | null;
    isPast: boolean;
  }>;
  onPrev: () => void;
  onNext: () => void;
  onPickDate: (dateKey: string) => void;
  todayKey: string;
  selectedDate: string | null;
}) {
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={onPrev}
          className="inline-flex h-9 w-9 items-center justify-center"
          style={{
            backgroundColor: "#FFFFFF",
            color: "#111",
            border: "1px solid #E5E5E1",
            borderRadius: "9999px",
          }}
          aria-label="Previous month"
        >
          ‹
        </button>
        <h3
          className="text-[15px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          {monthLabel}
        </h3>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex h-9 w-9 items-center justify-center"
          style={{
            backgroundColor: "#FFFFFF",
            color: "#111",
            border: "1px solid #E5E5E1",
            borderRadius: "9999px",
          }}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div
            key={d}
            className="text-center text-[10px] font-semibold uppercase tracking-wide py-2"
            style={{ color: "#999" }}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {monthDays.map((cell, idx) => {
          if (!cell.key) {
            return <div key={`empty-${idx}`} aria-hidden />;
          }
          const isToday = cell.key === todayKey;
          const isSelected = cell.key === selectedDate;
          const disabled = cell.isPast;
          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => !disabled && onPickDate(cell.key!)}
              disabled={disabled}
              className="aspect-square inline-flex items-center justify-center text-[14px] font-medium relative"
              style={{
                backgroundColor: isSelected
                  ? "#111"
                  : disabled
                    ? "transparent"
                    : "#FFFFFF",
                color: isSelected ? "#FFFFFF" : disabled ? "#D1D5DB" : "#111",
                border: "1px solid",
                borderColor: isSelected
                  ? "#111"
                  : isToday
                    ? "#16A34A"
                    : "#E5E5E1",
                borderRadius: "10px",
                cursor: disabled ? "not-allowed" : "pointer",
              }}
            >
              {cell.dayOfMonth}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SlotsPanel({
  selectedDate,
  slots,
  loading,
  onBack,
  onPickSlot,
}: {
  selectedDate: string | null;
  slots: string[] | null;
  loading: boolean;
  onBack: () => void;
  onPickSlot: (slot: string) => void;
}) {
  return (
    <div className="mt-6 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-[12px] underline"
        style={{ color: "#666" }}
      >
        ‹ Back to calendar
      </button>
      <p className="text-[13px]" style={{ color: "#666" }}>
        Available times on{" "}
        {selectedDate
          ? new Date(`${selectedDate}T00:00:00`).toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })
          : ""}
      </p>
      {loading ? (
        <p className="text-[13px]" style={{ color: "#888" }}>
          Loading times…
        </p>
      ) : slots && slots.length === 0 ? (
        <p className="text-[13px]" style={{ color: "#888" }}>
          No times available on this day. Try another date.
        </p>
      ) : null}
      {slots && slots.length > 0 ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {slots.map((slot) => {
            const date = new Date(slot);
            const label = date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            return (
              <button
                key={slot}
                type="button"
                onClick={() => onPickSlot(slot)}
                className="px-3 py-2.5 text-[13px] font-medium"
                style={{
                  backgroundColor: "#FFFFFF",
                  color: "#111",
                  border: "1px solid #E5E5E1",
                  borderRadius: "8px",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function ConfirmPanel({
  slot,
  onBack,
  onConfirm,
  pending,
  feedback,
}: {
  slot: string;
  onBack: () => void;
  onConfirm: () => void;
  pending: boolean;
  feedback:
    | null
    | { kind: "ok"; message: string }
    | { kind: "error"; message: string };
}) {
  const date = new Date(slot);
  const dateLine = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeLine = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <div className="mt-6 space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-[12px] underline"
        style={{ color: "#666" }}
      >
        ‹ Pick a different time
      </button>

      <div
        className="px-5 py-4"
        style={{
          backgroundColor: "#F7F7F5",
          border: "1px solid #E5E5E1",
          borderRadius: "12px",
        }}
      >
        <p
          className="text-[11px] uppercase tracking-wide"
          style={{ color: "#888" }}
        >
          Confirm new time
        </p>
        <p
          className="mt-1 text-[18px] font-semibold tracking-tight"
          style={{ color: "#111" }}
        >
          {dateLine}
        </p>
        <p className="text-[14px]" style={{ color: "#444" }}>
          {timeLine}
        </p>
      </div>

      {feedback ? (
        <p
          className="text-[13px]"
          style={{
            color: feedback.kind === "ok" ? "#15803D" : "#B91C1C",
          }}
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className="inline-flex h-10 items-center px-5 text-[13px] font-semibold"
          style={{
            backgroundColor: "#111",
            color: "#FFFFFF",
            borderRadius: "8px",
            border: "1px solid #111",
          }}
        >
          {pending ? "Saving…" : "Confirm reschedule"}
        </button>
      </div>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────────

function buildMonthGrid(
  year: number,
  month: number,
): Array<{ key: string | null; dayOfMonth: number | null; isPast: boolean }> {
  const firstOfMonth = new Date(year, month, 1);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  // Mon=0 alignment: our header is MON..SUN.
  // JS getDay() returns 0=Sun..6=Sat. Convert: (d+6)%7 → Mon=0..Sun=6
  const dowMonAligned = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<{
    key: string | null;
    dayOfMonth: number | null;
    isPast: boolean;
  }> = [];
  for (let i = 0; i < dowMonAligned; i++) {
    cells.push({ key: null, dayOfMonth: null, isPast: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const key = toDateKey(date);
    cells.push({
      key,
      dayOfMonth: day,
      isPast: date < todayStart,
    });
  }
  // Pad to a multiple of 7 for clean grid.
  while (cells.length % 7 !== 0) {
    cells.push({ key: null, dayOfMonth: null, isPast: false });
  }
  return cells;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseMonthKey(
  raw: string | null | undefined,
): { year: number; month: number } | null {
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (Number.isNaN(year) || Number.isNaN(month)) return null;
  return { year, month };
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
