// <ActivityFeed> — vertical timeline of activity items grouped by
// day (Today / Yesterday / absolute date). Rendered as a series of
// sections; each item is a card-like row with type chip + subject
// + optional description + optional actor.
//
// Scope for v1:
//   - Pure rendering. Parent queries the data source (event log,
//     activities table, Brain v2 stream) + passes items in.
//   - Grouping by UTC day key → header label resolved via `now`.
//   - Sort within each group: newest first.
//   - Pagination: opaque cursor — parent decides next page URL;
//     component renders a "Load more" link when nextCursorHref is
//     provided.
//   - Empty state with overridable copy.
//
// Out of scope (deferred):
//   - Real-time streaming / optimistic updates — needs client JS.
//   - Filtering / search / type facets.
//   - Icon-per-type rendering (v1 uses text chip; v2 could wire
//     lucide icons via a small registry).
//
// Shipped in SLICE 4a PR 2 C3 per audit §2.1. Server component.

import type { ReactNode } from "react";
import Link from "next/link";

export type ActivityItem = {
  id: string;
  type: string;
  subject: string;
  description?: string;
  /** ISO string or Date. Parent passes whichever is convenient. */
  createdAt: string | Date;
  actor?: string;
};

export type ActivityFeedProps = {
  items: ActivityItem[];
  emptyState?: ReactNode;
  /** Optional pagination — "Load more" link target. */
  nextCursorHref?: string;
  /** Accessible name on the feed wrapper. */
  ariaLabel?: string;
  /**
   * Reference time for Today/Yesterday labels. Defaults to new Date().
   * Tests inject a fixed Date for determinism.
   */
  now?: Date;
};

export function ActivityFeed({
  items,
  emptyState,
  nextCursorHref,
  ariaLabel,
  now,
}: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div
        data-activity-feed-empty=""
        className="flex min-h-[160px] items-center justify-center rounded-lg border border-dashed border-border bg-card/30 p-8 text-body text-muted-foreground"
      >
        {emptyState ?? "No activity yet."}
      </div>
    );
  }

  const reference = now ?? new Date();
  const groups = groupByDay(items, reference);

  return (
    <section
      data-activity-feed=""
      aria-label={ariaLabel}
      className="flex flex-col gap-6"
    >
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-3">
          <h3 className="text-label text-muted-foreground font-medium">
            {group.label}
          </h3>
          <ol className="flex flex-col gap-2">
            {group.items.map((item) => (
              <ActivityRow key={item.id} item={item} />
            ))}
          </ol>
        </div>
      ))}
      {nextCursorHref ? (
        <div className="flex justify-center pt-2">
          <Link
            data-activity-feed-more=""
            href={nextCursorHref}
            className="rounded-md border border-border bg-card px-4 py-2 text-label text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-fast"
          >
            Load more
          </Link>
        </div>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------------
// Internal row rendering
// ---------------------------------------------------------------------

function ActivityRow({ item }: { item: ActivityItem }) {
  return (
    <li
      data-activity-item=""
      className="flex items-start gap-3 rounded-lg border border-border bg-card p-4"
    >
      <span className="inline-flex items-center rounded-full border border-border bg-secondary px-2 py-0.5 text-tiny font-medium text-secondary-foreground shrink-0">
        {item.type}
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-body text-foreground">{item.subject}</p>
        {item.description ? (
          <p className="text-body text-muted-foreground">{item.description}</p>
        ) : null}
        {item.actor ? (
          <p data-activity-actor="" className="text-tiny text-muted-foreground">
            by {item.actor}
          </p>
        ) : null}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------
// Grouping helpers
// ---------------------------------------------------------------------

type Group = {
  key: string;
  label: string;
  items: ActivityItem[];
};

function groupByDay(items: ActivityItem[], now: Date): Group[] {
  const sorted = [...items].sort((a, b) => timestamp(b.createdAt) - timestamp(a.createdAt));
  const groups = new Map<string, Group>();
  for (const item of sorted) {
    const key = utcDayKey(new Date(timestamp(item.createdAt)));
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(item);
    } else {
      groups.set(key, {
        key,
        label: dayLabel(key, now),
        items: [item],
      });
    }
  }
  return Array.from(groups.values());
}

function timestamp(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

function utcDayKey(d: Date): string {
  // yyyy-mm-dd using UTC components so group membership is
  // timezone-agnostic. Display label formatting picks it up below.
  return d.toISOString().slice(0, 10);
}

function dayLabel(dayKey: string, now: Date): string {
  const todayKey = utcDayKey(now);
  if (dayKey === todayKey) return "Today";
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (dayKey === utcDayKey(yesterday)) return "Yesterday";
  // Absolute: "Apr 10" if same year as now, "Apr 10, 2025" otherwise.
  const d = new Date(`${dayKey}T00:00:00Z`);
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[d.getUTCMonth()];
  const day = d.getUTCDate();
  if (d.getUTCFullYear() === now.getUTCFullYear()) {
    return `${month} ${day}`;
  }
  return `${month} ${day}, ${d.getUTCFullYear()}`;
}
