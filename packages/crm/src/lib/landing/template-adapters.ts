// lib/landing/template-adapters.ts
//
// Adapters that bridge SeldonFrame's internal data shapes onto the shared
// landing-template contract (`components/landing-templates/_contract/types`).
//
// - archetypeToSfTheme: archetype palette/fonts → the template's flat
//   --sf-* theme tokens. The template hardcodes nothing; swapping the
//   archetype re-skins the whole page.
// - buildTemplateCtas: workspace-scoped booking / intake / call hrefs.
//
// The soul/payload → template `Soul` mapper lives in r1-payload-to-template
// (added when the /w dispatch is wired) — it normalizes the r1 landing
// payload (the extracted, cleaned content) into the template data shape.

import { ARCHETYPES, type AestheticArchetypeId } from "@/lib/workspace/aesthetic-archetypes";
import { buildWorkspaceUrls } from "@/lib/billing/anonymous-workspace";
import type { CTAs, SfTheme } from "@/components/landing-templates/_contract/types";

/**
 * Map an aesthetic archetype to the template's flat SfTheme tokens.
 * Falls back to editorial-warm for unknown ids. Font families are quoted
 * with system-ui fallbacks; the actual webfonts are loaded by the host
 * theme layer (apply-theme.ts googleFontUrl helper).
 */
export function archetypeToSfTheme(archetypeId: AestheticArchetypeId): SfTheme {
  const a = ARCHETYPES[archetypeId] ?? ARCHETYPES["editorial-warm"];
  return {
    primary: a.palette.primary,
    secondary: a.palette.secondary,
    bg: a.palette.background,
    text: a.palette.text,
    border: a.palette.border,
    fontHeadline: `"${a.fonts.headline}", system-ui, sans-serif`,
    fontBody: `"${a.fonts.body}", system-ui, sans-serif`,
  };
}

/**
 * Build the workspace-scoped CTAs the template links to. `phone` (from the
 * landing content) becomes a tel: href; book/intake come from the workspace
 * URL helper so they resolve to the live booking + intake surfaces.
 */
export function buildTemplateCtas(
  slug: string,
  orgId: string,
  phone?: string | null,
): CTAs {
  const urls = buildWorkspaceUrls(
    slug,
    process.env.WORKSPACE_BASE_DOMAIN ?? "app.seldonframe.com",
    orgId,
  );
  const digits = phone ? phone.replace(/[^\d+]/g, "") : "";
  return {
    bookUrl: urls.book,
    intakeUrl: urls.intake,
    callHref: digits ? `tel:${digits}` : undefined,
  };
}
