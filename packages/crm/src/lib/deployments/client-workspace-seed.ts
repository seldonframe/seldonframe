// Front-office bridge — map a deployment's captured client context into the
// STRUCTURED CreateFullWorkspaceInput that createFullWorkspace consumes.
//
// This is a PLAIN module (NOT "use server"): it exports a synchronous pure
// function imported by both the provisioner (provision-client-workspace.ts) and
// the unit tests. No DB, no network.
//
// The deployment captured a NARROW client soul (businessName, description,
// services, business_hours, voice) + an optional FAQ + an optional contact
// (phone/email/address) at deploy time. createFullWorkspace, by contrast, wants
// the full structured workspace seed and VALIDATES that business_name, city,
// state, phone, services[] (non-empty), and business_description are all
// non-empty (create-full.ts:161-173 — each checked with .trim()). The captured
// context legitimately may lack city/state/phone, so this mapper OWNS the
// required-field fallbacks: it derives city/state from the contact address when
// present, and otherwise substitutes neutral, operator-editable placeholders so
// provisioning never aborts on a validation error. The optional channels
// (email/address/weekly_hours) pass through as null when absent.

import type { CreateFullWorkspaceInput } from "@/lib/workspace/create-full";
import type {
  DeploymentClientContact,
  DeploymentClientContext,
} from "@/db/schema/deployments";

/** Args the provisioner threads through from the deployment row. */
export type BuildClientWorkspaceInputArgs = {
  clientName: string;
  clientContext: DeploymentClientContext | null | undefined;
  clientContact: DeploymentClientContact | null | undefined;
};

/** Trim to a non-empty string, or undefined. */
function cleanStr(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type WeeklyHours = NonNullable<CreateFullWorkspaceInput["weekly_hours"]>;

/**
 * Map the captured (free-form) business_hours Record into the canonical
 * Partial<Record<day, {enabled,start,end}>> shape createFullWorkspace expects.
 * Reads defensively — only well-formed entries keyed by a real weekday name
 * survive; malformed values and unknown keys are dropped (never throws).
 * Returns null when nothing usable remains so the caller can omit the field.
 */
function mapWeeklyHours(
  businessHours: Record<string, unknown> | undefined,
): WeeklyHours | null {
  if (!businessHours || typeof businessHours !== "object") return null;
  const out: WeeklyHours = {};
  for (const day of WEEKDAYS) {
    const raw = (businessHours as Record<string, unknown>)[day];
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as { enabled?: unknown; start?: unknown; end?: unknown };
    const start = cleanStr(entry.start);
    const end = cleanStr(entry.end);
    if (typeof entry.enabled !== "boolean" || !start || !end) continue;
    out[day] = { enabled: entry.enabled, start, end };
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Parse a "Street, City, ST [ZIP]" address into { city, state }. Returns
 * undefined for either part it can't confidently extract. The convention
 * (matching createFullWorkspace callers): comma-separated, with the City and a
 * 2-letter state code as the last two segments (an optional trailing ZIP on the
 * state segment is stripped). Anything that doesn't fit yields undefined so the
 * caller falls back to a neutral default.
 */
function parseCityState(address: string | undefined): {
  city?: string;
  state?: string;
} {
  const addr = cleanStr(address);
  if (!addr) return {};
  const parts = addr
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length < 2) return {};
  // Last segment is "ST" or "ST 78701"; the one before it is the city.
  const stateSeg = parts[parts.length - 1];
  const city = cleanStr(parts[parts.length - 2]);
  const stateToken = stateSeg.split(/\s+/)[0];
  const state =
    stateToken && /^[A-Za-z]{2}$/.test(stateToken)
      ? stateToken.toUpperCase()
      : undefined;
  return { city, state };
}

// Neutral, operator-editable placeholders for the required fields the captured
// context legitimately may not carry. createFullWorkspace's validator only
// requires NON-EMPTY trimmed strings; these satisfy it without inventing real
// data the agency would have to trust. They never reach a customer-facing
// surface unedited any more than a blank capture would.
const FALLBACK_CITY = "Unknown";
const FALLBACK_STATE = "Unknown";
const FALLBACK_PHONE = "000-000-0000";

/**
 * Build a validated CreateFullWorkspaceInput from a deployment's captured
 * client context + contact. Pure. The returned object is GUARANTEED to pass
 * createFullWorkspace's required-field validation (non-empty business_name,
 * city, state, phone, a non-empty services[], business_description).
 */
export function buildClientWorkspaceInput(
  args: BuildClientWorkspaceInputArgs,
): CreateFullWorkspaceInput {
  const soul = args.clientContext?.soul ?? undefined;
  const contact = args.clientContact ?? undefined;

  const businessName =
    cleanStr(soul?.businessName) ?? cleanStr(args.clientName) ?? "New Client";

  const services = (soul?.services ?? [])
    .map((s) => cleanStr(s?.name))
    .filter((name): name is string => Boolean(name));
  // Required: non-empty. Fall back to the business name so the workspace always
  // has at least one service to seed the pipeline/landing with.
  if (services.length === 0) services.push(businessName);

  const businessDescription =
    cleanStr(soul?.businessDescription) ?? `${businessName} — services`;

  const phone = cleanStr(contact?.phone) ?? FALLBACK_PHONE;
  const email = cleanStr(contact?.email) ?? null;
  const address = cleanStr(contact?.address) ?? null;

  const { city: parsedCity, state: parsedState } = parseCityState(
    contact?.address,
  );
  const city = parsedCity ?? FALLBACK_CITY;
  const state = parsedState ?? FALLBACK_STATE;

  const weekly_hours = mapWeeklyHours(soul?.business_hours);

  return {
    business_name: businessName,
    city,
    state,
    phone,
    services,
    business_description: businessDescription,
    email,
    address,
    weekly_hours,
  };
}
