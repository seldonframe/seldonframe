// ICP-3 — shared presentation helpers for the Agents Studio (template list +
// editor). Pure server-safe React (no "use client", no hooks) so both the list
// page and the editor page can import them.

import type { AgentTemplateStatus } from "@/db/schema/agent-templates";

/** Human label for a template type id (e.g. "voice_receptionist" → "Voice
 *  receptionist"). */
export function formatTemplateType(type: string): string {
  if (type === "voice_receptionist") return "Voice receptionist";
  // Generic fallback: snake_case → Sentence case.
  const spaced = type.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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
