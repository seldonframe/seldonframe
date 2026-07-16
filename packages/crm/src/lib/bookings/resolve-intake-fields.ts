// 2026-05-18 — lazy-resolve helper for booking intake fields.
// 2026-07-16 — extracted from lib/bookings/actions.ts ("use server" exports
// must be async, which made this pure function untestable there) and taught
// to classify from SOUL signals before trusting the visual archetype.
//
// Tries (in order):
//   0. health/wellness override — clinical intake regardless of the look
//   1. soul/settings vertical → classifyArchetypeFromSoul (the BUSINESS
//      signal; set for every workspace built through createFullWorkspace)
//   2. theme.aestheticArchetype — only when soul/settings give no vertical
//   3. classify from soul.industry + description PLUS workspace name +
//      appointment title as extra signal
//   4. fall back to "editorial-warm" via the classifier's catch-all
// ALWAYS returns a non-empty field set — even with zero soul data we
// get the editorial-warm baseline (address + phone + scope + timeline
// + budget) which is universally useful for a service business.

import {
  classifyArchetype,
  classifyArchetypeFromSoul,
  type AestheticArchetypeId,
} from "@/lib/workspace/aesthetic-archetypes";
import { getBookingIntakeFieldsForArchetype } from "@/lib/workspace/booking-intake-fields";
import { classifyHealthTemplate } from "@/lib/landing/template-selection";
import type { BookingIntakeField } from "@/lib/bookings/actions";

export function resolveIntakeFieldsFromSoul(
  rawTheme: unknown,
  rawSoul: unknown,
  rawSettings: unknown,
  workspaceName: string | null,
  appointmentTitle: string | null,
): BookingIntakeField[] {
  // Blend soul + workspace-name + appointment-title into ONE string the
  // classifiers can pattern-match against. Keywords like "physio", "dental",
  // "roof", "hvac" often live in the workspace name ("Roofs by Shiloh", "Dr.
  // Smith Dental") or the appointment title ("Free Roof Inspection") even when
  // soul.industry was never set by the operator.
  const soul = (rawSoul && typeof rawSoul === "object" ? (rawSoul as Record<string, unknown>) : null) ?? null;
  const settings = (rawSettings && typeof rawSettings === "object" ? (rawSettings as Record<string, unknown>) : null) ?? null;
  const business = (soul?.business && typeof soul.business === "object" ? (soul.business as Record<string, unknown>) : null) ?? null;
  const crmPersonality =
    (settings?.crmPersonality && typeof settings.crmPersonality === "object"
      ? (settings.crmPersonality as Record<string, unknown>)
      : null) ?? null;
  // The BUSINESS vertical — soul.personality_vertical (snake_case runtime
  // shape) falling back to settings.crmPersonality.vertical (the v2 creation
  // path writes vertical into settings, not soul). This is the signal that
  // must beat the visual archetype: it describes what the business DOES.
  const personalityVertical =
    (typeof soul?.personality_vertical === "string" ? soul.personality_vertical.trim() : "") ||
    (typeof crmPersonality?.vertical === "string" ? crmPersonality.vertical.trim() : "");
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
  const blendedHints = [
    // 2026-07-16 — include the personality vertical so the health override
    // below catches a physio/chiro/massage workspace whose ONLY signal is
    // settings.crmPersonality.vertical (no name/description keywords).
    personalityVertical,
    soulVertical,
    workspaceName ?? "",
    appointmentTitle ?? "",
    soulDescription,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  // 0. Health/wellness businesses ALWAYS get the clinical intake — regardless
  //    of the *visual* archetype. The aesthetic look (editorial-warm,
  //    cinematic-aspirational, soft-residential…) is a design choice; it must
  //    never stamp contractor-style "project address / materials / budget"
  //    questions onto a physio/clinic/spa. This deliberately precedes the
  //    theme.aestheticArchetype lookup, which was the source of the mismatch
  //    (a physio on the editorial-warm *look* got the high-end-contractor set).
  if (
    classifyHealthTemplate({
      businessName: workspaceName ?? "",
      businessDescription: blendedHints,
      services: [],
    })
  ) {
    return getBookingIntakeFieldsForArchetype("clinical-trust");
  }

  // 1. 2026-07-16 — classify from SOUL signals before trusting the theme.
  //    theme.aestheticArchetype records a LOOK (operators pick it from the
  //    ready-page design picker / copilot update_design); it must never
  //    drive intake SEMANTICS when the soul says what the business does.
  //    Live-confirmed failure: an HVAC company (settings vertical "hvac",
  //    soul.emergency_service true) picked the "Technical" look → the
  //    resolver served B2B consulting questions (Company / Role / Team
  //    size / Budget) instead of dispatch questions. Same bug class as the
  //    health override above — this generalizes it to every vertical.
  if (personalityVertical) {
    return getBookingIntakeFieldsForArchetype(
      classifyArchetypeFromSoul(rawSoul, rawSettings),
    );
  }

  // 2. Try the explicit archetype on the theme — only reached when soul +
  //    settings carry no vertical, so the look is the best signal we have.
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
