// packages/crm/src/components/proposals/activity-timeline.tsx
// 2026-05-20 — Phase C: chronological proposal event log rendered server-side.

import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  proposalEvents,
  type ProposalEventType,
} from "@/db/schema";

const EVENT_LABELS: Record<
  ProposalEventType,
  { label: string; tone: "neutral" | "info" | "good" | "warn" | "bad" }
> = {
  created: { label: "Created", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  viewed: { label: "Viewed", tone: "info" },
  accepted: { label: "Accepted", tone: "good" },
  declined: { label: "Declined", tone: "warn" },
  checkout_started: { label: "Checkout started", tone: "info" },
  checkout_success: { label: "Payment received", tone: "good" },
  checkout_canceled: { label: "Checkout canceled", tone: "warn" },
  workspace_activated: { label: "Workspace activated", tone: "good" },
  expired: { label: "Expired", tone: "warn" },
};

const TONE_CLASSES: Record<string, string> = {
  neutral: "bg-muted",
  info: "bg-sky-500/20 text-sky-700",
  good: "bg-emerald-500/20 text-emerald-700",
  warn: "bg-amber-500/20 text-amber-700",
  bad: "bg-rose-500/20 text-rose-700",
};

function formatWhen(value: Date | string) {
  const d = new Date(value);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function summarizeMetadata(metadata: Record<string, unknown>): string {
  if (metadata.reason) return `Reason: ${metadata.reason}`;
  if (metadata.resent) return `Resent to ${metadata.to ?? "prospect"}`;
  if (metadata.to) return `To: ${metadata.to}`;
  if (metadata.sessionId)
    return `Stripe session ${String(metadata.sessionId).slice(0, 16)}…`;
  if (metadata.workspaceId)
    return `Workspace ${String(metadata.workspaceId).slice(0, 8)}…`;
  return "";
}

export async function ActivityTimeline({ proposalId }: { proposalId: string }) {
  const events = await db
    .select()
    .from(proposalEvents)
    .where(eq(proposalEvents.proposalId, proposalId))
    .orderBy(desc(proposalEvents.createdAt))
    .limit(100);

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No activity yet. Once you send the proposal, view/accept/decline events
        will appear here.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {events.map((event) => {
        const meta = EVENT_LABELS[event.eventType] ?? {
          label: event.eventType,
          tone: "neutral" as const,
        };
        const tone = TONE_CLASSES[meta.tone];
        return (
          <li key={event.id} className="flex items-start gap-3">
            <span
              className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${tone}`}
            >
              {meta.label}
            </span>
            <div className="flex-1 min-w-0 space-y-0.5">
              <p className="text-xs text-muted-foreground">
                {formatWhen(event.createdAt)}
              </p>
              {event.metadata && Object.keys(event.metadata).length > 0 && (
                <p className="text-xs text-muted-foreground truncate">
                  {summarizeMetadata(event.metadata)}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
