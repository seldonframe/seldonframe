// v1.25.4 — operator-session "Today" snapshot widget
//
// Replaces the v1.25.3 gap (where the SF "Newly installed blocks"
// section used to live for agency operators) with an operator-
// actionable overview: what matters to the HVAC owner / dentist /
// coach when they open the app at 8am.
//
// First-principles data:
//   - Today's bookings: count + first 2-3 with time/name
//   - Unread customer-portal messages: count
//   - Deals needing attention: stuck >5d in same stage (not terminal)
//   - This week's bookings (count for the trailing 7 days)
//
// All queries scoped by orgId; render is a 4-card grid + a small
// "today's appointments" preview list below.

import Link from "next/link";
import { and, count, desc, eq, gte, isNull, lt, ne, lte, or } from "drizzle-orm";
import { Calendar, MessageSquare, AlertCircle, TrendingUp } from "lucide-react";
import { db } from "@/db";
import { bookings, deals, portalMessages } from "@/db/schema";

export type OperatorTodaySnapshotProps = {
  orgId: string;
};

export async function OperatorTodaySnapshot({ orgId }: OperatorTodaySnapshotProps) {
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - 6);
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  const [
    todaysBookingsCountRow,
    todaysBookings,
    weekBookingsCountRow,
    unreadMessagesCountRow,
    stuckDealsCountRow,
  ] = await Promise.all([
    db
      .select({ c: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, orgId),
          ne(bookings.status, "template"),
          ne(bookings.status, "cancelled"),
          gte(bookings.startsAt, startOfToday),
          lt(bookings.startsAt, endOfToday),
        ),
      )
      .then((r) => r[0] ?? { c: 0 }),
    db
      .select({
        id: bookings.id,
        title: bookings.title,
        startsAt: bookings.startsAt,
        fullName: bookings.fullName,
      })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, orgId),
          ne(bookings.status, "template"),
          ne(bookings.status, "cancelled"),
          gte(bookings.startsAt, startOfToday),
          lt(bookings.startsAt, endOfToday),
        ),
      )
      .orderBy(bookings.startsAt)
      .limit(3),
    db
      .select({ c: count() })
      .from(bookings)
      .where(
        and(
          eq(bookings.orgId, orgId),
          ne(bookings.status, "template"),
          ne(bookings.status, "cancelled"),
          gte(bookings.startsAt, startOfWeek),
          lt(bookings.startsAt, endOfToday),
        ),
      )
      .then((r) => r[0] ?? { c: 0 }),
    db
      .select({ c: count() })
      .from(portalMessages)
      .where(
        and(
          eq(portalMessages.orgId, orgId),
          eq(portalMessages.senderType, "client"),
          isNull(portalMessages.readAt),
        ),
      )
      .then((r) => r[0] ?? { c: 0 }),
    db
      .select({ c: count() })
      .from(deals)
      .where(
        and(
          eq(deals.orgId, orgId),
          lte(deals.updatedAt, fiveDaysAgo),
          // exclude terminal stages (case-insensitive substring check
          // would require sql; for v1.25.4 just rely on closedAt being
          // null as the terminal-stage signal)
          isNull(deals.closedAt),
        ),
      )
      .then((r) => r[0] ?? { c: 0 }),
  ]);

  const todaysCount = Number(todaysBookingsCountRow.c);
  const weekCount = Number(weekBookingsCountRow.c);
  const unreadCount = Number(unreadMessagesCountRow.c);
  const stuckCount = Number(stuckDealsCountRow.c);

  return (
    <section className="rounded-2xl border border-border/80 bg-card/75 p-4 sm:p-5 shadow-(--shadow-xs)">
      <header className="mb-4">
        <h2 className="text-base sm:text-lg font-semibold tracking-tight text-foreground">
          Today
        </h2>
        <p className="text-xs sm:text-sm text-muted-foreground">
          {todaysCount === 0
            ? "No bookings on the schedule today."
            : `${todaysCount} ${todaysCount === 1 ? "booking" : "bookings"} on the schedule today.`}
        </p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SnapshotCard
          icon={<Calendar className="size-4" />}
          label="Today's bookings"
          value={todaysCount}
          href="/bookings"
          accent={todaysCount > 0 ? "primary" : "neutral"}
        />
        <SnapshotCard
          icon={<MessageSquare className="size-4" />}
          label="Unread messages"
          value={unreadCount}
          href="/contacts"
          accent={unreadCount > 0 ? "warn" : "neutral"}
        />
        <SnapshotCard
          icon={<AlertCircle className="size-4" />}
          label="Deals needing attention"
          value={stuckCount}
          href="/deals"
          subtitle="stuck >5 days"
          accent={stuckCount > 0 ? "warn" : "neutral"}
        />
        <SnapshotCard
          icon={<TrendingUp className="size-4" />}
          label="Bookings this week"
          value={weekCount}
          href="/bookings"
          accent="neutral"
        />
      </div>

      {todaysBookings.length > 0 ? (
        <div className="mt-4 pt-4 border-t border-border/60">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
            Up next
          </p>
          <ul className="space-y-1.5">
            {todaysBookings.map((b) => {
              const startsAt = new Date(b.startsAt);
              const time = startsAt.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
              });
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                >
                  <span className="truncate">
                    <span className="font-medium text-foreground">{time}</span>
                    <span className="ml-2 text-muted-foreground">
                      {b.fullName ?? "Client"} — {b.title}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function SnapshotCard({
  icon,
  label,
  value,
  subtitle,
  href,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  subtitle?: string;
  href: string;
  accent: "primary" | "warn" | "neutral";
}) {
  const valueColor =
    accent === "primary"
      ? "text-primary"
      : accent === "warn" && value > 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-foreground";
  return (
    <Link
      href={href}
      className="group rounded-xl border border-border/80 bg-background/40 p-3 transition-colors hover:border-border hover:bg-background/70"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
          {icon}
        </span>
      </div>
      <p className={`mt-2 text-2xl font-semibold leading-none ${valueColor}`}>
        {value}
      </p>
      <p className="mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {subtitle ? (
        <p className="text-[10px] text-muted-foreground/80 mt-0.5">{subtitle}</p>
      ) : null}
    </Link>
  );
}
