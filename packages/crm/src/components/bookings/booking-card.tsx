"use client";

import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { HOUR_HEIGHT_PX } from "@/lib/bookings/calendar-math";

// Minimum rendered card height in px. A 15-min job at HOUR_HEIGHT_PX would be
// ~20px tall — too short to read its title + time. Clamp every card to at
// least this so short jobs stay legible (Google Calendar / Cal.com do the
// same). Cards still anchor to the hour grid via their `top`; only the
// height floor changes.
const MIN_CARD_PX = 44;

type BookingCardRow = {
  id: string;
  title: string;
  startsAt: Date | string;
  endsAt: Date | string;
  status: string;
  contactId: string | null;
};

type BookingCardProps = {
  row: BookingCardRow;
  /** Resolved display name for the linked contact, or null when none. */
  contactName: string | null;
  workspaceTimezone: string;
  /** Pre-computed top offset in px (from bookingTopPx). */
  top: number;
  /** Tailwind border-l-* colour class for the left accent strip. */
  borderClass: string;
  /** Native pointer handlers from the parent (drag-to-reschedule + click).
   *  The parent owns drag detection, navigation, and pointer capture. */
  onPointerDown?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove?: (e: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp?: (e: ReactPointerEvent<HTMLElement>) => void;
  /** Optimistic position override applied while a reschedule is in flight
   *  (or for the live-dragged card). Merged over the base top/height style.
   *  When present, the card renders at this position instead of `top`. */
  styleOverride?: CSSProperties;
  /** True while THIS card is the one actively being dragged — switches the
   *  cursor to grabbing and lifts it visually above its neighbours. */
  isDragging?: boolean;
};

export function BookingCard({
  row,
  contactName,
  workspaceTimezone,
  top,
  borderClass,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  styleOverride,
  isDragging = false,
}: BookingCardProps) {
  const startsAt = new Date(row.startsAt);
  const endsAt = new Date(row.endsAt);

  // Fix: use real duration instead of a fixed 60 min constant.
  // Clamp to at least 15 min so micro-bookings are still visible.
  const durationMinutes = Math.max(
    15,
    (endsAt.getTime() - startsAt.getTime()) / 60000
  );
  // Floor the rendered height at MIN_CARD_PX so a short job still shows its
  // title + time, even when its real duration would render only ~20px tall.
  const realDurationHeight = (durationMinutes / 60) * HOUR_HEIGHT_PX - 4;
  const height = Math.max(realDurationHeight, MIN_CARD_PX);

  const isBlocked = row.status === "blocked";

  // cursor-grab at rest, cursor-grabbing while dragging. Blocked cards stay
  // draggable too. A dragged card lifts above its neighbours (z-20) and gets
  // a subtle ring so the operator can see what's moving.
  const cursorClass = isDragging ? "cursor-grabbing" : "cursor-grab";
  const dragLift = isDragging
    ? "z-20 opacity-90 shadow-lg ring-2 ring-primary/40"
    : "";

  // Blocked slots: grey, no left-border accent. Prospect cards keep the
  // coloured left accent + hover treatment.
  const cardClass = isBlocked
    ? `absolute left-2 right-2 rounded-lg border border-border bg-muted p-2 overflow-hidden touch-none select-none ${cursorClass} ${dragLift}`
    : `absolute left-2 right-2 rounded-lg border border-border border-l-4 ${borderClass} bg-card p-2 hover:bg-muted transition-colors overflow-hidden touch-none select-none ${cursorClass} ${dragLift}`;

  // styleOverride (optimistic / live-drag position) wins over the base top.
  const cardStyle: CSSProperties = {
    top: `${top}px`,
    height: `${height}px`,
    ...styleOverride,
  };

  return (
    <article
      key={row.id}
      className={cardClass}
      style={cardStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <p className="text-xs font-medium text-foreground truncate">
        {isBlocked ? (row.title || "Blocked") : row.title}
      </p>
      {!isBlocked && (
        <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
          {contactName}
        </p>
      )}
      <p className={`mt-1 text-[10px] truncate ${isBlocked ? "text-muted-foreground" : "text-primary"}`}>
        {startsAt.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: workspaceTimezone,
        })}
      </p>
    </article>
  );
}
