"use client";

import Link from "next/link";
import { HOUR_HEIGHT_PX } from "@/lib/bookings/calendar-math";

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
};

export function BookingCard({
  row,
  contactName,
  workspaceTimezone,
  top,
  borderClass,
}: BookingCardProps) {
  const startsAt = new Date(row.startsAt);
  const endsAt = new Date(row.endsAt);

  // Fix: use real duration instead of a fixed 60 min constant.
  // Clamp to at least 15 min so micro-bookings are still visible.
  const durationMinutes = Math.max(
    15,
    (endsAt.getTime() - startsAt.getTime()) / 60000
  );
  const height = (durationMinutes / 60) * HOUR_HEIGHT_PX - 4;

  const isBlocked = row.status === "blocked";

  // Blocked slots: grey, no left-border accent, no link.
  const cardClass = isBlocked
    ? "absolute left-2 right-2 rounded-lg border border-border bg-muted p-2 overflow-hidden"
    : `absolute left-2 right-2 rounded-lg border border-border border-l-4 ${borderClass} bg-card p-2 hover:bg-muted transition-colors overflow-hidden`;

  const cardStyle = { top: `${top}px`, height: `${height}px` };

  const cardInner = (
    <>
      <p className="text-xs font-medium text-foreground truncate">
        {isBlocked ? (row.title || "Blocked") : row.title}
      </p>
      {!isBlocked && (
        <p className="mt-0.5 text-[10px] text-muted-foreground truncate">
          {contactName}
        </p>
      )}
      <p className={`mt-1 text-[10px] ${isBlocked ? "text-muted-foreground" : "text-primary"}`}>
        {startsAt.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: workspaceTimezone,
        })}
      </p>
    </>
  );

  // Blocked slots never link to a contact, even if contactId is somehow set.
  if (!isBlocked && row.contactId) {
    return (
      <Link
        key={row.id}
        href={`/contacts/${row.contactId}`}
        className={`${cardClass} block`}
        style={cardStyle}
      >
        {cardInner}
      </Link>
    );
  }

  return (
    <article key={row.id} className={cardClass} style={cardStyle}>
      {cardInner}
    </article>
  );
}
