// 2026-05-18 — lazy-resolve helper for booking intake fields.
// 2026-07-16 — extracted from lib/bookings/actions.ts ("use server" exports
// must be async, which made this pure function untestable there) and taught
// to classify from SOUL signals before trusting the visual archetype.
//
// The BUSINESS-signal classification (health override → meaningful vertical)
// lives in classifyIntakeArchetypeFromBusinessSignals, shared with the
// creation-time seeder (lib/workspace/seed-booking-intake-fields.ts) so the
// two paths can never drift: whatever creation would seed, a render-time
// lazy resolve computes identically.
//
// resolveIntakeFieldsFromSoul tries (in order):
//   0. health/wellness override — clinical intake regardless of the look
//   1. meaningful soul/settings vertical → classifyArchetype (the BUSINESS
//      signal; set for every workspace built through createFullWorkspace).
//      The default "general" vertical carries no business meaning and is
//      treated as absent — it must not short-circuit the steps below.
//   2. theme.aestheticArchetype — only when soul/settings give no vertical
//   3. classify from soul.industry + description PLUS workspace name +
//      appointment title as extra signal
//   4. fall back to "editorial-warm" via the classifier's catch-all
// ALWAYS returns a non-empty field set — even with zero soul data we
// get the editorial-warm baseline (address + phone + scope + timeline
// + budget) which is universally useful for a service business.

import {
  classifyArchetype,
  extractArchetypeSignalsFromSoul,
  type AestheticArchetypeId,
} from "@/lib/workspace/aesthetic-archetypes";
import { getBookingIntakeFieldsForArchetype } from "@/lib/workspace/booking-intake-fields";
import { classifyHealthTemplate } from "@/lib/landing/template-selection";
import type { BookingIntakeField } from "@/lib/bookings/actions";

/** Personality verticals that carry no business meaning — the registry
 *  default for businesses that match no specific vertical. A generic
 *  vertical must never short-circuit richer signals (theme archetype,
 *  workspace-name/title hints). */
const GENERIC_VERTICALS = new Set(["general"]);

export interface IntakeArchetypeBusinessSignals {
  /** Personality vertical (soul.personality_vertical / settings.crmPersonality.vertical). */
  vertical?: string | null;
  businessName?: string | null;
  /** Appointment-type title ("Emergency AC Repair") — render-time only. */
  appointmentTitle?: string | null;
  /** Legacy soul hints (soul.industry / soul.business.vertical / description). */
  industryHints?: string | null;
  emergencyService?: boolean | null;
  sameDay?: boolean | null;
  reviewRating?: number | null;
  reviewCount?: number | null;
  businessDescription?: string | null;
}

/**
 * Classify the booking-intake archetype from BUSINESS signals — never from
 * the visual theme. Returns null when the business gives no confident
 * signal (no health match, no meaningful vertical) so the caller picks its
 * own fallback: the lazy resolver falls through to theme + blended hints;
 * the creation-time seeder falls through to name+description hints.
 *
 * Live-confirmed bug class this guards (flow-tech-air-conditioning): an
 * HVAC company (settings vertical "hvac", soul.emergency_service true)
 * picked the "Technical" LOOK → the resolver served B2B consulting
 * questions (Company / Role / Team size / Budget) instead of dispatch
 * questions. The look is a SURFACE choice; intake semantics come from
 * what the business does.
 */
export function classifyIntakeArchetypeFromBusinessSignals(
  signals: IntakeArchetypeBusinessSignals,
): AestheticArchetypeId | null {
  const vertical = (signals.vertical ?? "").trim();
  const hay = [
    vertical,
    signals.industryHints ?? "",
    signals.businessName ?? "",
    signals.appointmentTitle ?? "",
    signals.businessDescription ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  // 0. Health/wellness businesses ALWAYS get the clinical intake — regardless
  //    of the *visual* archetype and BEFORE the vertical classifier, because
  //    health niches (physio, chiro, massage, yoga…) aren't in the CRM
  //    personality registry: they resolve to the "general" vertical, and
  //    classifyArchetype would catch-all them into contractor-style
  //    "project address / materials / budget" questions (the original
  //    physio-on-editorial-warm bug).
  if (
    classifyHealthTemplate({
      businessName: signals.businessName ?? "",
      businessDescription: hay,
      services: [],
    })
  ) {
    return "clinical-trust";
  }

  // 1. A meaningful business vertical → the archetype classifier with the
  //    full soul signals. "general" (the registry default) says nothing
  //    about the business, so it is treated as no-signal.
  if (vertical && !GENERIC_VERTICALS.has(vertical.toLowerCase())) {
    return classifyArchetype({
      vertical,
      emergencyService: signals.emergencyService ?? null,
      sameDay: signals.sameDay ?? null,
      reviewRating: signals.reviewRating ?? null,
      reviewCount: signals.reviewCount ?? null,
      businessDescription: signals.businessDescription ?? null,
    });
  }

  return null;
}

export function resolveIntakeFieldsFromSoul(
  rawTheme: unknown,
  rawSoul: unknown,
  rawSettings: unknown,
  workspaceName: string | null,
  appointmentTitle: string | null,
): BookingIntakeField[] {
  // Legacy soul hints — keywords like "physio", "dental", "roof", "hvac"
  // often live in soul.industry, the workspace name ("Roofs by Shiloh",
  // "Dr. Smith Dental"), or the appointment title ("Free Roof Inspection")
  // even when the personality vertical was never set.
  const soul = (rawSoul && typeof rawSoul === "object" ? (rawSoul as Record<string, unknown>) : null) ?? null;
  const business = (soul?.business && typeof soul.business === "object" ? (soul.business as Record<string, unknown>) : null) ?? null;
  const soulVertical = typeof soul?.industry === "string"
    ? soul.industry
    : typeof business?.industry === "string"
      ? business.industry
      : typeof business?.vertical === "string"
        ? business.vertical
        : "";
  const soulDescription = typeof business?.description === "string"
    ? business.description
    : typeof soul?.summary === "string"
      ? soul.summary
      : "";

  // 0+1. Health override + meaningful-vertical classification — shared with
  //      the creation-time seeder so render-time and creation-time agree.
  const soulSignals = extractArchetypeSignalsFromSoul(rawSoul, rawSettings);
  const businessArchetype = classifyIntakeArchetypeFromBusinessSignals({
    ...soulSignals,
    businessName: workspaceName,
    appointmentTitle,
    industryHints: [soulVertical, soulDescription].filter(Boolean).join(" ") || null,
  });
  if (businessArchetype) {
    return getBookingIntakeFieldsForArchetype(businessArchetype);
  }

  // 2. Try the explicit archetype on the theme — only reached when soul +
  //    settings carry no meaningful vertical, so the look is the best
  //    signal we have.
  const theme = (rawTheme && typeof rawTheme === "object" ? (rawTheme as Record<string, unknown>) : null);
  const explicitArchetype = typeof theme?.aestheticArchetype === "string" ? theme.aestheticArchetype as AestheticArchetypeId : null;

  if (explicitArchetype) {
    try {
      return getBookingIntakeFieldsForArchetype(explicitArchetype);
    } catch {
      // Unknown archetype id — fall through to classify-from-soul.
    }
  }

  // 3. Classify from the blended hints. We pass them as both `vertical` (for
  //    the .test(v + " " + desc) checks) and `businessDescription` (for the
  //    desc-only checks) so a hit on either branch fires.
  const blendedHints = [
    soulVertical,
    workspaceName ?? "",
    appointmentTitle ?? "",
    soulDescription,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  try {
    const archetypeId = classifyArchetype({
      vertical: blendedHints,
      businessDescription: soulDescription || blendedHints,
    });
    return getBookingIntakeFieldsForArchetype(archetypeId);
  } catch {
    // Last-resort fallback — pick editorial-warm directly. The classifier
    // itself uses this as its catch-all, so we get the same shape but bypass
    // any unforeseen throw inside it.
    return getBookingIntakeFieldsForArchetype("editorial-warm");
  }
}
