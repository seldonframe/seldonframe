"use client";

import { useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { togglePortalMessagePinAction } from "@/lib/portal/actions";
import type { PortalMessageRow } from "./portal-messages-client";

const DAY_MS = 24 * 60 * 60 * 1000;

type Group = { key: string; label: string; rows: PortalMessageRow[] };

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function bucketLabel(createdAt: Date, now: Date): { key: string; label: string } {
  const today = startOfDay(now).getTime();
  const created = startOfDay(createdAt).getTime();
  const diffDays = Math.round((today - created) / DAY_MS);

  if (diffDays <= 0) return { key: "today", label: "Today" };
  if (diffDays === 1) return { key: "yesterday", label: "Yesterday" };
  if (diffDays < 7) return { key: "thisweek", label: "This week" };
  return { key: "older", label: "Older" };
}

function groupMessages(rows: PortalMessageRow[]): Group[] {
  const now = new Date();
  const pinned = rows.filter((row) => row.isPinned === "true");
  const unpinned = rows.filter((row) => row.isPinned !== "true");

  const ordered: Group[] = [];

  if (pinned.length > 0) {
    ordered.push({ key: "pinned", label: "Pinned", rows: pinned });
  }

  const buckets = new Map<string, Group>();
  for (const row of unpinned) {
    const created = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);
    const { key, label } = bucketLabel(created, now);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, rows: [] };
      buckets.set(key, bucket);
    }
    bucket.rows.push(row);
  }

  for (const key of ["today", "yesterday", "thisweek", "older"] as const) {
    const bucket = buckets.get(key);
    if (bucket && bucket.rows.length > 0) ordered.push(bucket);
  }

  return ordered;
}

function formatTime(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatFullDate(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function PortalMessagesFeed({
  orgSlug,
  rows,
  onReply,
}: {
  orgSlug: string;
  rows: PortalMessageRow[];
  onReply: (subject: string | null) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const timer = setInterval(() => {
      router.refresh();
    }, 30_000);

    return () => clearInterval(timer);
  }, [router]);

  const groups = useMemo(() => groupMessages(rows), [rows]);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-10 text-center">
        <span className="text-2xl" aria-hidden="true">
          ✉️
        </span>
        <p className="font-medium text-foreground">Send your first message to your team</p>
        <p className="max-w-md text-xs text-[hsl(var(--color-text-secondary))]">
          Use the composer above to ask questions, share files, or follow up on a project. We&apos;ll
          notify your account team as soon as you hit send.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--color-text-muted))]">
            {group.label}
          </h3>
          <div className="space-y-2">
            {group.rows.map((row) => {
              const pinned = row.isPinned === "true";
              const isClient = row.senderType === "client";
              const isOptimistic = row.pending === true;
              const created = row.createdAt instanceof Date ? row.createdAt : new Date(row.createdAt);

              return (
                <article
                  key={row.id}
                  className={`crm-table-row rounded-md px-3 py-3 ${
                    isOptimistic ? "opacity-70" : ""
                  }`}
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium text-foreground">
                        <span className="truncate">{row.subject ?? "Message"}</span>
                        {pinned ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--color-text-secondary))]">
                            Pinned
                          </span>
                        ) : null}
                      </p>
                      <p
                        className="text-xs text-[hsl(var(--color-text-muted))]"
                        title={formatFullDate(created)}
                      >
                        {row.senderName ?? (isClient ? "You" : "Account team")} • {formatTime(created)}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      {!isClient && !isOptimistic ? (
                        <button
                          type="button"
                          className="crm-button-secondary h-7 px-2 text-xs"
                          onClick={() => onReply(row.subject)}
                        >
                          Reply
                        </button>
                      ) : null}
                      {!isOptimistic ? (
                        <button
                          type="button"
                          className="crm-button-secondary h-7 px-2 text-xs"
                          disabled={pending}
                          onClick={() => {
                            startTransition(async () => {
                              await togglePortalMessagePinAction(orgSlug, row.id, !pinned);
                              router.refresh();
                            });
                          }}
                        >
                          {pinned ? "Unpin" : "Pin"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <p className="whitespace-pre-wrap text-sm text-[hsl(var(--color-text-secondary))]">
                    {row.body}
                  </p>

                  {row.attachmentUrl ? (
                    <a
                      href={row.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex rounded-md border border-border px-2 py-1 text-xs text-primary"
                    >
                      Attachment: {row.attachmentName ?? "Open file"}
                    </a>
                  ) : null}

                  <p className="mt-2 text-xs text-[hsl(var(--color-text-muted))]">
                    {isOptimistic
                      ? "Sending…"
                      : isClient
                      ? row.readAt
                        ? "Read ✓"
                        : "Sent"
                      : row.readAt
                      ? "Viewed by you"
                      : "Unread"}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
