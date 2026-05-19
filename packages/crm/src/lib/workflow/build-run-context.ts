// buildRunContext + helpers — stamps a RunContext at startRun and
// rebuilds it lazily on access if the persisted column is null
// (existing pre-Phase-1 runs).
import { toE164 } from "@/lib/sms/providers/interface";
import type { RunContextClock, RunContextCustomer } from "./run-context";

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
