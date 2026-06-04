/**
 * change-plan.ts — Pure mapper: submitted intake answers → ChangePlan
 *
 * Composes parseHoursText + parseServicesText into a structured review
 * payload the agency approves before applying to the workspace.
 */

import { parseHoursText, WeeklyAvailability } from "./parse-hours";
import { parseServicesText } from "./parse-services";

// ── exported payload type ─────────────────────────────────────────────────────

export type ChangePlan = {
  soul: Record<string, unknown>;
  theme?: { primaryColor?: string; accentColor?: string };
  bookingDefault?: { availability: WeeklyAvailability; primaryServiceName?: string };
  appointmentTypes: { title: string; durationMinutes: number; price: number }[];
  contactsFileUrl?: string;
  bookingsFileUrl?: string;
  callHandling: "ai_voice" | "human_then_text" | "none";
  leadRouting: ("email" | "text")[];
  domain?: string;
  summaries: string[];
};

// ── helpers ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strArr(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") return [v];
  return [];
}

/** Extract the first hex color (#rrggbb or #rgb) from a string. */
function firstHex(s: string): string | undefined {
  const m = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(s);
  return m ? m[0] : undefined;
}

/** Extract all hex colors from a string. */
function allHex(s: string): string[] {
  return [...s.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map(m => m[0]);
}

// ── soul builder ──────────────────────────────────────────────────────────────

function buildSoul(data: Record<string, unknown>): Record<string, unknown> {
  const soul: Record<string, unknown> = {};

  const pick = (key: string, soulKey = key) => {
    const v = data[key];
    if (v !== undefined && v !== null && v !== "") soul[soulKey] = v;
  };

  pick("business_name");
  pick("tagline");
  pick("phone");
  pick("email");

  // address / service_area
  if (str(data["has_public_address"]).toLowerCase() === "yes" && str(data["address"])) {
    soul["service_area"] = data["address"];
  } else if (str(data["address"])) {
    soul["service_area"] = data["address"];
  }

  pick("website_url", "website");
  pick("google_reviews_url", "google_place_url");

  // testimonials: split multi-line string into array
  const testimonials = str(data["testimonials"]);
  if (testimonials) {
    soul["testimonials"] = testimonials.split(/\n/).map(l => l.trim()).filter(Boolean);
  }

  // socials
  const socials = data["socials"];
  if (socials !== undefined && socials !== null && socials !== "") soul["socials"] = socials;

  return soul;
}

// ── theme builder ─────────────────────────────────────────────────────────────

function buildTheme(data: Record<string, unknown>): ChangePlan["theme"] {
  const raw = str(data["brand_colors"]);
  if (!raw) return undefined;

  const colors = allHex(raw);
  if (colors.length === 0) return undefined;

  const theme: ChangePlan["theme"] = {};
  if (colors[0]) theme.primaryColor = colors[0];
  if (colors[1]) theme.accentColor = colors[1];
  return theme;
}

// ── call-handling mapper ──────────────────────────────────────────────────────

function mapCallHandling(raw: string): ChangePlan["callHandling"] {
  const s = raw.trim().toLowerCase();
  if (s.includes("ai answers")) return "ai_voice";
  if (s.includes("text me missed")) return "human_then_text";
  return "none";
}

// ── lead routing mapper ───────────────────────────────────────────────────────

function mapLeadRouting(raw: unknown): ChangePlan["leadRouting"] {
  const allowed = new Set<"email" | "text">(["email", "text"]);
  return strArr(raw)
    .map(v => v.toLowerCase() as "email" | "text")
    .filter(v => allowed.has(v));
}

// ── summaries builder ─────────────────────────────────────────────────────────

function buildSummaries(plan: Omit<ChangePlan, "summaries">): string[] {
  const lines: string[] = [];

  const name = str(plan.soul["business_name"]) || "your business";

  if (plan.soul["business_name"]) lines.push(`Website: set up landing page for ${name}`);

  if (plan.bookingDefault) {
    const days = Object.entries(plan.bookingDefault.availability)
      .filter(([, s]) => s.enabled)
      .map(([d]) => d)
      .join(", ");
    lines.push(`Booking: availability set for ${days}`);
  }

  if (plan.appointmentTypes.length > 0) {
    lines.push(
      `Services: ${plan.appointmentTypes.length} appointment type(s) created (${plan.appointmentTypes.map(a => a.title).join(", ")})`
    );
  }

  if (plan.contactsFileUrl) lines.push("CRM: contacts CSV queued for import");
  if (plan.bookingsFileUrl) lines.push("Bookings: bookings CSV queued for import");

  if (plan.domain) lines.push(`Domain: ${plan.domain} → connect custom domain`);

  if (plan.callHandling !== "none") {
    const label = plan.callHandling === "ai_voice" ? "AI voice agent" : "human-first + text fallback";
    lines.push(`Call handling: ${label}`);
  }

  if (plan.theme) lines.push("Theme: brand colors applied");

  if (lines.length === 0) lines.push("Workspace: basic profile updated");

  return lines;
}

// ── main export ───────────────────────────────────────────────────────────────

export function buildChangePlan(data: Record<string, unknown>): ChangePlan {
  // Soul
  const soul = buildSoul(data);

  // Theme
  const theme = buildTheme(data);

  // Booking default
  const hoursText = str(data["hours_text"]);
  const primaryService = str(data["primary_service"]) || undefined;
  const bookingDefault: ChangePlan["bookingDefault"] = hoursText
    ? { availability: parseHoursText(hoursText), primaryServiceName: primaryService }
    : undefined;

  // Appointment types
  const servicesText = str(data["services_text"]);
  const appointmentTypes = servicesText
    ? parseServicesText(servicesText).map(s => ({
        title: s.name,
        durationMinutes: s.durationMinutes,
        price: s.price,
      }))
    : [];

  // File URLs
  const contactsFileUrl = str(data["contacts_file"]) || undefined;
  const bookingsFileUrl = str(data["bookings_file"]) || undefined;

  // Call handling
  const callHandling = mapCallHandling(str(data["call_handling"]));

  // Lead routing
  const leadRouting = mapLeadRouting(data["lead_routing"]);

  // Domain
  const hasDomain = str(data["has_domain"]).toLowerCase() === "yes";
  const domainRaw = str(data["domain"]);
  const domain = hasDomain && domainRaw ? domainRaw : undefined;

  const partial: Omit<ChangePlan, "summaries"> = {
    soul,
    ...(theme ? { theme } : {}),
    ...(bookingDefault ? { bookingDefault } : {}),
    appointmentTypes,
    ...(contactsFileUrl ? { contactsFileUrl } : {}),
    ...(bookingsFileUrl ? { bookingsFileUrl } : {}),
    callHandling,
    leadRouting,
    ...(domain ? { domain } : {}),
  };

  return { ...partial, summaries: buildSummaries(partial) };
}
