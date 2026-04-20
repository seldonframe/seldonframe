"use client";

import Link from "next/link";
import { CalendarDays, CheckCircle2, ClipboardList, FileText, Mail, MessageSquareText, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveFieldLabel, resolveInitials } from "@/components/crm/utils";
import type { CrmScopedOverride, CrmTimelineItem } from "@/components/crm/types";

function resolveTimelineIcon(type: string) {
  const normalized = type.toLowerCase();
  if (normalized.includes("email")) return Mail;
  if (normalized.includes("task")) return ClipboardList;
  if (normalized.includes("note")) return MessageSquareText;
  if (normalized.includes("form")) return FileText;
  if (normalized.includes("booking") || normalized.includes("calendar")) return CalendarDays;
  if (normalized.includes("stage") || normalized.includes("status")) return CheckCircle2;
  return Sparkles;
}

export function ActivityTimeline({
  items,
  scopedOverride,
  endClientMode = false,
  className,
}: {
  items: CrmTimelineItem[];
  scopedOverride?: CrmScopedOverride;
  endClientMode?: boolean;
  className?: string;
}) {
  const hiddenTypes = new Set(scopedOverride?.hiddenFields ?? []);
  const visibleItems = items.filter((item) => !hiddenTypes.has(item.type));

  return (
    <section className={cn("rounded-2xl border border-border/80 bg-card/70 p-5 shadow-(--shadow-xs)", className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-card-title">Activity Timeline</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {endClientMode ? "Client-visible history for this scoped record." : "Unified history across emails, tasks, notes, submissions, bookings, and stage changes."}
          </p>
        </div>
        <span className="rounded-full border border-border/80 bg-background/80 px-2.5 py-1 text-xs text-muted-foreground">
          {visibleItems.length} item{visibleItems.length === 1 ? "" : "s"}
        </span>
      </div>

      {visibleItems.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border/80 bg-background/30 px-4 py-6 text-sm text-muted-foreground">
          No activity yet for this record.
        </div>
      ) : (
        <ol className="mt-5 space-y-3">
          {visibleItems.map((item) => {
            const Icon = resolveTimelineIcon(item.type);
            const actorLabel = item.actor?.trim() || resolveFieldLabel(item.type, scopedOverride);

            return (
              <li key={item.id} className="rounded-2xl border border-border/70 bg-background/45 p-4 transition-colors hover:border-border hover:bg-background/65">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-0.5">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted/60 text-[10px] font-semibold text-foreground">
                              {resolveInitials(actorLabel)}
                            </span>
                            {actorLabel}
                          </span>
                          <span>{new Date(item.occurredAt).toLocaleString()}</span>
                          {item.status ? <span className="crm-badge">{item.status}</span> : null}
                        </div>
                      </div>

                      {item.href ? (
                        <Link href={item.href} className="text-xs font-medium text-primary hover:underline">
                          Open
                        </Link>
                      ) : null}
                    </div>

                    {item.body ? <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.body}</p> : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
