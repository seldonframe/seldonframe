// 2026-05-23 — Apply archetype-driven theme tokens to a workspace.
//
// Why this exists:
//
//   The old workspace-creation path called `enhanceLandingForWorkspace`
//   (lib/workspace/enhance-blocks.ts), which classified an aesthetic
//   archetype from soul + wrote the archetype's palette + font + archetype
//   id onto `organizations.theme`. Every downstream surface (landing
//   page, booking page, intake form, public chatbot embed) then read
//   from that theme.
//
//   v1.55.0 dropped `enhanceLandingForWorkspace` from the default creation
//   path (see create-full.ts comment at v1.55.0 — "REMOVED:
//   enhanceLandingForWorkspace … no longer called by default"). The
//   default public surface became a chatbot-preview page seeded by
//   `v2/complete`. As a side effect, `organizations.theme` was left at
//   the legacy DB column DEFAULT — `{primaryColor:"#14b8a6",
//   accentColor:"#0d9488", fontFamily:"Inter", mode:"dark", …}` from
//   drizzle/0010_organization_theme_jsonb.sql — for every new workspace.
//
//   Visible regression: the public chatbot embed (api/v1/public/agent/…
//   /embed.js) reads theme.primaryColor → renders a teal bubble on a
//   bold-urgency plumber whose landing is clearly red. The embed code
//   correctly falls back to the archetype palette ONLY when both
//   primaryColor is null AND aestheticArchetype is null; here both are
//   set to the legacy default so the cascade picks the wrong one.
//
//   This helper restores the archetype write at the right point in the
//   v2 flow (v2/complete, immediately after the chatbot agent is auto-
//   created so the embed sees the right theme on first request). It's
//   also exposed as a defensive lazy-backfill so the embed.js route can
//   self-heal pre-fix workspaces on next request.
//
// What it does:
//
//   1. Read the org's current theme + soul.
//   2. Classify the archetype from soul (vertical / emergency / desc / …).
//   3. Write a new theme that:
//        - sets aestheticArchetype to the classified id
//        - overwrites primaryColor / accentColor / fontFamily / mode WHEN
//          they look like the legacy SeldonFrame default (#14b8a6 / Inter
//          / dark). Operator-customized values (any hex other than
//          #14b8a6/#0d9488, any font other than Inter, light mode) are
//          preserved.
//        - preserves logoUrl + motionPreset + borderRadius untouched —
//          those are independent of archetype and operators frequently
//          set logoUrl from theme settings.
//
// Boundary:
//
//   - Soft-fail. If classification or the DB write throws, we log + return
//     { ok: false }. The workspace stays valid (just falls back to the
//     SeldonFrame default theme in the embed).
//   - Idempotent. Calling twice writes the same shape twice. Subsequent
//     calls re-classify from soul; if soul hasn't changed, the archetype
//     id is stable.
//   - No-op when aestheticArchetype is ALREADY set. Operators who
//     customized their theme via the Settings page get a non-null
//     primaryColor + the apply-theme path sets aestheticArchetype to
//     their picked archetype; we don't want to overwrite their choice.

import { eq } from "drizzle-orm";

import { db } from "@/db";
import { organizations } from "@/db/schema";
import {
  classifyArchetype,
  ARCHETYPES,
  type AestheticArchetypeId,
} from "@/lib/workspace/aesthetic-archetypes";
import { DEFAULT_ORG_THEME, type OrgTheme } from "@/lib/theme/types";

/** Legacy SeldonFrame default palette — written by the DB column default
 *  in drizzle/0010_organization_theme_jsonb.sql for every workspace
 *  created before the archetype theme was applied. Any theme whose
 *  primaryColor matches this exactly is presumed to be the untouched
 *  default and is eligible for archetype overwrite. */
const LEGACY_DEFAULT_PRIMARY = "#14b8a6";
const LEGACY_DEFAULT_ACCENT = "#0d9488";
const LEGACY_DEFAULT_FONT = "Inter";

/** A theme is considered "legacy untouched default" if its primary AND
 *  font are both at the pre-archetype default. We require BOTH to match
 *  so an operator who only customized the font (kept the default teal)
 *  still gets their font preserved — and vice versa. The DEFAULT_ORG_THEME
 *  (the post-v1.40 default — soft-residential primary + Geist) is NOT
 *  considered legacy, since it was already archetype-aware. */
function isLegacyDefaultTheme(theme: OrgTheme): boolean {
  return (
    theme.primaryColor === LEGACY_DEFAULT_PRIMARY &&
    theme.fontFamily === LEGACY_DEFAULT_FONT
  );
}

export interface ApplyArchetypeThemeResult {
  ok: boolean;
  /** Classified archetype id (always returned even on write failure, so
   *  the caller can log it). */
  archetype: AestheticArchetypeId | null;
  /** Whether we actually wrote a new theme row. False when the existing
   *  theme already has an archetype id and we left it alone. */
  wrote: boolean;
  /** Whether legacy-default fields (teal/Inter) were overwritten with
   *  archetype tokens. False when the operator had a non-default theme;
   *  in that case we only added aestheticArchetype + preserved the rest. */
  overwroteLegacyDefaults: boolean;
  /** Soft-fail diagnostic when ok=false. */
  reason?: string;
}

/**
 * Classify the archetype from the org's soul and write archetype-driven
 * theme tokens. Idempotent. Soft-fails — never throws.
 *
 * Call this:
 *   - From v2/complete BEFORE the public chatbot embed activates.
 *   - From embed.js as a defensive backfill when theme.aestheticArchetype
 *     is null AND theme is the legacy default (signals: never classified).
 */
export async function applyArchetypeThemeToOrg(
  orgId: string,
): Promise<ApplyArchetypeThemeResult> {
  try {
    const [org] = await db
      .select({
        id: organizations.id,
        theme: organizations.theme,
        soul: organizations.soul,
        settings: organizations.settings,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1);

    if (!org) {
      return { ok: false, archetype: null, wrote: false, overwroteLegacyDefaults: false, reason: "org_not_found" };
    }

    const currentTheme = (org.theme ?? DEFAULT_ORG_THEME) as OrgTheme;

    // Skip when the archetype is already set — respects operator choice.
    // (Settings page sets aestheticArchetype via apply_design_md / theme
    // form; we don't want to silently overwrite their picked archetype.)
    if (currentTheme.aestheticArchetype) {
      return {
        ok: true,
        archetype: currentTheme.aestheticArchetype,
        wrote: false,
        overwroteLegacyDefaults: false,
      };
    }

    // organizations.soul JSONB stores snake_case keys (personality_vertical,
    // emergency_service, …) even though the OrgSoul TS interface is
    // camelCase. Cast through Record<string, unknown> to read the actual
    // runtime shape — same pattern used in resolveOrgArchetype
    // (lib/page-blocks/persist.ts) and seedChatbotPreviewLandingForOrg.
    const soulRecord = (org.soul as unknown as Record<string, unknown> | null) ?? null;
    // Fall back to settings.crmPersonality.vertical when soul.personality_vertical
    // is missing — the v2 creation path writes vertical into settings, not soul.
    const settingsRecord = (org.settings ?? null) as Record<string, unknown> | null;
    const crmPersonality = settingsRecord?.crmPersonality as
      | { vertical?: string }
      | undefined;
    const vertical =
      (soulRecord?.personality_vertical as string | undefined) ??
      crmPersonality?.vertical ??
      "";

    const archetypeId = classifyArchetype({
      vertical,
      emergencyService: (soulRecord?.emergency_service as boolean | null | undefined) ?? null,
      sameDay: (soulRecord?.same_day as boolean | null | undefined) ?? null,
      reviewRating: (soulRecord?.review_rating as number | null | undefined) ?? null,
      reviewCount: (soulRecord?.review_count as number | null | undefined) ?? null,
      businessDescription: (soulRecord?.business_description as string | null | undefined) ?? null,
    });
    const archetype = ARCHETYPES[archetypeId];

    // Only overwrite palette/font fields when the current theme looks like
    // the legacy DB-default (teal + Inter). Otherwise we treat it as
    // operator-customized and preserve those fields.
    const overwriteLegacy = isLegacyDefaultTheme(currentTheme);

    const newTheme: OrgTheme = overwriteLegacy
      ? {
          primaryColor: archetype.palette.primary,
          accentColor: archetype.palette.secondary,
          fontFamily: archetype.fonts.headline as OrgTheme["fontFamily"],
          // Light mode is the v1.38.5+ default for customer-facing
          // surfaces. The legacy theme's `dark` was set when SF's own
          // brand was dark — every archetype palette is designed for
          // light backgrounds (see archetype.palette.background hex).
          mode: "light",
          borderRadius: currentTheme.borderRadius,
          logoUrl: currentTheme.logoUrl,
          motionPreset: currentTheme.motionPreset ?? archetype.motionPreset,
          aestheticArchetype: archetypeId,
        }
      : {
          ...currentTheme,
          aestheticArchetype: archetypeId,
        };

    await db
      .update(organizations)
      .set({ theme: newTheme, updatedAt: new Date() })
      .where(eq(organizations.id, orgId));

    console.warn(
      JSON.stringify({
        event: "archetype_theme_applied",
        workspace_id: orgId,
        archetype: archetypeId,
        overwrote_legacy_defaults: overwriteLegacy,
      }),
    );

    return {
      ok: true,
      archetype: archetypeId,
      wrote: true,
      overwroteLegacyDefaults: overwriteLegacy,
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(
      JSON.stringify({
        event: "archetype_theme_apply_failed",
        workspace_id: orgId,
        reason,
      }),
    );
    return { ok: false, archetype: null, wrote: false, overwroteLegacyDefaults: false, reason };
  }
}
