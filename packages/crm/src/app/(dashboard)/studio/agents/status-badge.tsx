// ICP-3 — shared presentation helpers for the Agents Studio (template list +
// editor). Pure server-safe React (no "use client", no hooks) so both the list
// page and the editor page can import them.

import type { AgentTemplateStatus } from "@/db/schema/agent-templates";
import type { AgentTrigger } from "@/lib/agents/triggers/agent-trigger";

/** Human label for a template type id (e.g. "voice_receptionist" → "Voice
 *  receptionist"). */
export function formatTemplateType(type: string): string {
  if (type === "voice_receptionist") return "Voice receptionist";
  // Generic fallback: snake_case → Sentence case.
  const spaced = type.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Human label for a channel slug, for the Agents table's "Channel" column
 *  (e.g. "chat" → "Web chat"). Pure. */
export function formatChannel(channel: string): string {
  switch (channel) {
    case "voice":
      return "Voice";
    case "chat":
      return "Web chat";
    case "sms":
      return "SMS";
    case "email":
      return "Email";
    case "digest":
      return "Digest";
    default:
      return channel.charAt(0).toUpperCase() + channel.slice(1);
  }
}

/** The trigger half of a resolved trigger, for the Agents table's "Trigger"
 *  column — the channel is shown in its own column, so this drops it. Mirrors
 *  triggerLabel() but returns only the left-of-"·" descriptor. Pure. */
export function formatTriggerDescriptor(trigger: AgentTrigger): string {
  switch (trigger.kind) {
    case "inbound":
      return "Inbound";
    case "event":
      return formatEventDescriptor(trigger.event);
    case "schedule":
      return "Scheduled";
  }
}

function formatEventDescriptor(event: string): string {
  switch (event) {
    case "booking.completed":
      return "After booking";
    case "lead.created":
      return "New lead";
    case "invoice.paid":
      return "Invoice paid";
    case "missed_call":
      return "Missed call";
    default:
      // Slug → Sentence (e.g. "deal.won" → "Deal won").
      return (
        event.replace(/[._]/g, " ").charAt(0).toUpperCase() +
        event.replace(/[._]/g, " ").slice(1)
      );
  }
}

/** Status pill for an agent template. draft / tested / published, mirroring the
 *  agent dashboards' pill chrome. */
export function TemplateStatusBadge({ status }: { status: AgentTemplateStatus | string }) {
  const tone =
    status === "published"
      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : status === "tested"
        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
        : "bg-slate-500/15 text-slate-700 dark:text-slate-300";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${tone}`}>
      {status}
    </span>
  );
}
