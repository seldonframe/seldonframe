// buildRunContext + helpers — stamps a RunContext at startRun and
// rebuilds it lazily on access if the persisted column is null
// (existing pre-Phase-1 runs).
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations, partnerAgencies } from "@/db/schema";
import { toE164 } from "@/lib/sms/providers/interface";
import type { OrgSoul } from "@/lib/soul/types";
import type {
  RunContext,
  RunContextAgency,
  RunContextClock,
  RunContextCustomer,
  RunContextSource,
  RunContextWorkspace,
} from "./run-context";

/**
 * Format a wall-clock instant as { nowIso, today, tomorrow,
 * todayWeekday } in the given IANA timezone. Falls back to UTC if
 * the tz string is invalid.
 */
export function buildClock(now: Date, timezone: string): RunContextClock {
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nowIso = now.toISOString();

  // Try Intl with the workspace tz; fall back to UTC if Intl throws.
  let today = now.toISOString().slice(0, 10);
  let tomorrowStr = tomorrow.toISOString().slice(0, 10);
  let todayWeekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(now);
  try {
    const dateFmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    today = dateFmt.format(now);
    tomorrowStr = dateFmt.format(tomorrow);
    const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "long" });
    todayWeekday = weekdayFmt.format(now);
  } catch {
    // tz string was invalid — UTC fallback already in place
  }

  return { nowIso, today, tomorrow: tomorrowStr, todayWeekday };
}

/**
 * Extract the canonical customer identity from a workflow trigger
 * payload. Pure function — no DB calls.
 *
 * Trigger payloads come in two shapes:
 *   - flat:    { contactId, fullName, email, phone, ... }
 *   - nested:  { contactId, data: { fullName, email, phone, ... } }
 * We accept either; nested wins where both are present.
 */
export function resolveCustomerFromTriggerPayload(
  payload: Record<string, unknown>,
): RunContextCustomer {
  const data = (payload.data && typeof payload.data === "object"
    ? (payload.data as Record<string, unknown>)
    : payload) as Record<string, unknown>;

  const contactId =
    (typeof payload.contactId === "string" && payload.contactId) ||
    (typeof data.contactId === "string" && data.contactId) ||
    "";

  const fullName =
    (typeof data.fullName === "string" && data.fullName.trim()) ||
    (typeof data.name === "string" && data.name.trim()) ||
    "";
  let firstName = "";
  let lastName: string | null = null;
  if (fullName) {
    const parts = fullName.split(/\s+/);
    firstName = parts[0] ?? "";
    lastName = parts.length > 1 ? parts.slice(1).join(" ") : null;
  } else if (typeof data.firstName === "string" && data.firstName.trim()) {
    firstName = data.firstName.trim();
    lastName = typeof data.lastName === "string" ? data.lastName.trim() || null : null;
  }

  const emailRaw = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const email = emailRaw || null;

  const phoneRaw = typeof data.phone === "string" ? data.phone.trim() : "";
  const phone = phoneRaw ? toE164(phoneRaw) || phoneRaw : "";

  return { contactId, firstName, lastName, email, phone };
}

/**
 * Build a fresh RunContext at startRun. Reads workspace + soul + theme
 * + (optional) active partner agency. Resolves customer from trigger
 * payload via the pure helper.
 *
 * Persists the context on workflow_runs.context once the run row is
 * created; the runtime threads it to dispatchers thereafter.
 */
export async function buildRunContext(input: {
  runId: string;
  orgId: string;
  archetypeId: string;
  triggerPayload: Record<string, unknown>;
  triggerEventId: string | null;
  triggerEventType: string;
}): Promise<RunContext> {
  const [orgRow] = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      timezone: organizations.timezone,
      soul: organizations.soul,
      theme: organizations.theme,
      parentAgencyId: organizations.parentAgencyId,
    })
    .from(organizations)
    .where(eq(organizations.id, input.orgId))
    .limit(1);

  if (!orgRow) {
    throw new Error(`buildRunContext: workspace ${input.orgId} not found`);
  }

  const workspace: RunContextWorkspace = {
    id: orgRow.id,
    name: orgRow.name,
    slug: orgRow.slug,
    timezone: orgRow.timezone || "UTC",
    soul: (orgRow.soul ?? {}) as OrgSoul,
    theme: (orgRow.theme ?? {}) as unknown as Record<string, unknown>,
  };

  let agency: RunContextAgency | null = null;
  if (orgRow.parentAgencyId) {
    const [agencyRow] = await db
      .select({
        id: partnerAgencies.id,
        name: partnerAgencies.name,
        logoUrl: partnerAgencies.logoUrl,
        status: partnerAgencies.status,
      })
      .from(partnerAgencies)
      .where(eq(partnerAgencies.id, orgRow.parentAgencyId))
      .limit(1);
    if (agencyRow && agencyRow.status === "active") {
      agency = { id: agencyRow.id, name: agencyRow.name, logoUrl: agencyRow.logoUrl };
    }
  }

  const customer = resolveCustomerFromTriggerPayload(input.triggerPayload);
  const clock = buildClock(new Date(), workspace.timezone);
  const source = resolveSource(input.triggerEventType, input.triggerPayload, input.triggerEventId);

  return {
    runId: input.runId,
    orgId: input.orgId,
    archetypeId: input.archetypeId,
    startedAt: clock.nowIso,
    customer,
    workspace,
    agency,
    clock,
    source,
  };
}

function resolveSource(
  eventType: string,
  payload: Record<string, unknown>,
  triggerEventId: string | null,
): RunContextSource {
  const data = (payload.data && typeof payload.data === "object"
    ? payload.data
    : payload) as Record<string, unknown>;
  if (eventType === "form.submitted") {
    const formId =
      (typeof payload.formId === "string" && payload.formId) ||
      (typeof data.formId === "string" && data.formId) ||
      "";
    return { type: "form.submitted", formId, triggerEventId };
  }
  if (eventType === "booking.created") {
    const bookingId =
      (typeof payload.bookingId === "string" && payload.bookingId) ||
      (typeof data.bookingId === "string" && data.bookingId) ||
      (typeof data.appointmentId === "string" && data.appointmentId) ||
      "";
    return { type: "booking.created", bookingId, triggerEventId };
  }
  if (eventType === "sms.replied") {
    const inboundSmsId =
      (typeof payload.smsMessageId === "string" && payload.smsMessageId) ||
      (typeof data.smsMessageId === "string" && data.smsMessageId) ||
      "";
    return { type: "sms.replied", inboundSmsId, triggerEventId };
  }
  if (eventType.startsWith("schedule")) {
    return { type: "schedule", triggerEventId };
  }
  return { type: "manual", triggerEventId };
}

/**
 * Load RunContext for an in-flight run. If the run was created before
 * Phase 1 shipped (context=NULL), rebuild and persist on first access.
 *
 * Eager clock refresh: even when the persisted context exists, we
 * always re-stamp the clock so long-paused conversations see today.
 */
export async function loadRunContext(run: {
  id: string;
  orgId: string;
  archetypeId: string;
  triggerPayload: Record<string, unknown>;
  triggerEventId: string | null;
  context: Record<string, unknown> | null;
}): Promise<RunContext> {
  let rc: RunContext;
  if (run.context) {
    rc = run.context as unknown as RunContext;
  } else {
    rc = await buildRunContext({
      runId: run.id,
      orgId: run.orgId,
      archetypeId: run.archetypeId,
      triggerPayload: run.triggerPayload,
      triggerEventId: run.triggerEventId,
      triggerEventType: inferEventTypeFromPayload(run.triggerPayload),
    });
    // Best-effort persist; failures non-fatal because next call will
    // rebuild again.
    try {
      const { workflowRuns } = await import("@/db/schema");
      await db
        .update(workflowRuns)
        .set({ context: rc as unknown as Record<string, unknown> })
        .where(eq(workflowRuns.id, run.id));
    } catch {
      // swallow
    }
  }
  // Eager refresh of the clock — every dispatcher call sees current
  // today/tomorrow.
  rc = { ...rc, clock: buildClock(new Date(), rc.workspace.timezone) };
  return rc;
}

function inferEventTypeFromPayload(payload: Record<string, unknown>): string {
  // Heuristic for legacy runs without a stored eventType. Look at the
  // shape: form.submitted has formId, booking.created has bookingId,
  // sms.replied has smsMessageId.
  const data = (payload.data && typeof payload.data === "object"
    ? payload.data
    : payload) as Record<string, unknown>;
  if (typeof payload.formId === "string" || typeof data.formId === "string") {
    return "form.submitted";
  }
  if (
    typeof payload.bookingId === "string" ||
    typeof data.bookingId === "string" ||
    typeof data.appointmentId === "string"
  ) {
    return "booking.created";
  }
  if (typeof payload.smsMessageId === "string" || typeof data.smsMessageId === "string") {
    return "sms.replied";
  }
  return "manual";
}
