// 2026-05-18 — Build the {{placeholder}} render-vars map for outbound
// message composition. The skill prose references slots like
// {{contactFirstName}} and {{bookingStartsAtLocal}}; this is where they
// resolve to actual strings.
//
// Per the placeholder catalog in the messaging plan v2:
//   {{businessName}}, {{businessPhone}}, {{timezone}}, {{voice}},
//   {{contactFirstName}}, {{contactEmail}}, {{contactPhone}},
//   {{bookingTitle}}, {{bookingStartsAt}}, {{bookingStartsAtLocal}},
//   {{bookingEndsAt}}, {{bookingDuration}}, {{bookingPageUrl}},
//   {{customerPortalUrl}}, {{intakeFormName}}, {{intakeData.<key>}}
//
// Slice 2 ships the booking.* event placeholders. intake.* + contact-
// historical placeholders land in slices 3 + 7.

import type { OrgSoul } from "@/lib/soul/types";

export type DispatchEventPayload = Record<string, unknown>;

export type RenderVarsInput = {
  eventType: string;
  payload: DispatchEventPayload;
  org: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    soul: unknown;
  };
  contact: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
  } | null;
};

const WORKSPACE_BASE_DOMAIN =
  process.env.WORKSPACE_BASE_DOMAIN?.trim() || "app.seldonframe.com";

export function buildRenderVars(input: RenderVarsInput): Record<string, string> {
  const vars: Record<string, string> = {};

  // Workspace + soul-derived
  vars.businessName = input.org.name || "";
  vars.timezone = input.org.timezone || "UTC";
  vars.customerPortalUrl = `https://${WORKSPACE_BASE_DOMAIN}/customer/${input.org.slug}`;

  const soul = (input.org.soul as OrgSoul | null) ?? null;
  if (soul) {
    if (soul.voice?.style) vars.voice = soul.voice.style;
    // Phone may live on the soul as a snake_case enrichment field
    // (extraction-prompt.ts emits `phone`) — pull both shapes.
    const soulRaw = soul as unknown as Record<string, unknown>;
    const phone = typeof soulRaw.phone === "string" ? soulRaw.phone : "";
    if (phone) vars.businessPhone = phone;
  }
  if (!vars.voice) vars.voice = "friendly, professional, brief";
  if (!vars.businessPhone) vars.businessPhone = "";

  // Contact-derived
  if (input.contact) {
    vars.contactFirstName = input.contact.firstName || "";
    vars.contactEmail = input.contact.email ?? "";
    vars.contactPhone = input.contact.phone ?? "";
  } else {
    vars.contactFirstName = "";
    vars.contactEmail = "";
    vars.contactPhone = "";
  }

  // Booking-specific (payload comes from emitSeldonEvent('booking.created', {...}))
  if (input.eventType.startsWith("booking.")) {
    const title = typeof input.payload.title === "string" ? input.payload.title : "";
    const startsAt = input.payload.startsAt;
    const endsAt = input.payload.endsAt;
    const bookingSlug =
      typeof input.payload.bookingSlug === "string" ? input.payload.bookingSlug : "";

    vars.bookingTitle = title;
    vars.bookingStartsAt = isoStringFrom(startsAt);
    vars.bookingEndsAt = isoStringFrom(endsAt);
    vars.bookingStartsAtLocal = formatLocal(startsAt, vars.timezone);
    vars.bookingDuration = formatDuration(startsAt, endsAt);
    vars.bookingPageUrl = bookingSlug
      ? `https://${WORKSPACE_BASE_DOMAIN}/book/${input.org.slug}/${bookingSlug}`
      : `https://${WORKSPACE_BASE_DOMAIN}/book/${input.org.slug}`;
  }

  return vars;
}

function isoStringFrom(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function formatLocal(value: unknown, timezone: string): string {
  const d = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatDuration(startVal: unknown, endVal: unknown): string {
  const start = startVal instanceof Date ? startVal : typeof startVal === "string" ? new Date(startVal) : null;
  const end = endVal instanceof Date ? endVal : typeof endVal === "string" ? new Date(endVal) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "";
  }
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (rem === 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${hours}h ${rem}m`;
}
