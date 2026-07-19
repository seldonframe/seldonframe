"use client";

// 2026-05-17 — Bell icon notifications popover.
//
// Receives the pre-fetched notification feed from the server layout
// (so the bell renders with full state on first paint, no skeleton
// flash). "Read state" lives in localStorage as a single ISO timestamp
// — anything created after last_seen is unread. Clicking the bell
// reveals the popover AND advances last_seen so the unread badge
// disappears.
//
// Why localStorage and not a notifications_read table:
//   - Avoids a new table + write path for an MVP feature.
//   - "I looked at the bell today" is fine for per-device.
//   - If we later want cross-device read state, we add
//     `notifications_read (user_id, last_seen_at)` and read it here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell, CalendarDays, FileText, Inbox, AlertCircle } from "lucide-react";
import type { NotificationItem } from "@/lib/notifications/feed";

const STORAGE_KEY = "crm:notifications:last_seen";

export function NotificationsBell({
  items,
  switchWorkspaceAction,
  activeWorkspaceId,
  workspaceIdBySlug,
}: {
  items: NotificationItem[];
  /** Workspace switcher action — used so a notification from a
   *  non-active workspace flips the operator into that workspace
   *  before navigating. */
  switchWorkspaceAction: (formData: FormData) => void | Promise<void>;
  activeWorkspaceId: string | null;
  /** Map slug → org id so the click handler can look up the right
   *  org id without round-tripping to the server. */
  workspaceIdBySlug: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  // Fixed-position anchor for the portaled popover (see the portal note below).
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Hydrate last_seen from localStorage once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      setLastSeen(stored ?? null);
    } catch {
      // Ignore — incognito tabs can deny localStorage. Bell still
      // shows the badge until the next page load.
    }
  }, []);

  // Click outside closes.
  useEffect(() => {
    if (!open) return;
    function handle(event: MouseEvent) {
      if (!popoverRef.current || !buttonRef.current) return;
      const target = event.target as Node;
      if (popoverRef.current.contains(target) || buttonRef.current.contains(target)) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Position the portaled popover under the bell. The popover is portaled to
  // <body> (not rendered inline) because the sticky topbar's z-index +
  // backdrop-blur create a stacking context the dropdown can't escape — the
  // sticky command bar below the topbar (z-20) otherwise paints OVER the
  // dropdown (z-30 trapped inside the topbar's z-10 context). Portaling to the
  // document root + fixed positioning lifts it above everything. The bell is
  // sticky so its viewport position is stable on scroll; we still reposition on
  // scroll/resize to be safe.
  useEffect(() => {
    if (!open) return;
    const position = () => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setAnchor({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    };
    position();
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);

  const unreadCount = useMemo(() => {
    if (!lastSeen) return items.length;
    const lastSeenMs = Date.parse(lastSeen);
    if (Number.isNaN(lastSeenMs)) return items.length;
    return items.filter((item) => Date.parse(item.createdAt) > lastSeenMs).length;
  }, [items, lastSeen]);

  const handleToggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      if (next) {
        // Anchor the portaled popover under the bell synchronously, so its
        // first render is already positioned (no flash before the effect runs).
        const btn = buttonRef.current;
        if (btn) {
          const rect = btn.getBoundingClientRect();
          setAnchor({
            top: rect.bottom + 8,
            right: Math.max(8, window.innerWidth - rect.right),
          });
        }
      }
      if (next && items.length > 0) {
        // Opening clears the unread badge. We mark "now" as the new
        // last_seen — anything that lands after will re-appear as
        // unread on the next page load.
        const now = new Date().toISOString();
        try {
          window.localStorage.setItem(STORAGE_KEY, now);
        } catch {
          // ignore
        }
        setLastSeen(now);
      }
      return next;
    });
  }, [items.length]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="crm-topbar-icon-btn relative transition-transform duration-150 ease-out hover:scale-[1.04] active:scale-[0.96]"
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={handleToggle}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 ? (
          <span
            className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white shadow-(--shadow-xs)"
            aria-hidden
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              style={{ position: "fixed", top: anchor?.top ?? 0, right: anchor?.right ?? 0 }}
              className="z-[60] w-[360px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border/80 bg-card/96 p-1 shadow-(--shadow-dropdown) backdrop-blur-xl"
              role="dialog"
              aria-label="Notifications"
            >
          <div className="flex items-center justify-between px-3 py-2.5">
            <p className="text-sm font-semibold text-foreground">Notifications</p>
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80">
              Last 14 days
            </p>
          </div>
          <div className="my-0.5 h-px bg-border/80" />
          {items.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="max-h-[480px] divide-y divide-border/60 overflow-y-auto">
              {items.map((item) => {
                const lastSeenMs = lastSeen ? Date.parse(lastSeen) : 0;
                const isUnread = Date.parse(item.createdAt) > lastSeenMs;
                const targetOrgId = workspaceIdBySlug[item.workspaceSlug] ?? null;
                const needsWorkspaceSwitch =
                  targetOrgId !== null && targetOrgId !== activeWorkspaceId;
                return (
                  <li key={item.id}>
                    {needsWorkspaceSwitch ? (
                      <form action={switchWorkspaceAction} className="block">
                        <input type="hidden" name="orgId" value={targetOrgId ?? ""} />
                        <input type="hidden" name="redirectTo" value={item.href} />
                        <RowButton
                          item={item}
                          isUnread={isUnread}
                          asSubmit
                          onClick={() => setOpen(false)}
                        />
                      </form>
                    ) : (
                      <a
                        href={item.href}
                        className="block"
                        onClick={() => setOpen(false)}
                      >
                        <RowButton item={item} isUnread={isUnread} />
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function RowButton({
  item,
  isUnread,
  asSubmit = false,
  onClick,
}: {
  item: NotificationItem;
  isUnread: boolean;
  asSubmit?: boolean;
  onClick?: () => void;
}) {
  const Icon = ICON_BY_TYPE[item.type];
  const inner = (
    <div className="flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-accent/60">
      <span
        className={`mt-0.5 inline-flex size-7 items-center justify-center rounded-full ${
          isUnread ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
        }`}
        aria-hidden
      >
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${isUnread ? "font-semibold text-foreground" : "text-foreground/90"}`}>
          {item.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{item.body}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground/80">
          {item.workspaceName} · {formatRelative(item.createdAt)}
        </p>
      </div>
      {isUnread ? (
        <span className="mt-1 size-1.5 rounded-full bg-primary" aria-hidden />
      ) : null}
    </div>
  );

  if (asSubmit) {
    return (
      <button
        type="submit"
        className="block w-full text-left"
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }
  return inner;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Bell className="size-4" />
      </span>
      <p className="text-sm font-medium text-foreground">You're all caught up</p>
      <p className="text-xs text-muted-foreground">
        New leads, bookings, and agent eval failures will land here.
      </p>
    </div>
  );
}

const ICON_BY_TYPE: Record<NotificationItem["type"], typeof Bell> = {
  intake_submission: Inbox,
  booking: CalendarDays,
  agent_eval_failure: AlertCircle,
};

function formatRelative(iso: string): string {
  const created = Date.parse(iso);
  if (Number.isNaN(created)) return "";
  const diffMs = Date.now() - created;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  // Fall back to a calendar date for older items.
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(
      new Date(created),
    );
  } catch {
    return "";
  }
}

// Silence unused-symbol warnings when consumers don't import FileText.
void FileText;
