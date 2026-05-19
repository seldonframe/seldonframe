// RunContext — single source of truth for identity across a workflow run.
// Stamped at startRun, persisted on workflow_runs.context, refreshed
// lazily (clock only) on every dispatcher call.
//
// Two consumer surfaces:
//   - CustomerRunContext (run-context-customer.ts): omits agency.
//     Imported by customer-facing tool invokers (send_email, send_sms,
//     create_booking, create_activity). They physically cannot reach
//     agency branding because the type doesn't carry the field.
//   - AdminRunContext (run-context-admin.ts): the full shape. Imported
//     only by the dashboard render pipeline.
//
// See docs/superpowers/specs/2026-05-19-runcontext-architecture-design.md
// for the full design.

import type { OrgSoul } from "@/lib/soul/types";

export type RunContextSource =
  | { type: "form.submitted"; formId: string; triggerEventId: string | null }
  | { type: "booking.created"; bookingId: string; triggerEventId: string | null }
  | { type: "sms.replied"; inboundSmsId: string; triggerEventId: string | null }
  | { type: "schedule"; triggerEventId: string | null }
  | { type: "manual"; triggerEventId: string | null };

export type RunContextCustomer = {
  contactId: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  /** E.164 phone — the stable identity for SMS-wait matching. */
  phone: string;
};

export type RunContextWorkspace = {
  id: string;
  name: string;
  slug: string;
  /** IANA TZ string. LLM date grounding + booking-slot conversion both read this. */
  timezone: string;
  soul: OrgSoul;
  /** OrgTheme — typed loosely here to avoid the schema import cycle. */
  theme: Record<string, unknown>;
};

export type RunContextAgency = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type RunContextClock = {
  /** Server wall clock, ISO 8601 UTC. */
  nowIso: string;
  /** YYYY-MM-DD in workspace timezone. */
  today: string;
  /** YYYY-MM-DD in workspace timezone, today + 24h. */
  tomorrow: string;
  /** "Monday", "Tuesday", etc., in workspace timezone. */
  todayWeekday: string;
};

/**
 * Full RunContext. Persisted on workflow_runs.context. Loaded via
 * loadRunContext(). Customer-facing code MUST NOT import this type
 * directly — use CustomerRunContext from run-context-customer.ts.
 */
export type RunContext = {
  runId: string;
  orgId: string;
  archetypeId: string;
  /** Run start timestamp, ISO. */
  startedAt: string;
  customer: RunContextCustomer;
  workspace: RunContextWorkspace;
  /** Active partner agency, if any. Customer-facing code cannot read this. */
  agency: RunContextAgency | null;
  clock: RunContextClock;
  source: RunContextSource;
};
