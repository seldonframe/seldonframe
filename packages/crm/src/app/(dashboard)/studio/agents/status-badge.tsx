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
 *  agent dashboards' pill chrome.
 *
 *  Agent truth slice (Task 2) — `deploymentCount` is an OPTIONAL, additive
 *  prop (every existing call site that doesn't pass it renders byte-for-byte
 *  the pre-existing tri-state). When ≥1, this is deployment TRUTH — the
 *  template is actually running for a client — and the badge renders
 *  "● Live · N deployment(s)" INSTEAD of the marketplace draft/tested/
 *  published tri-state, regardless of `status`: a template can sit at
 *  `draft` in the marketplace lifecycle while very much live for the
 *  operator who deployed it, and a "draft" title chip on a running agent is
 *  a lie-shaped label (see the design doc's ground truth). L-36: every
 *  branch below carries an EXPLICIT foreground + background class (never an
 *  inherited/absent color that could collide with its own background). */
export function TemplateStatusBadge({
  status,
  deploymentCount,
}: {
  status: AgentTemplateStatus | string;
  deploymentCount?: number;
}) {
  if (typeof deploymentCount === "number" && deploymentCount > 0) {
    const label = `Live · ${deploymentCount} deployment${deploymentCount === 1 ? "" : "s"}`;
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
        <span className="inline-flex size-1.5 rounded-full bg-emerald-500" aria-hidden />
        {label}
      </span>
    );
  }

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

/** Sell-card copy for the marketplace tri-state (Task 2) — moved out of the
 *  title badge (which now shows deployment truth, above) and into the Sell/
 *  Publish section's own copy. `tested` keeps its existing meaning wherever
 *  it appears; only `draft`/`published` get an explicit sentence here. Pure
 *  string helper — the caller renders it as plain muted text. */
export function marketplaceListingCopy(status: AgentTemplateStatus | string): string | null {
  if (status === "draft") return "Not listed on marketplace";
  if (status === "published") return "Listed";
  return null;
}
