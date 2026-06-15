"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  operatorCancelBookingAction,
  operatorRescheduleBookingAction,
} from "@/lib/operator-portal/booking-actions";
import type { MonthGrid, WeekStrip, CalendarDay, CalendarBooking } from "@/lib/operator-portal/calendar";

// ─── Types ───────────────────────────────────────────────────────────────────

type BookingItem = {
  id: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  title: string;
  fullName: string | null;
  contactId: string | null;
  status: string;
};

type View = "week" | "month";

// ─── Sheet component (shared pattern from today-quick-actions) ───────────────

function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              backgroundColor: "rgba(0,0,0,0.45)",
              zIndex: 50,
            }}
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            style={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              x: "-50%",
              width: "min(100vw, 640px)",
              backgroundColor: "#FFFFFF",
              borderRadius: "20px 20px 0 0",
              zIndex: 51,
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
              boxShadow: "0 -4px 32px rgba(0,0,0,0.12)",
              maxHeight: "90dvh",
              overflowY: "auto",
            }}
          >
            <div
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: "#DDD",
                margin: "12px auto 0",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px 12px",
                borderBottom: "1px solid #F0F0EE",
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 600, color: "#111" }}>{title}</span>
              <button
                onClick={onClose}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 22,
                  color: "#999",
                  borderRadius: 8,
                }}
              >
                ×
              </button>
            </div>
            <div style={{ padding: "16px 20px" }}>{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    scheduled: { label: "Scheduled", bg: "#EEF2FF", color: "#4338CA" },
    completed: { label: "Completed", bg: "#F0FDF4", color: "#166534" },
    cancelled: { label: "Cancelled", bg: "#FEF2F2", color: "#991B1B" },
    pending_payment: { label: "Pending", bg: "#FFFBEB", color: "#92400E" },
    blocked: { label: "Blocked", bg: "#F3F4F6", color: "#6B7280" },
  };
  const style = map[status] ?? { label: status, bg: "#F3F4F6", color: "#374151" };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 20,
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {style.label}
    </span>
  );
}

// ─── Format time in workspace TZ ─────────────────────────────────────────────

function formatTime(isoStr: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(isoStr));
  } catch {
    return new Date(isoStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

function formatDateTime(isoStr: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(isoStr));
  } catch {
    return new Date(isoStr).toLocaleString();
  }
}

// ─── Booking Detail Sheet ─────────────────────────────────────────────────────

function BookingDetailSheet({
  booking,
  tz,
  orgSlug,
  accentColor,
  onClose,
  onCancelled,
  onRescheduled,
}: {
  booking: BookingItem | null;
  tz: string;
  orgSlug: string;
  accentColor: string;
  onClose: () => void;
  onCancelled: (id: string) => void;
  onRescheduled: (id: string, newStart: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showReschedule, setShowReschedule] = useState(false);
  const [newDatetime, setNewDatetime] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset state when sheet closes/opens
  useEffect(() => {
    if (!booking) {
      setConfirmCancel(false);
      setShowReschedule(false);
      setNewDatetime("");
      setError(null);
    }
  }, [booking]);

  function handleCancel() {
    if (!booking) return;
    startTransition(async () => {
      const result = await operatorCancelBookingAction({ orgSlug, bookingId: booking.id });
      if (result.ok) {
        onCancelled(booking.id);
        onClose();
      } else {
        setError(result.error);
      }
    });
  }

  function handleReschedule() {
    if (!booking || !newDatetime) return;
    startTransition(async () => {
      const result = await operatorRescheduleBookingAction({
        orgSlug,
        bookingId: booking.id,
        newStartsAtISO: new Date(newDatetime).toISOString(),
      });
      if (result.ok) {
        onRescheduled(booking.id, new Date(newDatetime).toISOString());
        onClose();
      } else {
        setError(result.error === "conflict" ? "That time slot conflicts with an existing booking." : "Booking not found.");
      }
    });
  }

  return (
    <Sheet open={!!booking} onClose={onClose} title="Appointment">
      {booking && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Customer */}
          <div>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>Customer</p>
            <p style={{ fontSize: 16, fontWeight: 600, color: "#111" }}>
              {booking.fullName || "Unknown"}
            </p>
          </div>

          {/* Service */}
          <div>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>Service</p>
            <p style={{ fontSize: 15, color: "#333" }}>{booking.title}</p>
          </div>

          {/* Time */}
          <div>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>Start</p>
            <p style={{ fontSize: 15, color: "#333" }}>{formatDateTime(booking.startsAt, tz)}</p>
          </div>
          <div>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 2 }}>End</p>
            <p style={{ fontSize: 15, color: "#333" }}>{formatDateTime(booking.endsAt, tz)}</p>
          </div>

          {/* Status */}
          <div>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>Status</p>
            <StatusBadge status={booking.status} />
          </div>

          {error && (
            <p style={{ fontSize: 13, color: "#B91C1C", padding: "8px 12px", backgroundColor: "#FEF2F2", borderRadius: 8 }}>
              {error}
            </p>
          )}

          {/* Reschedule section */}
          {showReschedule ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>New date & time</p>
              <input
                type="datetime-local"
                value={newDatetime}
                onChange={(e) => setNewDatetime(e.target.value)}
                style={{
                  minHeight: 48,
                  border: "1px solid #E5E5E1",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontSize: 15,
                  color: "#111",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowReschedule(false)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 12,
                    border: "1px solid #E5E5E1",
                    background: "none",
                    fontSize: 15,
                    color: "#555",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleReschedule}
                  disabled={!newDatetime || isPending}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 12,
                    border: "none",
                    backgroundColor: newDatetime && !isPending ? accentColor : "#CCC",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: newDatetime && !isPending ? "pointer" : "default",
                  }}
                >
                  {isPending ? "Saving…" : "Confirm"}
                </button>
              </div>
            </div>
          ) : confirmCancel ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 14, color: "#555" }}>Cancel this appointment? This cannot be undone.</p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setConfirmCancel(false)}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 12,
                    border: "1px solid #E5E5E1",
                    background: "none",
                    fontSize: 15,
                    color: "#555",
                    cursor: "pointer",
                  }}
                >
                  Keep It
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isPending}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 12,
                    border: "none",
                    backgroundColor: isPending ? "#CCC" : "#DC2626",
                    color: "#fff",
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: isPending ? "default" : "pointer",
                  }}
                >
                  {isPending ? "Cancelling…" : "Yes, Cancel"}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button
                onClick={() => setShowReschedule(true)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 12,
                  border: `1px solid ${accentColor}`,
                  backgroundColor: "transparent",
                  color: accentColor,
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reschedule
              </button>
              <button
                onClick={() => setConfirmCancel(true)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: 12,
                  border: "1px solid #E5E5E1",
                  backgroundColor: "transparent",
                  color: "#DC2626",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

// ─── Month Grid View ──────────────────────────────────────────────────────────

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthCalendar({
  grid,
  selectedDay,
  onSelectDay,
  accentColor,
}: {
  grid: MonthGrid;
  selectedDay: string | null; // "YYYY-M-D"
  onSelectDay: (key: string) => void;
  accentColor: string;
}) {
  return (
    <div style={{ width: "100%" }}>
      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              textAlign: "center",
              fontSize: 11,
              fontWeight: 600,
              color: "#999",
              textTransform: "uppercase",
              padding: "4px 0",
            }}
          >
            {d}
          </div>
        ))}
      </div>
      {/* Weeks */}
      {grid.weeks.map((week, wi) => (
        <div key={wi} style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {week.days.map((day) => {
            const key = `${day.year}-${day.month}-${day.day}`;
            const isSelected = selectedDay === key;
            const hasBookings = day.bookings.length > 0;
            return (
              <motion.button
                key={key}
                whileTap={{ scale: 0.92 }}
                onClick={() => onSelectDay(key)}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 44,
                  borderRadius: 10,
                  border: "none",
                  backgroundColor: isSelected ? accentColor : "transparent",
                  cursor: "pointer",
                  opacity: day.isCurrentMonth ? 1 : 0.35,
                  outline: "none",
                  padding: "4px 2px",
                }}
              >
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: isSelected ? 700 : day.isCurrentMonth ? 500 : 400,
                    color: isSelected ? "#fff" : "#111",
                  }}
                >
                  {day.day}
                </span>
                {hasBookings && !isSelected && (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      backgroundColor: accentColor,
                      marginTop: 2,
                    }}
                  />
                )}
                {hasBookings && isSelected && (
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      backgroundColor: "rgba(255,255,255,0.8)",
                      marginTop: 2,
                    }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── Week Strip View ──────────────────────────────────────────────────────────

function WeekCalendar({
  strip,
  selectedDay,
  onSelectDay,
  accentColor,
  tz,
}: {
  strip: WeekStrip;
  selectedDay: string | null;
  onSelectDay: (key: string) => void;
  accentColor: string;
  tz: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
      {strip.days.map((day) => {
        const key = `${day.year}-${day.month}-${day.day}`;
        const isSelected = selectedDay === key;
        const hasBookings = day.bookings.length > 0;
        const dayLabel = new Intl.DateTimeFormat("en-US", {
          timeZone: tz,
          weekday: "narrow",
        }).format(new Date(`${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}T12:00:00Z`));

        return (
          <motion.button
            key={key}
            whileTap={{ scale: 0.92 }}
            onClick={() => onSelectDay(key)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              padding: "8px 2px",
              borderRadius: 12,
              border: "none",
              backgroundColor: isSelected ? accentColor : "transparent",
              cursor: "pointer",
              outline: "none",
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: isSelected ? "rgba(255,255,255,0.8)" : "#999",
                textTransform: "uppercase",
              }}
            >
              {dayLabel}
            </span>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: isSelected ? "#fff" : "#111",
              }}
            >
              {day.day}
            </span>
            {hasBookings && (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  backgroundColor: isSelected ? "rgba(255,255,255,0.8)" : accentColor,
                }}
              />
            )}
            {!hasBookings && <span style={{ width: 5, height: 5 }} />}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Main AppointmentsClient ──────────────────────────────────────────────────

export function AppointmentsClient({
  monthGrid,
  weekStrip,
  allBookings,
  tz,
  orgSlug,
  accentColor,
}: {
  monthGrid: MonthGrid;
  weekStrip: WeekStrip;
  allBookings: BookingItem[];
  tz: string;
  orgSlug: string;
  accentColor: string;
}) {
  const [view, setView] = useState<View>("week");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(() => {
    // Default to today's day key
    const now = new Date();
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
      const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
      return `${parts.year}-${parseInt(parts.month ?? "1")}-${parseInt(parts.day ?? "1")}`;
    } catch {
      return null;
    }
  });

  const [localBookings, setLocalBookings] = useState<BookingItem[]>(allBookings);
  const [selectedBooking, setSelectedBooking] = useState<BookingItem | null>(null);

  const handleCancelled = useCallback((id: string) => {
    setLocalBookings((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const handleRescheduled = useCallback((id: string, newStart: string) => {
    setLocalBookings((prev) =>
      prev.map((b) => {
        if (b.id !== id) return b;
        const oldStart = new Date(b.startsAt);
        const oldEnd = new Date(b.endsAt);
        const duration = oldEnd.getTime() - oldStart.getTime();
        const newStartDate = new Date(newStart);
        return { ...b, startsAt: newStart, endsAt: new Date(newStartDate.getTime() + duration).toISOString() };
      })
    );
  }, []);

  // Get bookings for selected day
  const dayBookings = selectedDayKey
    ? localBookings.filter((b) => {
        try {
          const fmt = new Intl.DateTimeFormat("en-US", {
            timeZone: tz,
            year: "numeric",
            month: "numeric",
            day: "numeric",
          });
          const parts = Object.fromEntries(fmt.formatToParts(new Date(b.startsAt)).map((p) => [p.type, p.value]));
          const key = `${parts.year}-${parseInt(parts.month ?? "1")}-${parseInt(parts.day ?? "1")}`;
          return key === selectedDayKey;
        } catch {
          return false;
        }
      })
    : [];

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(`${monthGrid.year}-${String(monthGrid.month).padStart(2, "0")}-01`)
  );

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 16px 12px",
        }}
      >
        <h1 style={{ fontSize: 18, fontWeight: 700, color: "#111", margin: 0 }}>
          Appointments
        </h1>
        {/* View toggle */}
        <div
          style={{
            display: "flex",
            backgroundColor: "#F0F0EE",
            borderRadius: 10,
            padding: 2,
            gap: 2,
          }}
        >
          {(["week", "month"] as View[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                minHeight: 32,
                padding: "0 14px",
                borderRadius: 8,
                border: "none",
                backgroundColor: view === v ? "#fff" : "transparent",
                color: view === v ? "#111" : "#888",
                fontSize: 13,
                fontWeight: view === v ? 600 : 400,
                cursor: "pointer",
                boxShadow: view === v ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.15s",
              }}
            >
              {v === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar area */}
      <div style={{ backgroundColor: "#fff", padding: "8px 16px 16px", borderBottom: "1px solid #F0F0EE" }}>
        {view === "month" ? (
          <>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#555", marginBottom: 8 }}>{monthName}</p>
            <MonthCalendar
              grid={monthGrid}
              selectedDay={selectedDayKey}
              onSelectDay={setSelectedDayKey}
              accentColor={accentColor}
            />
          </>
        ) : (
          <WeekCalendar
            strip={weekStrip}
            selectedDay={selectedDayKey}
            onSelectDay={setSelectedDayKey}
            accentColor={accentColor}
            tz={tz}
          />
        )}
      </div>

      {/* Day detail list */}
      <div style={{ padding: "16px 16px 0" }}>
        {selectedDayKey && (
          <p style={{ fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
            {(() => {
              const [y, m, d] = selectedDayKey.split("-").map(Number);
              return new Intl.DateTimeFormat("en-US", {
                timeZone: tz,
                weekday: "long",
                month: "long",
                day: "numeric",
              }).format(new Date(Date.UTC(y!, (m ?? 1) - 1, d)));
            })()}
          </p>
        )}

        {dayBookings.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px 16px",
              color: "#999",
              fontSize: 14,
            }}
          >
            {view === "month" ? "No bookings this month." : "Nothing this week."}
            <div style={{ marginTop: 12 }}>
              <Link
                href={`/book/${orgSlug}/default`}
                style={{
                  display: "inline-block",
                  padding: "10px 20px",
                  backgroundColor: accentColor,
                  color: "#fff",
                  borderRadius: 12,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                New Booking
              </Link>
            </div>
          </div>
        ) : (
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <AnimatePresence>
              {dayBookings.map((b, i) => (
                <motion.li
                  key={b.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setSelectedBooking(b)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "14px 16px",
                      backgroundColor: "#fff",
                      border: "1px solid #E5E5E1",
                      borderRadius: 14,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                    }}
                  >
                    {/* Time pill */}
                    <div
                      style={{
                        flexShrink: 0,
                        backgroundColor: "#F7F7F5",
                        borderRadius: 8,
                        padding: "6px 10px",
                        textAlign: "center",
                        minWidth: 60,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#111", display: "block" }}>
                        {formatTime(b.startsAt, tz)}
                      </span>
                    </div>
                    {/* Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: "block",
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#111",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {b.title}
                      </span>
                      <span
                        style={{
                          display: "block",
                          fontSize: 13,
                          color: "#888",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          marginTop: 2,
                        }}
                      >
                        {b.fullName || "Guest"}
                      </span>
                    </div>
                    {/* Status */}
                    <StatusBadge status={b.status} />
                  </motion.button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      {/* Booking detail sheet */}
      <BookingDetailSheet
        booking={selectedBooking}
        tz={tz}
        orgSlug={orgSlug}
        accentColor={accentColor}
        onClose={() => setSelectedBooking(null)}
        onCancelled={handleCancelled}
        onRescheduled={handleRescheduled}
      />
    </section>
  );
}
